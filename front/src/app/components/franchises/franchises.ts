import {
  ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, isDevMode, inject } from '@angular/core';
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
import { Filiale } from '../../models/organization.model';

import {
  TypeApproche, APPROCHES, OrigineFacteur, reconnaitreApproche,
  retenirFacteurFranchise, classerFacteursFranchise, grandeurValorisee,
  calculerEmissionFranchise, classeBadgeApproche, emojiApproche, libelleApproche,
  uniteApproche, EMISSIONS_PAR_SITE_AN
} from './franchises-facteur';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { periodeLisible } from '../../shared/ui/periode-lisible';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre
} from '../../shared/ui/perimetre-ecran';
import { MesuresServeurService, MesureServeur } from '../../services/mesures-serveur.service';
import { mesuresDeLEcran, ligneDeLaBase } from '../../shared/ui/mesures-en-tableau';
import { posteParId } from '../../core/nomenclature-scopes';
import { periodeDeLExercice } from '../../shared/dispatch/exercice-de-ligne';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Réseau franchisé, catégorie 14 du Scope 3. */
export interface EmissionFranchise {
  /** Ligne venue de la base : ni modifiable ni supprimable depuis cet écran. */
  lectureSeule?: boolean;
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
  franchise: string;
  localisation: string;
  approche: TypeApproche;
  provenance: Provenance;
  /** Nombre de sites, kilowattheures ou montant, selon l'approche. */
  quantite: number | null;
  unite: string;
  /** Consommation ou grandeur estimée, telle qu'elle entre dans le calcul. */
  consommationEstimee: number | null;
  facteur: number | null;
  uniteFacteur: string;
  libelleFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  /** Periode couverte par la mesure, au format ISO. */
  dateDebut: string;
  dateFin: string;
  /**
   * Societe proprietaire de la mesure.
   *
   * <p>Seul rattachement certain : le nom d'usine est une donnee de
   * saisie, et plusieurs ecrans n'en demandent aucune. Les lignes
   * anterieures n'en portent pas, et restent affichees faute de
   * pouvoir dire a qui elles appartiennent.</p>
   */
  societeId?: number | null;
  creeLe: string;
}

const MOTIF_CATEGORIE = /^Category 14:/i;
const CLE_STOCKAGE = 'listeEmissionsFranchises';
const CLE_SANS_RESEAU = 'franchisesSansReseau';
const LIBELLE_CATEGORIE = 'Franchises';
const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-franchises',
  standalone: true,
  imports: [FiltreMasseComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './franchises.html',
  styleUrl: './franchises.css'
})
export class FranchisesComponent implements OnInit {

  /** Periode d'une ligne, pour la colonne du tableau. */
  readonly periodeLisible = periodeLisible;

  listeEmissions: EmissionFranchise[] = [];
  filtreApproche = 'Toutes';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

  /**
   * Déclaration « aucun réseau de franchise sous enseigne ».
   *
   * <p>Un tableau vide se confondrait avec un oubli de collecte : la position
   * doit être consignée explicitement.</p>
   */
  sansReseau = false;

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

  readonly approches = APPROCHES;
  readonly classeBadgeApproche = classeBadgeApproche;
  readonly emojiApproche = emojiApproche;
  readonly libelleApproche = libelleApproche;
  readonly emissionsParSite = EMISSIONS_PAR_SITE_AN;

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

  /**
   * Facteur réellement appliqué, repris de la base retenue et modifiable.
   *
   * <p>Le formulaire n'exposait que le choix d'une entrée du référentiel : un
   * facteur négocié, mesuré sur site ou communiqué par un franchisé n'avait
   * aucun chemin vers la saisie, sinon la création d'une entrée au référentiel
   * pour une valeur qui ne concerne qu'une ligne.</p>
   *
   * <p>La base propose, l'exploitant arbitre : la valeur est pré-remplie au
   * choix de l'entrée, et reste éditable.</p>
   */
  facteurApplique: number | null = null;
  avertissementReferentiel = '';
  erreurInitialisation = '';
  avertissementStockage = '';

  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    reference: '',
    franchise: '',
    localisation: '',
    approche: 'Par site' as TypeApproche,
    provenance: 'Estimation' as Provenance,
    quantite: null as number | null,
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
   * Initialisation défensive : un échec est rapporté dans l'interface, jamais
   * propagé au tableau de bord dont il interromprait le rendu.
   */
  ngOnInit(): void {
    this.chargerMesuresServeur();
    try {
      this.listeEmissions = this.listeEmissions ?? [];

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
        this.sansReseau = localStorage.getItem(CLE_SANS_RESEAU) === 'true';
      }

      this.chargerFacteurs();
      this.chargerFiliales();

      this.entityService.filter$.subscribe({
        next: filtre => {
          this.societeActiveId = filtre?.entityId ?? null;
          this.exerciceActif = filtre?.year ?? null;
          this.majPerimetre();
        },
        error: () => this.signalerEchec('Périmètre organisationnel indisponible.')
      });

      if (isDevMode()) console.log('Composant Franchises initialisé avec succès');
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[franchises] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  basculerSansReseau(): void {
    this.sansReseau = !this.sansReseau;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(CLE_SANS_RESEAU, String(this.sansReseau));
    }
    this.cdr.detectChanges();
  }

