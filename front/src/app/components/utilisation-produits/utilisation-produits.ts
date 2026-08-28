import {
  ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, isDevMode
} from '@angular/core';
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

import { lireClasseurUtilisation } from './utilisation-excel';
import {
  GammeProduit, GAMMES, TypeSaisie, OrigineFacteur,
  retenirFacteurGamme, classerFacteursGamme, grandeurValorisee, uniteValorisee,
  calculerEmissionUsage, classeBadgeGamme, emojiGamme,
  DUREE_VIE_DEFAUT_KM, ETABLISSEMENT_DEFAUT
} from './utilisation-facteur';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { periodeLisible } from '../../shared/ui/periode-lisible';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Produit vendu en phase d'utilisation, catégorie 11 du Scope 3. */
export interface EmissionUtilisation {
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
  gamme: GammeProduit | null;
  gammeTexte: string;
  etablissement: string;
  provenance: Provenance;
  typeSaisie: TypeSaisie;
  quantiteVendue: number | null;
  dureeVieKm: number;
  montant: number | null;
  devise: string;
  /** Grandeur valorisée : kilométrage total couvert ou montant facturé. */
  grandeur: number | null;
  uniteGrandeur: string;
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

/** Catégorie GHG couverte : utilisation des produits vendus. */
const MOTIF_CATEGORIE = /^Category 11:/i;

const CLE_STOCKAGE = 'listeEmissionsUtilisation';

const LIBELLE_CATEGORIE = 'Utilisation des produits vendus';

const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-utilisation-produits',
  standalone: true,
  imports: [FiltreMasseComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './utilisation-produits.html',
  styleUrl: './utilisation-produits.css'
})
export class UtilisationProduitsComponent implements OnInit {

  /** Periode d'une ligne, pour la colonne du tableau. */
  readonly periodeLisible = periodeLisible;

  listeEmissions: EmissionUtilisation[] = [];
  filtreGamme = 'Toutes';
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
  toastMessage = '';
  toastSecondaire = '';

  readonly gammes = GAMMES;
  readonly classeBadgeGamme = classeBadgeGamme;
  readonly emojiGamme = emojiGamme;
  readonly dureeVieDefaut = DUREE_VIE_DEFAUT_KM;

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

  /**
   * Facteur réellement appliqué, repris de la base retenue et modifiable.
   *
   * <p>Le formulaire n'exposait que le choix d'une entrée du référentiel : un
   * facteur négocié, mesuré sur site ou communiqué par un tiers n'avait aucun
   * chemin vers la saisie, sinon la création d'une entrée au référentiel pour
   * une valeur qui ne concerne qu'une ligne.</p>
   *
   * <p>La base propose, l'exploitant arbitre : la valeur est pré-remplie au
   * choix de l'entrée, et reste éditable.</p>
   */
  facteurApplique: number | null = null;
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
    gamme: 'Filtre à Air' as GammeProduit,
    etablissement: ETABLISSEMENT_DEFAUT,
    provenance: 'Réel' as Provenance,
    typeSaisie: 'Kilométrage' as TypeSaisie,
    quantiteVendue: null as number | null,
    dureeVieKm: DUREE_VIE_DEFAUT_KM,
    montant: null as number | null,
    devise: 'TND',
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
      // Les listes sont déjà initialisées à [] par leurs déclarations : la
      // relecture ne peut donc que les remplacer par un tableau valide.
      this.listeEmissions = this.listeEmissions ?? [];
      this.facteursDisponibles = this.facteursDisponibles ?? [];
      this.facteursCompatibles = this.facteursCompatibles ?? [];
      this.usinesDisponibles = this.usinesDisponibles ?? [];

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

      if (isDevMode()) {
        console.log('Composant UtilisationProduits initialisé avec succès');
      }
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[utilisation-produits] initialisation incomplète :', message);
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
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 11 : les facteurs de '
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

    if (this.formModel.typeSaisie === 'Monétaire') this.formModel.devise = this.deviseActive;
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
    grandeur: 'quantiteVendue', facteur: 'facteur',
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

