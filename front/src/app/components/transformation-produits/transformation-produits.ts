import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import {
  Rapprochement, adaptateurStandard, remigrerLignes, libelleRapprochement,
  migrationFaite, marquerMigration, messagePourMigration
} from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';

import { lireClasseurTransformation } from './transformation-excel';
import {
  TypeProcede, PROCEDES, TypeSaisie, UNITES_PAR_SAISIE, OrigineFacteur,
  retenirFacteurProcede, classerFacteursProcede, grandeurValorisee, uniteValorisee,
  calculerEmissionProcede, normaliserUnite, classeBadgeProcede, emojiProcede,
  MASSE_PAR_UNITE
} from './transformation-facteur';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Produit intermédiaire transformé, catégorie 10 du Scope 3. */
export interface EmissionTransformation {
  /**
   * Code article de l'ERP, second degré de rapprochement.
   *
   * <p>Le référentiel et l'ERP partagent parfois la même codification : le
   * code désigne alors le facteur aussi sûrement que la référence.</p>
   */
  codeArticle?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
  id: number;
  scope: string;
  categorie: string;
  reference: string;
  produit: string;
  client: string;
  procede: TypeProcede | null;
  procedeTexte: string;
  provenance: Provenance;
  typeSaisie: TypeSaisie;
  quantite: number | null;
  unite: string;
  /** Grandeur valorisée, masse déjà ramenée au kilogramme le cas échéant. */
  grandeur: number | null;
  uniteGrandeur: string;
  facteur: number | null;
  uniteFacteur: string;
  libelleFacteur: string;
  referenceFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  creeLe: string;
}

/** Catégorie GHG couverte : transformation des produits vendus. */
const MOTIF_CATEGORIE = /^Category 10:/i;

const CLE_STOCKAGE = 'listeEmissionsTransformation';
const CLE_NON_APPLICABLE = 'transformationNonApplicable';

const LIBELLE_CATEGORIE = 'Transformation des produits vendus';

const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-transformation-produits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './transformation-produits.html',
  styleUrl: './transformation-produits.css'
})
export class TransformationProduitsComponent implements OnInit {

  listeEmissions: EmissionTransformation[] = [];
  filtreProcede = 'Tous';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

  /**
   * Déclaration « catégorie non applicable ».
   *
   * <p>Une entreprise qui ne vend que des produits finis n'a rien à déclarer
   * ici : la position doit être consignée explicitement, faute de quoi un
   * tableau vide se confondrait avec un oubli de collecte.</p>
   */
  nonApplicable = false;

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  readonly taillesPage = TAILLES_PAGE;
  taillePage = TAILLES_PAGE[0];
  pageCourante = 1;

  modaleSaisieOuverte = false;
  modaleImportOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;
  messageErreur = '';

  fichierSelectionne: File | null = null;
  importErreurMsg = '';
  toastMessage = '';
  toastSecondaire = '';

  readonly procedes = PROCEDES;
  readonly classeBadgeProcede = classeBadgeProcede;
  readonly emojiProcede = emojiProcede;
  readonly masseParUnite = MASSE_PAR_UNITE;

  // ---------- Référentiel carbone ----------
  facteursDisponibles: FacteurDetaille[] = [];

