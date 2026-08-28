import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { colonnesIdentite } from '../../core/colonnes-identite';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import {
  Rapprochement, adaptateurStandard, remigrerLignes, libelleRapprochement,
  migrationFaite, marquerMigration, messagePourMigration, marqueurEcran
} from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';

import { lireClasseurActifs } from './actifs-excel';
import {
  TypeActif, TYPES_ACTIF, ModeSaisie, MODES_SAISIE, EnergieBatiment,
  UNITES_PAR_MODE, OrigineFacteur, retenirFacteurActif, classerFacteursActif,
  quantiteAjustee, uniteAjustee, calculerEmissionActif, normaliserUnite,
  classeBadgeActif, emojiActif, KWH_PAR_M2_AN,
  RATIO_OCCUPATION_DEFAUT, ETABLISSEMENT_DEFAUT
} from './actifs-facteur';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { periodeLisible } from '../../shared/ui/periode-lisible';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Actif loué en amont, catégorie 8 du Scope 3. */
export interface EmissionActifLoue {
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
  designation: string;
  typeActif: TypeActif | null;
  typeTexte: string;
  etablissement: string;
  provenance: Provenance;
  modeSaisie: ModeSaisie;
  energie: EnergieBatiment;
  quantite: number | null;
  unite: string;
  /** Quantité imputable, surface déjà convertie en kWh le cas échéant. */
  quantiteAjustee: number | null;
  uniteAjustee: string;
  ratioOccupation: number;
  periode: string;
  facteur: number | null;
  uniteFacteur: string;
  libelleFacteur: string;
  referenceFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  /** Periode couverte par la mesure, au format ISO. */
  dateDebut: string;
  dateFin: string;
  creeLe: string;
}

/** Catégorie GHG couverte : actifs loués en amont. */
const MOTIF_CATEGORIE = /^Category 8:/i;

const CLE_STOCKAGE = 'listeEmissionsActifsLoues';

const LIBELLE_CATEGORIE = 'Actifs loués en amont';

const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-actifs-loues-amont',
  standalone: true,
  imports: [FiltreMasseComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './actifs-loues-amont.html',
  styleUrl: './actifs-loues-amont.css'
})
export class ActifsLouesAmontComponent implements OnInit {

  /** Periode d'une ligne, pour la colonne du tableau. */
  readonly periodeLisible = periodeLisible;

  listeEmissions: EmissionActifLoue[] = [];
  filtreEtablissement = 'Tous';
  filtreType = 'Tous';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

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
  /** Notification de succès affichée après un import. */
  toastMessage = '';
  /** Notification d'avertissement : application d'un facteur de repli. */
  toastSecondaire = '';

  readonly typesActif = TYPES_ACTIF;
  readonly modesSaisie = MODES_SAISIE;
  readonly classeBadgeActif = classeBadgeActif;
  readonly emojiActif = emojiActif;
  readonly kwhParM2 = KWH_PAR_M2_AN;

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
  /** Renseigné quand le stockage local a refusé le volume importé. */
  avertissementStockage = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';

  formModel = {
    reference: '',
    designation: '',
    typeActif: 'Bâtiment' as TypeActif,
    etablissement: ETABLISSEMENT_DEFAUT,
    provenance: 'Réel' as Provenance,
    modeSaisie: 'Consommation' as ModeSaisie,
    energie: 'Électricité' as EnergieBatiment,
    quantite: null as number | null,
    unite: 'kWh',
    ratioOccupation: RATIO_OCCUPATION_DEFAUT,
    periode: String(new Date().getFullYear()),
    dateDebut: '',
    dateFin: ''
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
    console.error('[actifs-loues-amont] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        // Un référentiel vide n'empêche pas la saisie : les replis ADEME
        // prennent le relais, en le signalant.
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 8 : les facteurs de '
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
    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    if (this.filtreEtablissement !== 'Tous'
        && !this.usinesDisponibles.some(u => u.nom === this.filtreEtablissement)) {
      this.filtreEtablissement = 'Tous';
    }
    this.cdr.detectChanges();
  }

  // ---------- Tableau et pagination ----------

  /**
   * Filtre métier, aligné sur la liste déroulante de la saisie manuelle.
   *
   * <p>Chaque écran filtre selon ce qu'il documente : imposer une dimension
   * commune reviendrait à proposer un critère étranger à la moitié d'entre
   * eux.</p>
   */
  filtreMetier = 'Tous';

  /** Champs que la reprise en masse écrit sur chaque ligne de cet écran. */
  readonly champsMasse = {
    grandeur: 'quantite', facteur: 'facteur',
    emission: 'emissionCalculee', base: 'baseAppliquee'
  };

  /**
   * Prend acte d'une reprise en masse.
   *
   * <p>Seules les lignes saisies sont réécrites : les lignes ventilées
   * appartiennent au magasin de répartition, qui les recalcule à chaque
   * import.</p>
   */
  reprendreEnMasse(evenement: { avant: any[]; apres: any[] }): void {
    const reprises = new Map(evenement.avant.map((l, rang) => [l, evenement.apres[rang]]));
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarder();
  }

  get emissionsFiltrees(): EmissionActifLoue[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.typeActif !== this.filtreMetier) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (this.filtreType !== 'Tous' && item.typeActif !== this.filtreType) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.reference, item.designation, item.typeActif ?? '', item.typeTexte,
              item.etablissement, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') {
          return ((a.quantite ?? 0) - (b.quantite ?? 0)) * sens;
        }
        if (this.sortColumn === 'reference') return a.reference.localeCompare(b.reference) * sens;
        if (this.sortColumn === 'designation') return a.designation.localeCompare(b.designation) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionActifLoue[] {
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
    this.filtreEtablissement = 'Tous';
    this.filtreType = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionActifLoue): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        reference: emission.reference,
        designation: emission.designation,
        typeActif: emission.typeActif ?? 'Bâtiment',
        etablissement: emission.etablissement,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        modeSaisie: emission.modeSaisie,
        energie: emission.energie,
        quantite: emission.quantite,
        unite: emission.unite,
        ratioOccupation: emission.ratioOccupation,
        periode: emission.periode,
        dateDebut: emission.dateDebut ?? '',
        dateFin: emission.dateFin ?? ''
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        reference: '',
        designation: '',
        typeActif: 'Bâtiment',
        etablissement: this.usinesDisponibles.length === 1
          ? this.usinesDisponibles[0].nom
          : ETABLISSEMENT_DEFAUT,
        provenance: 'Réel',
        modeSaisie: 'Consommation',
        energie: 'Électricité',
        quantite: null,
        unite: 'kWh',
        ratioOccupation: RATIO_OCCUPATION_DEFAUT,
        periode: String(new Date().getFullYear()),
        dateDebut: '',
        dateFin: ''
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