  get emissionsFiltrees(): EmissionUtilisation[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.gamme !== this.filtreMetier) return false;
      if (this.filtreGamme !== 'Toutes' && item.gamme !== this.filtreGamme) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.reference, item.gamme ?? '', item.gammeTexte,
              item.etablissement, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') {
          return ((a.quantiteVendue ?? 0) - (b.quantiteVendue ?? 0)) * sens;
        }
        if (this.sortColumn === 'duree') return (a.dureeVieKm - b.dureeVieKm) * sens;
        if (this.sortColumn === 'reference') return a.reference.localeCompare(b.reference) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionUtilisation[] {
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

  get totalQuantiteVendue(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + (e.quantiteVendue ?? 0), 0);
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
    this.filtreGamme = 'Toutes';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionUtilisation): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        reference: emission.reference,
        gamme: emission.gamme ?? 'Filtre à Air',
        etablissement: emission.etablissement,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        typeSaisie: emission.typeSaisie,
        quantiteVendue: emission.quantiteVendue,
        dureeVieKm: emission.dureeVieKm,
        montant: emission.montant,
        devise: emission.devise,
        dateDebut: emission.dateDebut ?? '',
        dateFin: emission.dateFin ?? ''
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        reference: '',
        gamme: 'Filtre à Air',
        etablissement: this.usinesDisponibles.length === 1
          ? this.usinesDisponibles[0].nom
          : ETABLISSEMENT_DEFAUT,
        provenance: 'Réel',
        typeSaisie: 'Kilométrage',
        quantiteVendue: null,
        dureeVieKm: DUREE_VIE_DEFAUT_KM,
        montant: null,
        devise: this.deviseActive,
        dateDebut: '',
        dateFin: ''
      };
    }

    this.majFacteursCompatibles();

    // Rouvrir une ligne doit rendre le facteur qu'elle porte, et non celui
    // que la base propose aujourd'hui : le référentiel a pu changer depuis.
    if (emission) this.facteurApplique = emission.facteur;

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursGamme(this.facteursDisponibles, {
      gamme: this.formModel.gamme,
      monetaire: this.formModel.typeSaisie === 'Monétaire',
      devise: this.formModel.devise
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
    this.facteurApplique = this.facteurDeLaBase.valeur;
  }

  onCritereChange(): void {
    if (this.formModel.typeSaisie === 'Monétaire') this.formModel.devise = this.deviseActive;
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onFacteurChoisiChange(): void {
    // Changer d'entrée du référentiel ramène sa valeur : sans cela, le facteur
    // saisi pour l'entrée précédente resterait appliqué à la nouvelle.
    this.facteurApplique = this.facteurDeLaBase.valeur;
    this.cdr.detectChanges();
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  /** Facteur qui sera appliqué à la saisie en cours. */
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

  /** Facteur retenu, base et repli compris, avant arbitrage de l'exploitant. */
  private get facteurDeLaBase() {
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
    return retenirFacteurGamme(this.facteursDisponibles, {
      gamme: this.formModel.gamme,
      monetaire: this.formModel.typeSaisie === 'Monétaire',
      devise: this.formModel.devise
    });
  }

  private get sourceCalcul() {
    return {
      typeSaisie: this.formModel.typeSaisie,
      quantiteVendue: this.formModel.quantiteVendue,
      dureeVieKm: this.formModel.dureeVieKm,
      montant: this.formModel.montant
    };
  }

  /** Grandeur effectivement valorisée par la saisie en cours. */
  get grandeurPrevisionnelle(): number | null {
    return grandeurValorisee(this.sourceCalcul);
  }

  get uniteGrandeurCourante(): string {
    return uniteValorisee(this.formModel.typeSaisie, this.formModel.devise);
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionUsage(this.grandeurPrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (m.typeSaisie === 'Monétaire') {
      if (m.montant === null || m.montant <= 0) {
        return this.refuser('Le montant facturé est obligatoire.');
      }
    } else {
      if (m.quantiteVendue === null || m.quantiteVendue <= 0) {
        return this.refuser('La quantité vendue est obligatoire.');
      }
      if (m.typeSaisie === 'Kilométrage' && (!m.dureeVieKm || m.dureeVieKm <= 0)) {
        return this.refuser('La durée de vie en kilomètres doit être supérieure à zéro.');
      }
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
    const ligne: EmissionUtilisation = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      reference: m.reference.trim() || `USE-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      gamme: m.gamme,
      gammeTexte: m.gamme,
      etablissement: m.etablissement || ETABLISSEMENT_DEFAUT,
      provenance: m.provenance,
      typeSaisie: m.typeSaisie,
      quantiteVendue: m.typeSaisie === 'Monétaire' ? null : m.quantiteVendue,
      dureeVieKm: m.dureeVieKm,
      montant: m.typeSaisie === 'Monétaire' ? m.montant : null,
      devise: m.devise,
      grandeur,
      uniteGrandeur: this.uniteGrandeurCourante,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      referenceFacteur: facteur.reference,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionUsage(grandeur, facteur.valeur),
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
    const usine = this.usinesDisponibles[0]?.nom ?? ETABLISSEMENT_DEFAUT;

    const exemples = [
      {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C11US', 'UTI-0077'),
        'Référence': 'USE-0001', 'Gamme': 'Filtre à Air', 'Établissement': usine,
        'Type Saisie': 'Kilométrage', 'Quantité Vendue': 10000,
        'Kilométrage (km)': DUREE_VIE_DEFAUT_KM, 'Montant': ''
      },
      {
        'Référence': 'USE-0002', 'Gamme': 'Filtre Carburant', 'Établissement': usine,
        'Type Saisie': 'Kilométrage', 'Quantité Vendue': 5000,
        'Kilométrage (km)': 20000, 'Montant': ''
      },
      {
        'Référence': 'USE-0003', 'Gamme': 'Filtre Habitacle', 'Établissement': usine,
        'Type Saisie': 'Monétaire', 'Quantité Vendue': '',
        'Kilométrage (km)': '', 'Montant': 50000
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [14, 22, 18, 18, 18, 20, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Utilisation');
    XLSX.writeFile(classeur, 'gabarit-utilisation-produits.xlsx');
  }

  /**
   * Import de la matrice d'utilisation.
   *
   * <p>Les colonnes optionnelles absentes reçoivent leur valeur par défaut,
   * dont la durée de vie conventionnelle, et chaque gamme est rapprochée du
   * référentiel MS SQL avec repli ADEME.</p>
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
        const resultat = lireClasseurUtilisation(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille d\'utilisation reconnue : les colonnes '
            + 'Gamme et Quantité Vendue (ou Montant) sont attendues.';
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
        let gammesInconnues = 0;

        const ajoutees: EmissionUtilisation[] = resultat.lignes.map((brute, index) => {
          if (!brute.gamme) gammesInconnues++;

          const monetaire = brute.typeSaisie === 'Monétaire';
          const facteur = brute.gamme
            ? retenirFacteurGamme(this.facteursDisponibles, {
                gamme: brute.gamme, monetaire, devise: this.deviseActive
              })
            : { origine: 'Aucun' as OrigineFacteur, valeur: null, unite: '', libelle: '',
                reference: '', baseAppliquee: '', id: null };

          if (facteur.origine === 'ADEME') replis++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            reference: brute.reference,
            gamme: brute.gamme,
            gammeTexte: brute.gammeTexte,
            etablissement: brute.etablissement,
            provenance: 'Excel' as Provenance,
            typeSaisie: brute.typeSaisie,
            quantiteVendue: brute.quantiteVendue,
            dureeVieKm: brute.dureeVieKm,
            montant: brute.montant,
            devise: this.deviseActive,
            grandeur: brute.grandeur,
            uniteGrandeur: brute.uniteGrandeur,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            referenceFacteur: facteur.reference,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionUsage(brute.grandeur, facteur.valeur),
            dateDebut: '',
            dateFin: '',
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} produits en utilisation `
          + 'effectuée avec succès !';
        this.toastSecondaire = replis
          ? `${replis} ligne(s) valorisée(s) par un facteur de repli ADEME, `
            + 'faute de facteur correspondant au référentiel MS SQL.'
          : '';

        const details: string[] = [];
        if (gammesInconnues) details.push(`${gammesInconnues} gamme(s) non reconnue(s)`);
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
      'Gamme / Type de filtre': e.gamme ?? e.gammeTexte,
      'Etablissement': e.etablissement,
      'Duree de vie (km)': e.dureeVieKm,
      'Type saisie': e.typeSaisie,
      'Quantite vendue': e.quantiteVendue,
      'Montant': e.montant,
      'Devise': e.montant !== null ? e.devise : '',
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
    XLSX.utils.book_append_sheet(classeur, feuille, 'Utilisation');
    XLSX.writeFile(classeur, `utilisation-produits-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    const MARQUEUR = marqueurEcran('utilisation_produits');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionUtilisation>({
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