  /**
   * Compte rendu de la migration d'appariement.
   *
   * <p>Distinct de l'avertissement sur le référentiel, que le chargement
   * réécrit juste après : les deux messages se seraient effacés l'un
   * l'autre.</p>
   */
  messageMigration = '';
  facteursCompatibles: FacteurDetaille[] = [];
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  erreurInitialisation = '';
  avertissementStockage = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    reference: '',
    produit: '',
    client: '',
    procede: 'Assemblage Mécanique' as TypeProcede,
    provenance: 'Réel' as Provenance,
    typeSaisie: 'Masse' as TypeSaisie,
    quantite: null as number | null,
    unite: 'kg'
  };

  constructor(
    private datePipe: DatePipe,
    private referentialService: ReferentialService,
    private organizationService: OrganizationService,
    private entityService: EntityContextService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /**
   * Initialisation défensive.
   *
   * <p>Une exception levée ici remonterait au tableau de bord et interromprait
   * son rendu : l'échec est rapporté dans l'interface, jamais propagé.</p>
   */
  ngOnInit(): void {
    try {
      if (isPlatformBrowser(this.platformId)) {
        const sauvegarde = localStorage.getItem(CLE_STOCKAGE);
        if (sauvegarde) {
          try {
            const relu = JSON.parse(sauvegarde);
            this.listeEmissions = Array.isArray(relu) ? relu : [];
          } catch {
            this.listeEmissions = [];
          }
        }
        this.nonApplicable = localStorage.getItem(CLE_NON_APPLICABLE) === 'true';
      }

      this.chargerFacteurs();
      this.chargerFiliales();

      this.entityService.filter$.subscribe({
        next: filtre => {
          this.societeActiveId = filtre?.entityId ?? null;
          this.majPerimetre();
        },
        error: () => this.signalerEchec('Périmètre organisationnel indisponible.')
      });
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[transformation-produits] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  // ---------- Déclaration de non-applicabilité ----------

  basculerNonApplicable(): void {
    this.nonApplicable = !this.nonApplicable;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(CLE_NON_APPLICABLE, String(this.nonApplicable));
    }
    this.cdr.detectChanges();
  }

  /**
   * La déclaration contredit les lignes saisies.
   *
   * <p>Déclarer la catégorie sans objet tout en y consignant des
   * transformations laisserait un bilan incohérent : le signaler vaut mieux que
   * trancher à la place de l'utilisateur.</p>
   */
  get contradictionDeclaration(): boolean {
    return this.nonApplicable && this.listeEmissions.length > 0;
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 10 : les facteurs de '
            + 'repli ADEME sont appliqués. Versez la base pour les remplacer.';
        this.majFacteursCompatibles();
        this.cdr.detectChanges();
      },
      error: () => {
        this.avertissementReferentiel = 'Référentiel carbone injoignable (port 8082) : '
          + 'les facteurs de repli ADEME sont appliqués.';
        this.cdr.detectChanges();
      }
    });
  }

  // ---------- Périmètre ----------

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = Array.isArray(filiales) ? filiales : [];
        this.majPerimetre();
      },
      error: () => {
        this.filiales = [];
        this.majPerimetre();
      }
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    this.cdr.detectChanges();
  }

  // ---------- Tableau et pagination ----------

  get emissionsFiltrees(): EmissionTransformation[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      if (this.filtreProcede !== 'Tous' && item.procede !== this.filtreProcede) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.reference, item.produit, item.client,
              item.procede ?? '', item.procedeTexte, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') return ((a.quantite ?? 0) - (b.quantite ?? 0)) * sens;
        if (this.sortColumn === 'reference') return a.reference.localeCompare(b.reference) * sens;
        if (this.sortColumn === 'produit') return a.produit.localeCompare(b.produit) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionTransformation[] {
    const liste = this.emissionsFiltrees;
    const page = Math.min(this.pageCourante, Math.max(1, Math.ceil(liste.length / this.taillePage)));
    const debut = (page - 1) * this.taillePage;
    return liste.slice(debut, debut + this.taillePage);
  }

  get premierIndexPage(): number {
    return this.emissionsFiltrees.length ? (this.pageCourante - 1) * this.taillePage + 1 : 0;
  }

  get dernierIndexPage(): number {
    return Math.min(this.pageCourante * this.taillePage, this.emissionsFiltrees.length);
  }

  allerPage(page: number): void {
    this.pageCourante = Math.min(Math.max(1, page), this.nombrePages);
    this.cdr.detectChanges();
  }

  changerTaillePage(): void {
    this.taillePage = Number(this.taillePage);
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  onFiltreChange(): void {
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'ADEME').length;
  }

  get nombreSansFacteur(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'Aucun').length;
  }

  sortData(colonne: string): void {
    if (this.sortColumn === colonne) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = colonne;
      this.sortDirection = 'desc';
    }
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  reinitialiserFiltres(): void {
    this.filtreProcede = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionTransformation): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        reference: emission.reference,
        produit: emission.produit,
        client: emission.client,
        procede: emission.procede ?? 'Assemblage Mécanique',
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        typeSaisie: emission.typeSaisie,
        quantite: emission.quantite,
        unite: emission.unite
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        reference: '',
        produit: '',
        client: '',
        procede: 'Assemblage Mécanique',
        provenance: 'Réel',
        typeSaisie: 'Masse',
        quantite: null,
        unite: 'kg'
      };
    }

    this.majFacteursCompatibles();
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  /** Unités proposées, dictées par l'approche retenue. */
  get unitesDisponibles(): string[] {
    return UNITES_PAR_SAISIE[this.formModel.typeSaisie] ?? [];
  }

  /** L'approche commande l'unité : la première de l'approche fait foi. */
  onTypeSaisieChange(): void {
    const unites = this.unitesDisponibles;
    if (!unites.includes(this.formModel.unite)) {
      this.formModel.unite = unites[0] ?? '';
    }
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onCritereChange(): void {
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursProcede(this.facteursDisponibles, {
      procede: this.formModel.procede,
      unite: this.formModel.unite,
      monetaire: this.formModel.typeSaisie === 'Monétaire'
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
  }

  onFacteurChoisiChange(): void {
    this.cdr.detectChanges();
  }

  /** Facteur qui sera appliqué à la saisie en cours. */
  get facteurCourant() {
    const choisi = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId));
    if (choisi) {
      return {
        origine: 'MS SQL BDD' as OrigineFacteur,
        valeur: choisi.factorValue,
        unite: choisi.unit,
        libelle: choisi.typeName,
        reference: choisi.referenceCode,
        baseAppliquee: choisi.databaseSource,
        id: choisi.id
      };
    }
    return retenirFacteurProcede(this.facteursDisponibles, {
      procede: this.formModel.procede,
      unite: this.formModel.unite,
      monetaire: this.formModel.typeSaisie === 'Monétaire'
    });
  }

  private get sourceCalcul() {
    return {
      procede: this.formModel.procede,
      quantite: this.formModel.quantite,
      unite: this.formModel.unite,
      monetaire: this.formModel.typeSaisie === 'Monétaire'
    };
  }

  /** Grandeur effectivement valorisée par la saisie en cours. */
  get grandeurPrevisionnelle(): number | null {
    return grandeurValorisee(this.sourceCalcul);
  }

  get uniteGrandeurCourante(): string {
    return uniteValorisee(this.sourceCalcul);
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionProcede(this.grandeurPrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.produit.trim()) {
      return this.refuser('La désignation du composant ou produit est obligatoire.');
    }
    if (m.quantite === null || m.quantite < 0) {
      return this.refuser('La quantité est obligatoire.');
    }
    if (!m.unite) {
      return this.refuser('L\'unité est obligatoire.');
    }

    const facteur = this.facteurCourant;
    const grandeur = this.grandeurPrevisionnelle;

    const ligne: EmissionTransformation = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      reference: m.reference.trim() || `TRF-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      produit: m.produit.trim(),
      client: m.client.trim(),
      procede: m.procede,
      procedeTexte: m.procede,
      provenance: m.provenance,
      typeSaisie: m.typeSaisie,
      quantite: m.quantite,
      unite: normaliserUnite(m.unite),
      grandeur,
      uniteGrandeur: this.uniteGrandeurCourante,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      referenceFacteur: facteur.reference,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionProcede(grandeur, facteur.valeur),
      creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? ''
    };

    if (this.isEdition && this.idEditionActive !== null) {
      const index = this.listeEmissions.findIndex(e => e.id === this.idEditionActive);
      if (index >= 0) this.listeEmissions[index] = ligne;
    } else {
      this.listeEmissions = [ligne, ...this.listeEmissions];
    }

    this.sauvegarder();
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  private refuser(message: string): void {
    this.erreurFormulaire = true;
    this.messageErreur = message;
    this.cdr.detectChanges();
  }

  supprimerEmission(id: number): void {
    this.listeEmissions = this.listeEmissions.filter(e => e.id !== id);
    this.sauvegarder();
    this.cdr.detectChanges();
  }

  private sauvegarder(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(this.listeEmissions));
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes). `
        + 'Les lignes restent affichées mais ne seront pas conservées à la fermeture.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Import ----------

  ouvrirModaleImport(): void {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport(): void {
    this.modaleImportOuverte = false;
    this.cdr.detectChanges();
  }

  onFichierChange(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    this.fichierSelectionne = input.files?.[0] ?? null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerToast(): void {
    this.toastMessage = '';
    this.toastSecondaire = '';
    this.cdr.detectChanges();
  }

  telechargerGabarit(): void {
    const exemples = [
      {
        'Référence': 'TRF-0001', 'Nom Produit': 'Composants métalliques',
        'Client': 'MECAFILTER SAS', 'Type Transformation': 'Usinage',
        'Type Saisie': 'Masse', 'Quantité': 5000, 'Unité': 'kg'
      },
      {
        'Référence': 'TRF-0002', 'Nom Produit': 'Boîtiers plastiques semi-finis',
        'Client': 'MECAFILTER SAS', 'Type Transformation': 'Moulage',
        'Type Saisie': 'Masse', 'Quantité': 2, 'Unité': 'Tonnes'
      },
      {
        'Référence': 'TRF-0003', 'Nom Produit': 'Filtres prêts au montage',
        'Client': 'FORD-WERKE GMBH', 'Type Transformation': 'Produit Fini',
        'Type Saisie': 'Masse', 'Quantité': 50000, 'Unité': 'Unités'
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [14, 34, 24, 22, 14, 14, 12].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Transformation');
    XLSX.writeFile(classeur, 'gabarit-transformation-produits.xlsx');
  }

  /**
   * Import de la matrice de transformation.
   *
   * <p>Les colonnes optionnelles absentes reçoivent leur valeur par défaut, et
   * chaque produit est rapproché du référentiel MS SQL, avec repli ADEME quand
   * le procédé n'y figure pas.</p>
   */
  importerFichier(): void {
    if (!this.fichierSelectionne) {
      this.importErreurMsg = 'Sélectionnez un fichier .xlsx.';
      this.cdr.detectChanges();
      return;
    }

    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        const classeur = XLSX.read(lecteur.result, { type: 'array', cellDates: true });
        const resultat = lireClasseurTransformation(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille de transformation reconnue : les colonnes '
            + 'Nom Produit, Type Procédé, Quantité et Unité sont attendues.';
          this.cdr.detectChanges();
          return;
        }
        if (resultat.colonnesManquantes.length) {
          this.importErreurMsg = resultat.avertissement;
          this.cdr.detectChanges();
          return;
        }
        if (!resultat.lignes.length) {
          this.importErreurMsg = `Feuille « ${resultat.feuille} » sans produit exploitable.`;
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let replis = 0;
        let sansFacteur = 0;
        let procedesInconnus = 0;

        const ajoutees: EmissionTransformation[] = resultat.lignes.map((brute, index) => {
          if (!brute.procede) procedesInconnus++;

          const facteur = brute.procede
            ? retenirFacteurProcede(this.facteursDisponibles, {
                procede: brute.procede, unite: brute.unite,
                monetaire: brute.typeSaisie === 'Monétaire'
              })
            : { origine: 'Aucun' as OrigineFacteur, valeur: null, unite: '', libelle: '',
                reference: '', baseAppliquee: '', id: null };

          if (facteur.origine === 'ADEME') replis++;
          if (facteur.origine === 'Aucun') sansFacteur++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            reference: brute.reference,
            produit: brute.produit,
            client: brute.client,
            procede: brute.procede,
            procedeTexte: brute.procedeTexte,
            provenance: 'Excel' as Provenance,
            typeSaisie: brute.typeSaisie,
            quantite: brute.quantite,
            unite: brute.unite,
            grandeur: brute.grandeur,
            uniteGrandeur: brute.uniteGrandeur,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            referenceFacteur: facteur.reference,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionProcede(brute.grandeur, facteur.valeur),
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} transformations effectuée avec succès !`;
        this.toastSecondaire = replis
          ? `${replis} ligne(s) valorisée(s) par un facteur de repli ADEME, `
            + 'faute de facteur correspondant au référentiel MS SQL.'
          : '';

        const details: string[] = [];
        if (procedesInconnus) details.push(`${procedesInconnus} procédé(s) non reconnu(s)`);
        if (sansFacteur) details.push(`${sansFacteur} ligne(s) sans facteur applicable`);
        if (resultat.rejets.length) details.push(`${resultat.rejets.length} ligne(s) écartée(s)`);
        this.importErreurMsg = details.join(' · ');

        this.modaleImportOuverte = false;
        this.cdr.detectChanges();
      } catch (erreur) {
        this.importErreurMsg = 'Fichier illisible : '
          + (erreur instanceof Error ? erreur.message : 'vérifiez qu\'il s\'agit d\'un classeur .xlsx.');
        this.cdr.detectChanges();
      }
    };
    lecteur.readAsArrayBuffer(this.fichierSelectionne);
  }

  exporterExcel(): void {
    const donnees = this.emissionsFiltrees.map(e => ({
      'Reference': e.reference,
      'Composant / Produit': e.produit,
      'Client / Secteur': e.client,
      'Type de procede': e.procede ?? e.procedeTexte,
      'Type saisie': e.typeSaisie,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Grandeur valorisee': e.grandeur,
      'Unite grandeur': e.uniteGrandeur,
      'Provenance': e.provenance,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Transformation');
    XLSX.writeFile(classeur, `transformation-produits-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Rejoue l'appariement sur les lignes déjà enregistrées.
   *
   * <p>Les lignes antérieures à l'appariement à trois degrés ont été rattachées
   * au premier facteur venu de leur catégorie. Cette migration les confronte à
   * nouveau au référentiel : celle qui porte sa référence carbone retrouve son
   * facteur exact et sa base documentaire réelle.</p>
   *
   * <p>Elle ne s'exécute qu'une fois, et rien n'est écrasé qui ne s'améliore.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = 'misfat_ref_matching_v2_transformation_produits';
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionTransformation>({
      reference: 'reference',
      codeArticle: 'codeArticle',
      categorie: 'categorie',
      facteur: 'facteur',
      base: 'baseAppliquee',
      uniteFacteur: 'uniteFacteur',
      emission: 'emissionCalculee',
      rapprochement: 'rapprochement'
      })
    );

    if (corrigees) {
      this.listeEmissions = lignes;
      this.sauvegarder();
      this.messageMigration = messagePourMigration(corrigees);
    }

    marquerMigration(MARQUEUR);
  }

  /** Intitulé du degré de rapprochement, pour l'infobulle du tableau. */
  libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
    return libelleRapprochement(rapprochement);
  }

}