  /** La déclaration contredit les lignes saisies. */
  get contradictionDeclaration(): boolean {
    return this.sansReseau && this.listeEmissions.length > 0;
  }

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 14 : les facteurs de '
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

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => { this.filiales = Array.isArray(filiales) ? filiales : []; this.majPerimetre(); },
      error: () => { this.filiales = []; this.majPerimetre(); }
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;
    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
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

  /** Exercice consulte, impose au tableau comme au tableau de bord. */
  exerciceActif: number | null = null;

  /** Perimetre organisationnel que les lignes doivent respecter. */
  /** Perimetre consulte, ouvert au gabarit pour le panneau des mesures serveur. */
  get perimetreAffiche(): PerimetreOrganisation { return this.perimetreActif; }
  private get perimetreActif(): PerimetreOrganisation {
    return perimetreOrganisation(
      this.societeActiveId, [], this.filiales.length);
  }

  /** Tri du perimetre : ce qui est retenu, et ce qui est ecarte. */
  private get triPerimetre() {
    return trierParPerimetre([...this.lignesServeur, ...this.listeEmissions], this.exerciceActif, this.perimetreActif);
  }

  /** Lignes du perimetre consulte : societe ET exercice. */
  get lignesDuPerimetre() { return this.triPerimetre.retenues; }