  /** Unités proposées, dictées par le mode de saisie retenu. */
  get unitesDisponibles(): string[] {
    return UNITES_PAR_MODE[this.formModel.modeSaisie] ?? [];
  }

  /** Le mode de saisie commande l'unité : la première du mode fait foi. */
  onModeSaisieChange(): void {
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

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursActif(this.facteursDisponibles, {
      type: this.formModel.typeActif,
      unite: this.formModel.unite,
      energie: this.formModel.energie
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
  }

  onFacteurChoisiChange(): void {
    this.cdr.detectChanges();
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  /** Le bâtiment est le seul type dont l'énergie desservante change le facteur. */
  get afficherEnergie(): boolean {
    return this.formModel.typeActif === 'Bâtiment'
      && (this.formModel.modeSaisie === 'Consommation' || this.formModel.modeSaisie === 'Surface');
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
    return retenirFacteurActif(this.facteursDisponibles, {
      type: this.formModel.typeActif,
      unite: this.formModel.unite,
      energie: this.formModel.energie
    });
  }

  /** Quantité imputable de la saisie en cours. */
  get quantiteAjusteePrevisionnelle(): number | null {
    return quantiteAjustee({
      mode: this.formModel.modeSaisie,
      quantite: this.formModel.quantite,
      ratioOccupation: this.formModel.ratioOccupation
    });
  }

  get uniteAjusteeCourante(): string {
    return uniteAjustee(this.formModel.modeSaisie, this.formModel.unite);
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionActif(this.quantiteAjusteePrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.designation.trim()) {
      return this.refuser('La désignation de l\'actif est obligatoire.');
    }
    if (m.quantite === null || m.quantite <= 0) {
      return this.refuser('La quantité ou la valeur est obligatoire.');
    }
    if (!m.unite) {
      return this.refuser('L\'unité est obligatoire.');
    }

    const facteur = this.facteurCourant;
    const ajustee = this.quantiteAjusteePrevisionnelle;


    // Sans periode, la mesure est rattachee a son annee de saisie : une
    // donnee 2025 enregistree en 2026 disparait du bilan 2025 sans que
    // rien ne le signale. C'est la panne la plus couteuse a decouvrir tard.
    if (!m.dateDebut || !m.dateFin) {
      return this.refuser('La periode couverte est obligatoire : sans elle, la mesure serait rattachee a son annee de saisie.');
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin precede la date de debut.');
    }
    const ligne: EmissionActifLoue = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      reference: m.reference.trim() || `ACT-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      designation: m.designation.trim(),
      typeActif: m.typeActif,
      typeTexte: m.typeActif,
      etablissement: m.etablissement || ETABLISSEMENT_DEFAUT,
      provenance: m.provenance,
      modeSaisie: m.modeSaisie,
      energie: m.energie,
      quantite: m.quantite,
      unite: normaliserUnite(m.unite),
      quantiteAjustee: ajustee,
      uniteAjustee: this.uniteAjusteeCourante,
      ratioOccupation: m.ratioOccupation || RATIO_OCCUPATION_DEFAUT,
      periode: m.periode,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      referenceFacteur: facteur.reference,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionActif(ajustee, facteur.valeur),
      dateDebut: this.formModel.dateDebut,
      dateFin: this.formModel.dateFin,
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
      if (!enregistrerLignes(CLE_STOCKAGE, this.listeEmissions)) throw new Error('stockage refuse');
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} actifs). `
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
    const annee = String(new Date().getFullYear());
    const usine = this.usinesDisponibles[0]?.nom ?? ETABLISSEMENT_DEFAUT;

    const exemples = [
      {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C8LA', 'ACT-0012'),
        'Référence': 'ACT-0001', 'Désignation Actif': 'Plateau bureaux Tunis',
        'Type d\'Actif': 'Bâtiment', 'Établissement': usine,
        'Mode Calcul': 'Surface en m²', 'Quantité': 300, 'Unité': 'm²',
        'Période': annee, 'Ratio Occupation': 100
      },
      {
        'Référence': 'ACT-0002', 'Désignation Actif': 'Flotte commerciale en leasing',
        'Type d\'Actif': 'Véhicule Leasing', 'Établissement': usine,
        'Mode Calcul': 'Consommation', 'Quantité': 45000, 'Unité': 'km',
        'Période': annee, 'Ratio Occupation': 100
      },
      {
        'Référence': 'ACT-0003', 'Désignation Actif': 'Hébergement serveurs cloud',
        'Type d\'Actif': 'Informatique', 'Établissement': usine,
        'Mode Calcul': 'Monétaire', 'Quantité': 18000, 'Unité': 'TND',
        'Période': annee, 'Ratio Occupation': 100
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [14, 32, 20, 18, 18, 14, 10, 12, 18].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Actifs loués');
    XLSX.writeFile(classeur, 'gabarit-actifs-loues-amont.xlsx');
  }

  /**
   * Import de la matrice des actifs loués.
   *
   * <p>Les colonnes optionnelles absentes reçoivent leur valeur par défaut, et
   * chaque actif est rapproché du référentiel MS SQL, avec repli ADEME quand la
   * combinaison type et unité n'y figure pas.</p>
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
        const resultat = lireClasseurActifs(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille d\'actifs reconnue : les colonnes Désignation, '
            + 'Type d\'Actif, Quantité et Unité sont attendues.';
          this.cdr.detectChanges();
          return;
        }
        if (resultat.colonnesManquantes.length) {
          this.importErreurMsg = resultat.avertissement;
          this.cdr.detectChanges();
          return;
        }
        if (!resultat.lignes.length) {
          this.importErreurMsg = `Feuille « ${resultat.feuille} » sans actif exploitable.`;
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let replis = 0;
        let sansFacteur = 0;
        let typesInconnus = 0;

        const ajoutees: EmissionActifLoue[] = resultat.lignes.map((brute, index) => {
          if (!brute.typeActif) typesInconnus++;

          const facteur = brute.typeActif
            ? retenirFacteurActif(this.facteursDisponibles, {
                type: brute.typeActif, unite: brute.unite, energie: 'Électricité'
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
            designation: brute.designation,
            typeActif: brute.typeActif,
            typeTexte: brute.typeTexte,
            etablissement: brute.etablissement,
            provenance: 'Excel' as Provenance,
            modeSaisie: brute.modeSaisie,
            energie: 'Électricité' as EnergieBatiment,
            quantite: brute.quantite,
            unite: brute.unite,
            quantiteAjustee: brute.quantiteAjustee,
            uniteAjustee: uniteAjustee(brute.modeSaisie, brute.unite),
            ratioOccupation: brute.ratioOccupation,
            periode: brute.periode,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            referenceFacteur: facteur.reference,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionActif(brute.quantiteAjustee, facteur.valeur),
            dateDebut: '',
            dateFin: '',
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} actifs loués effectuée avec succès !`;
        // Un repli n'est pas une donnée documentée : le dire au moment où il
        // est appliqué, et non seulement dans un bandeau qu'on peut manquer.
        this.toastSecondaire = replis
          ? `${replis} actif(s) valorisé(s) par un facteur de repli ADEME, `
            + 'faute de facteur correspondant au référentiel MS SQL.'
          : '';

        const details: string[] = [];
        if (replis) details.push(`${replis} actif(s) valorisé(s) par un facteur de repli ADEME`);
        if (typesInconnus) details.push(`${typesInconnus} type(s) d'actif non reconnu(s)`);
        if (sansFacteur) details.push(`${sansFacteur} actif(s) sans facteur applicable`);
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
      'Designation actif': e.designation,
      'Type d actif': e.typeActif ?? e.typeTexte,
      'Etablissement': e.etablissement,
      'Provenance': e.provenance,
      'Type saisie': e.modeSaisie,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Ratio occupation (%)': e.ratioOccupation,
      'Quantite ajustee': e.quantiteAjustee,
      'Unite ajustee': e.uniteAjustee,
      'Periode': e.periode,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Actifs loués');
    XLSX.writeFile(classeur, `actifs-loues-amont-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    const MARQUEUR = marqueurEcran('actifs_loues_amont');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionActifLoue>({
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