  get emissionsFiltrees(): EmissionFranchise[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.approche !== this.filtreMetier) return false;
      if (this.filtreApproche !== 'Toutes' && item.approche !== this.filtreApproche) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) return false;
      if (!terme) return true;
      return [item.reference, item.franchise, item.localisation, item.approche, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') return ((a.quantite ?? 0) - (b.quantite ?? 0)) * sens;
        if (this.sortColumn === 'franchise') return a.franchise.localeCompare(b.franchise) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionFranchise[] {
    const liste = this.emissionsFiltrees;
    const page = Math.min(this.pageCourante, Math.max(1, Math.ceil(liste.length / this.taillePage)));
    return liste.slice((page - 1) * this.taillePage, (page - 1) * this.taillePage + this.taillePage);
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

  onFiltreChange(): void { this.pageCourante = 1; this.cdr.detectChanges(); }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((s, e) => s + e.emissionCalculee, 0);
  }

  /** Sites franchisés couverts, toutes lignes « Par site » confondues. */
  get totalSites(): number {
    return this.emissionsFiltrees
      .filter(e => e.approche === 'Par site')
      .reduce((s, e) => s + (e.quantite ?? 0), 0);
  }

  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'ADEME').length;
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
    this.filtreApproche = 'Toutes';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionFranchise): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        reference: emission.reference,
        franchise: emission.franchise,
        localisation: emission.localisation,
        approche: emission.approche,
        provenance: emission.provenance === 'Excel' ? 'Estimation' : emission.provenance,
        quantite: emission.quantite,
        dateDebut: emission.dateDebut ?? '',
        dateFin: emission.dateFin ?? ''
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        reference: '', franchise: '', localisation: '',
        approche: 'Par site', provenance: 'Estimation', quantite: null,
        dateDebut: '',
        dateFin: ''
      };
    }

    this.majFacteursCompatibles();

    // Rouvrir une ligne doit rendre le facteur qu'elle porte, et non celui que
    // la base propose aujourd'hui : le référentiel a pu changer depuis.
    if (emission) this.facteurApplique = emission.facteur;

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void { this.modaleSaisieOuverte = false; this.cdr.detectChanges(); }

  /** Unité de la grandeur saisie : la devise du périmètre pour le monétaire. */
  get uniteCourante(): string {
    return this.formModel.approche === 'Monétaire'
      ? this.deviseActive
      : uniteApproche(this.formModel.approche);
  }

  onApprocheChange(): void { this.majFacteursCompatibles(); this.cdr.detectChanges(); }
  onSaisieChange(): void { this.cdr.detectChanges(); }
  onFacteurChoisiChange(): void {
    // Changer d'entrée du référentiel ramène sa valeur : sans cela, le facteur
    // saisi pour l'entrée précédente resterait appliqué à la nouvelle.
    this.facteurApplique = this.facteurDeLaBase.valeur;
    this.cdr.detectChanges();
  }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursFranchise(this.facteursDisponibles, {
      approche: this.formModel.approche, devise: this.deviseActive
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
    this.facteurApplique = this.facteurDeLaBase.valeur;
  }

  /**
   * Facteur retenu, base et repli compris, avant arbitrage de l'exploitant.
   */
  private get facteurDeLaBase() {
    const choisi = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId));
    if (choisi) {
      return {
        origine: 'MS SQL BDD' as OrigineFacteur, valeur: choisi.factorValue,
        unite: choisi.unit, libelle: choisi.typeName,
        reference: choisi.referenceCode, baseAppliquee: choisi.databaseSource, id: choisi.id
      };
    }
    return retenirFacteurFranchise(this.facteursDisponibles, {
      approche: this.formModel.approche, devise: this.deviseActive
    });
  }

  /**
   * Facteur effectivement appliqué au calcul et enregistré sur la ligne.
   *
   * <p>La valeur saisie prime dès qu'elle est exploitable. Zéro et le vide ne
   * la remplacent pas : ils annuleraient l'émission sans qu'aucune décision ne
   * l'ait voulu — un champ qu'on vide pour le ressaisir n'est pas un facteur
   * nul.</p>
   */
  get facteurCourant() {
    const base = this.facteurDeLaBase;
    const saisi = Number(this.facteurApplique);

    return Number.isFinite(saisi) && saisi > 0 ? { ...base, valeur: saisi } : base;
  }

  get grandeurPrevisionnelle(): number | null {
    return grandeurValorisee({
      approche: this.formModel.approche, quantite: this.formModel.quantite
    });
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionFranchise(this.grandeurPrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.franchise.trim()) return this.refuser('Le nom du franchisé ou du site est obligatoire.');
    if (m.quantite === null || m.quantite <= 0) {
      return this.refuser(m.approche === 'Par site'
        ? 'Le nombre de sites franchisés est obligatoire.'
        : m.approche === 'Monétaire'
          ? 'Le chiffre d\'affaires ou les redevances sont obligatoires.'
          : 'La consommation du réseau est obligatoire.');
    }

    const facteur = this.facteurCourant;
    const grandeur = this.grandeurPrevisionnelle;


    // Sans periode, la mesure est rattachee a son annee de saisie : une
    // donnee 2025 enregistree en 2026 disparait du bilan 2025 sans que
    // rien ne le signale. C'est la panne la plus couteuse a decouvrir tard.
    if (!m.dateDebut || !m.dateFin) {
      return this.refuser('La periode couverte est obligatoire : sans elle, la mesure serait rattachee a son annee de saisie.');
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin precede la date de debut.');
    }
    const ligne: EmissionFranchise = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      reference: m.reference.trim() || `FRA-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      franchise: m.franchise.trim(),
      localisation: m.localisation.trim(),
      approche: m.approche,
      provenance: m.provenance,
      quantite: m.quantite,
      unite: this.uniteCourante,
      consommationEstimee: grandeur,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionFranchise(grandeur, facteur.valeur),
      dateDebut: this.formModel.dateDebut,
      dateFin: this.formModel.dateFin,
      societeId: this.societeActiveId,
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
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes).`;
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

  fermerModaleImport(): void { this.modaleImportOuverte = false; this.cdr.detectChanges(); }

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
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C14FR', 'FRA-0002'),
        'Référence': 'FRA-0001', 'Franchisé': 'Réseau MISFAT Auto Nord',
        'Localisation': 'Bizerte, Tunisie', 'Approche': 'Par site', 'Quantité': 12
      },
      {
        'Référence': 'FRA-0002', 'Franchisé': 'Centre auto Sfax Centre',
        'Localisation': 'Sfax, Tunisie', 'Approche': 'Monétaire', 'Quantité': 250000
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [14, 30, 24, 16, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Franchises');
    XLSX.writeFile(classeur, 'gabarit-franchises.xlsx');
  }

  /**
   * Import de la matrice du réseau franchisé.
   *
   * <p>L'approche est reconnue depuis la cellule quand elle existe, et chaque
   * ligne est rapprochée du référentiel avec repli ADEME.</p>
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
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        if (!lignes.length) {
          this.importErreurMsg = 'Classeur vide ou sans ligne exploitable.';
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        // Le classeur ne documente pas de periode : la ligne recoit celle de
        // l'exercice consulte au moment de l'import. C'est une decision prise
        // une fois et inscrite sur la ligne, non un repli calcule a chaque
        // affichage — qui, lui, ferait remonter la meme ligne sur tous les
        // millesimes.
        const periodeImport = periodeDeLExercice(this.exerciceActif);
        let replis = 0;
        let ignorees = 0;
        const ajoutees: EmissionFranchise[] = [];

        lignes.forEach((brute, index) => {
          const valeur = (...cles: string[]) => {
            for (const cle of cles) {
              const trouve = Object.keys(brute).find(
                k => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
                     === cle.toLowerCase()
              );
              if (trouve && brute[trouve] !== null) return brute[trouve];
            }
            return null;
          };

          const franchise = String(valeur('franchise', 'nom', 'site', 'enseigne') ?? '').trim();
          const quantite = Number(String(valeur('quantite', 'valeur', 'nombre de sites', 'ca') ?? '')
            .replace(/[\s ]/g, '').replace(',', '.'));

          if (!franchise || !Number.isFinite(quantite)) { ignorees++; return; }

          const approche = reconnaitreApproche(
            String(valeur('approche', 'type approche', 'methode') ?? '')
          );

          const facteur = retenirFacteurFranchise(this.facteursDisponibles, {
            approche, devise: this.deviseActive
          });
          if (facteur.origine === 'ADEME') replis++;

          const grandeur = grandeurValorisee({ approche, quantite });

          ajoutees.push({
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            reference: String(valeur('reference', 'id', 'code') ?? '').trim()
              || `FRA-${String(index + 1).padStart(4, '0')}`,
            franchise,
            localisation: String(valeur('localisation', 'ville', 'pays', 'region') ?? '').trim(),
            approche,
            provenance: 'Excel',
            quantite,
            unite: approche === 'Monétaire' ? this.deviseActive : uniteApproche(approche),
            consommationEstimee: grandeur,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionFranchise(grandeur, facteur.valeur),
            dateDebut: periodeImport.dateDebut,
            dateFin: periodeImport.dateFin,
            societeId: this.societeActiveId,
            creeLe: horodatage
          });
        });

        if (!ajoutees.length) {
          this.importErreurMsg = 'Aucune ligne exploitable : les colonnes Franchisé et '
            + 'Quantité sont attendues.';
          this.cdr.detectChanges();
          return;
        }

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} franchises effectuée avec succès !`;
        this.toastSecondaire = replis
          ? `${replis} ligne(s) valorisée(s) par un facteur de repli ADEME.`
          : '';
        this.importErreurMsg = ignorees ? `${ignorees} ligne(s) écartée(s).` : '';

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
      'Franchise / Site': e.franchise,
      'Localisation': e.localisation,
      'Approche': e.approche,
      'Nombre de sites / CA': e.quantite,
      'Unite': e.unite,
      'Consommation estimee': e.consommationEstimee,
      'Provenance': e.provenance,
      'Facteur': e.facteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Franchises');
    XLSX.writeFile(classeur, `franchises-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    const MARQUEUR = marqueurEcran('franchises');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionFranchise>({
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


  // ---------- Mesures de la base ----------

  private readonly mesuresServeurService = inject(MesuresServeurService);

  /** Mesures que la base porte pour cet écran. */
  private mesuresServeur: MesureServeur[] = [];

  /** Intitulé de repli si la nomenclature ne nomme pas ce poste. */
  private readonly CATEGORIE_REPLI = 'franchises';

  /**
   * Charge les mesures de la base.
   *
   * <p>Le serveur muet ne doit pas vider le tableau : les saisies locales
   * restent affichées, seules les mesures de la base manquent.</p>
   */
  private chargerMesuresServeur(): void {
    this.mesuresServeurService.mesures().subscribe({
      next: mesures => { this.mesuresServeur = mesures; this.cdr.markForCheck(); },
      error: () => { this.mesuresServeur = []; this.cdr.markForCheck(); }
    });
  }

  /**
   * Mesures de la base, converties en lignes du tableau.
   *
   * <p>Elles s'affichaient dans un panneau séparé qui annonçait « N mesure(s)
   * enregistrée(s) en base » au-dessus d'un tableau disant « aucune donnée » :
   * deux vues de la même donnée, qui se contredisaient.</p>
   */
  get lignesServeur(): EmissionFranchise[] {
    return mesuresDeLEcran(
      this.mesuresServeur, { numeroGhg: 14 }, this.exerciceActif, this.perimetreAffiche
    ).map(m => ligneDeLaBase(m, posteParId('franchises')?.libelle ?? this.CATEGORIE_REPLI) as unknown as EmissionFranchise);
  }

}
