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

import { lireClasseurDeplacements } from './deplacements-excel';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante } from '../../shared/ui/kpis-categorie';
import {
  ModeTransport, MODES_DOMICILE_TRAVAIL, OrigineFacteur,
  retenirFacteur, classerFacteursMode, kilometrageAnnuel, calculerEmission,
  classeBadgeMode, emojiMode,
  JOURS_TRAVAILLES_DEFAUT, COVOITURAGE_DEFAUT, ETABLISSEMENT_DEFAUT
} from '../../shared/mobilite/modes-transport';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { periodeLisible } from '../../shared/ui/periode-lisible';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre, messagePerimetre
} from '../../shared/ui/perimetre-ecran';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Trajet domicile-travail, catégorie 7 du Scope 3. */
export interface EmissionDeplacement {
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
  matricule: string;
  employe: string;
  etablissement: string;
  adresseDomicile: string;
  provenance: Provenance;
  mode: ModeTransport | null;
  modeTexte: string;
  motorisation: string;
  distanceAllerKm: number | null;
  joursTravailles: number;
  covoiturage: number;
  kmAnnuels: number | null;
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

/** Catégorie GHG couverte : déplacements domicile-travail. */
const MOTIF_CATEGORIE = /^Category 7:/i;

const CLE_STOCKAGE = 'listeEmissionsDeplacements';

const LIBELLE_CATEGORIE = 'Déplacements des employés';

const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-deplacements-employes',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './deplacements-employes.html',
  styleUrl: './deplacements-employes.css'
})
export class DeplacementsEmployesComponent implements OnInit {

  /** Periode d'une ligne, pour la colonne du tableau. */
  readonly periodeLisible = periodeLisible;

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionDeplacement[] = [];
  filtreEtablissement = 'Tous';
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

  readonly modesDisponibles = MODES_DOMICILE_TRAVAIL;
  readonly classeBadgeMode = classeBadgeMode;
  readonly emojiMode = emojiMode;

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
  avertissementStockage = '';
  erreurInitialisation = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';

  formModel = {
    matricule: '',
    employe: '',
    etablissement: '',
    adresseDomicile: '',
    provenance: 'Réel' as Provenance,
    mode: 'Voiture' as ModeTransport,
    motorisation: '',
    distanceAllerKm: null as number | null,
    joursTravailles: JOURS_TRAVAILLES_DEFAUT,
    covoiturage: COVOITURAGE_DEFAUT,
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
          this.exerciceActif = filtre?.year ?? null;
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
    console.error('[deplacements-employes] initialisation incomplète :', message);
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
          : 'Référentiel des déplacements vide : les facteurs de repli ADEME sont appliqués. '
            + 'Importez la base depuis « Référentiel Facteurs » pour les remplacer.';
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
    grandeur: 'distanceAllerKm', facteur: 'facteur',
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
  private get perimetreActif(): PerimetreOrganisation {
    return perimetreOrganisation(
      this.societeActiveId, this.usinesDisponibles.map(u => u.nom), this.filiales.length);
  }

  /** Tri du perimetre : ce qui est retenu, et ce qui est ecarte. */
  private get triPerimetre() {
    return trierParPerimetre(this.listeEmissions, this.exerciceActif, this.perimetreActif);
  }

  /** Lignes du perimetre consulte : societe ET exercice. */
  get lignesDuPerimetre() { return this.triPerimetre.retenues; }

  /**
   * Ce que le perimetre a mis de cote, dit sous le tableau.
   *
   * <p>Un tableau qui retrecit sans explication se lit comme une perte.</p>
   */
  get messagePerimetre(): string {
    return messagePerimetre(this.triPerimetre, this.societeActiveLabel, this.exerciceActif);
  }

  get emissionsFiltrees(): EmissionDeplacement[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.mode !== this.filtreMetier) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.matricule, item.employe, item.adresseDomicile, item.modeTexte,
              item.mode ?? '', item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'distance') {
          return ((a.distanceAllerKm ?? 0) - (b.distanceAllerKm ?? 0)) * sens;
        }
        if (this.sortColumn === 'matricule') return a.matricule.localeCompare(b.matricule) * sens;
        if (this.sortColumn === 'employe') return a.employe.localeCompare(b.employe) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionDeplacement[] {
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

  get totalKmAnnuels(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + (e.kmAnnuels ?? 0), 0);
  }

  /** Lignes valorisées par un repli plutôt que par le référentiel. */
  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'Repli ADEME').length;
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
    this.filtreStatut = 'Tous';
    this.filtreEtablissement = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionDeplacement): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        matricule: emission.matricule,
        employe: emission.employe,
        etablissement: emission.etablissement,
        adresseDomicile: emission.adresseDomicile,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        mode: emission.mode ?? 'Voiture',
        motorisation: emission.motorisation,
        distanceAllerKm: emission.distanceAllerKm,
        joursTravailles: emission.joursTravailles,
        covoiturage: emission.covoiturage,
        dateDebut: emission.dateDebut ?? '',
        dateFin: emission.dateFin ?? ''
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        matricule: '',
        employe: '',
        etablissement: this.usinesDisponibles.length === 1
          ? this.usinesDisponibles[0].nom
          : ETABLISSEMENT_DEFAUT,
        adresseDomicile: '',
        provenance: 'Réel',
        mode: 'Voiture',
        motorisation: '',
        distanceAllerKm: null,
        joursTravailles: JOURS_TRAVAILLES_DEFAUT,
        covoiturage: COVOITURAGE_DEFAUT,
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
    this.facteursCompatibles = classerFacteursMode(
      this.facteursDisponibles, this.formModel.mode, this.formModel.motorisation
    );
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
    this.facteurApplique = this.facteurDeLaBase.valeur;
  }

  onModeChange(): void {
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onFacteurChoisiChange(): void {
    // Changer d'entrée du référentiel ramène sa valeur : sans cela, le facteur
    // saisi pour l'entrée précédente resterait appliqué à la nouvelle.
    this.facteurApplique = this.facteurDeLaBase.valeur;
    this.cdr.detectChanges();
  }

  /** Le total prévisionnel suit la frappe. */
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
        origine: 'MS SQL' as OrigineFacteur,
        valeur: choisi.factorValue,
        unite: choisi.unit,
        libelle: choisi.typeName,
        reference: choisi.referenceCode,
        baseAppliquee: choisi.databaseSource,
        id: choisi.id
      };
    }
    return retenirFacteur(this.facteursDisponibles, this.formModel.mode, this.formModel.motorisation);
  }

  /** Kilométrage annuel de la saisie en cours. */
  get kmAnnuelsPrevisionnels(): number | null {
    return kilometrageAnnuel(
      this.formModel.distanceAllerKm, this.formModel.joursTravailles, this.formModel.covoiturage
    );
  }

  get emissionPrevisionnelle(): number {
    return calculerEmission(this.kmAnnuelsPrevisionnels, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.matricule.trim() || !m.employe.trim()) {
      return this.refuser('Matricule et nom du salarié sont obligatoires.');
    }
    if (m.distanceAllerKm === null || m.distanceAllerKm < 0) {
      return this.refuser('La distance aller est obligatoire.');
    }
    if (!m.joursTravailles || m.joursTravailles <= 0) {
      return this.refuser('Le nombre de jours travaillés doit être supérieur à zéro.');
    }

    const facteur = this.facteurCourant;
    const kmAnnuels = this.kmAnnuelsPrevisionnels;


    // Sans periode, la mesure est rattachee a son annee de saisie : une
    // donnee 2025 enregistree en 2026 disparait du bilan 2025 sans que
    // rien ne le signale. C'est la panne la plus couteuse a decouvrir tard.
    if (!m.dateDebut || !m.dateFin) {
      return this.refuser('La periode couverte est obligatoire : sans elle, la mesure serait rattachee a son annee de saisie.');
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin precede la date de debut.');
    }
    const ligne: EmissionDeplacement = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      matricule: m.matricule.trim(),
      employe: m.employe.trim(),
      etablissement: m.etablissement || ETABLISSEMENT_DEFAUT,
      adresseDomicile: m.adresseDomicile.trim(),
      provenance: m.provenance,
      mode: m.mode,
      modeTexte: m.mode,
      motorisation: m.motorisation.trim(),
      distanceAllerKm: m.distanceAllerKm,
      joursTravailles: m.joursTravailles,
      covoiturage: m.covoiturage || COVOITURAGE_DEFAUT,
      kmAnnuels,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      referenceFacteur: facteur.reference,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmission(kmAnnuels, facteur.valeur),
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
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} trajets). `
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
    this.cdr.detectChanges();
  }

  telechargerGabarit(): void {
    const exemple: Record<string, string | number> = {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C7EC', 'DEP-0102'),
      'Matricule': 'M001',
      'Nom & Prénom': 'AHMED BEN ALI',
      'Établissement': this.usinesDisponibles[0]?.nom ?? ETABLISSEMENT_DEFAUT,
      'Adresse Domicile': 'Bizerte',
      'Moyen de transport': 'Voiture',
      'Motorisation': 'Diesel',
      'Distance (KM)': 15,
      'Jours Travaillés': JOURS_TRAVAILLES_DEFAUT,
      'Taux d\'occupation': 1
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [14, 26, 18, 22, 22, 16, 14, 16, 18].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Deplacements');
    XLSX.writeFile(classeur, 'gabarit-deplacements-employes.xlsx');
  }

  /**
   * Import du relevé des déplacements domicile-travail.
   *
   * <p>Les colonnes optionnelles absentes reçoivent leur valeur par défaut, et
   * chaque trajet est rapproché du référentiel MS SQL, avec repli ADEME quand
   * le mode n'y figure pas.</p>
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
        const resultat = lireClasseurDeplacements(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille de déplacements reconnue : '
            + 'les colonnes Matricule, Nom & Prénom, Moyen de transport et Distance sont attendues.';
          this.cdr.detectChanges();
          return;
        }
        if (resultat.colonnesManquantes.length) {
          this.importErreurMsg = resultat.avertissement;
          this.cdr.detectChanges();
          return;
        }
        if (!resultat.lignes.length) {
          this.importErreurMsg = `Feuille « ${resultat.feuille} » sans trajet exploitable `
            + '(en-têtes présents mais aucune ligne de données).';
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let replis = 0;
        let sansFacteur = 0;
        let modesInconnus = 0;

        const ajoutees: EmissionDeplacement[] = resultat.lignes.map((brute, index) => {
          if (!brute.mode) modesInconnus++;

          const facteur = brute.mode
            ? retenirFacteur(this.facteursDisponibles, brute.mode, brute.motorisation)
            : { origine: 'Aucun' as OrigineFacteur, valeur: null, unite: '', libelle: '',
                reference: '', baseAppliquee: '', id: null };

          if (facteur.origine === 'Repli ADEME') replis++;
          if (facteur.origine === 'Aucun') sansFacteur++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            matricule: brute.matricule,
            employe: brute.employe,
            etablissement: brute.etablissement,
            adresseDomicile: brute.adresseDomicile,
            provenance: 'Excel' as Provenance,
            mode: brute.mode,
            modeTexte: brute.modeTexte,
            motorisation: brute.motorisation,
            distanceAllerKm: brute.distanceAllerKm,
            joursTravailles: brute.joursTravailles,
            covoiturage: brute.covoiturage,
            kmAnnuels: brute.kmAnnuels,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            referenceFacteur: facteur.reference,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmission(brute.kmAnnuels, facteur.valeur),
            dateDebut: '',
            dateFin: '',
            societeId: this.societeActiveId,
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} lignes effectuée avec succès !`;

        const details: string[] = [];
        if (replis) details.push(`${replis} trajet(s) valorisé(s) par un facteur de repli ADEME`);
        if (modesInconnus) details.push(`${modesInconnus} moyen(s) de transport non reconnu(s)`);
        if (sansFacteur) details.push(`${sansFacteur} trajet(s) sans facteur applicable`);
        if (resultat.rejets.length) {
          details.push(`${resultat.rejets.length} ligne(s) écartée(s)`);
        }
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
      'Matricule': e.matricule,
      'Employe': e.employe,
      'Etablissement': e.etablissement,
      'Adresse domicile': e.adresseDomicile,
      'Provenance': e.provenance,
      'Moyen de transport': e.mode ?? e.modeTexte,
      'Motorisation': e.motorisation,
      'Distance aller (km)': e.distanceAllerKm,
      'Jours travailles': e.joursTravailles,
      'Taux d occupation': e.covoiturage,
      'Km annuels': e.kmAnnuels,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Deplacements');
    XLSX.writeFile(classeur, `deplacements-employes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Les quatre indicateurs de tête de la catégorie.
   *
   * <p>Ils suivent les filtres : ce que l'écran montre est ce que les cartes
   * comptent, sans quoi le total démentirait le tableau.</p>
   */
  get kpisCategorie(): CarteKpi[] {
    const lignes = this.emissionsFiltrees as any[];
    const somme = (extrait: (e: any) => number) =>
      lignes.reduce((total, e) => total + (extrait(e) || 0), 0);

    const emissionsKg = somme(e => e.emissionCalculee);
    const couverture = tauxCouvertureReferentiel(lignes);

    return [
      {
        libelle: 'Kilométrage annuel', icone: '🚌', accent: 'volume',
        valeur: (somme(e => e.kmAnnuels ?? 0)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: 'km'
      },
      {
        libelle: 'Total émissions', icone: '🌍', accent: 'emissions',
        valeur: (emissionsKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 }),
        unite: 'tCO₂e · ' + emissionsKg.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' kgCO₂e'
      },
      {
        libelle: 'Nombre de lignes', icone: '📄', accent: 'lignes',
        valeur: lignes.length.toLocaleString('fr-FR'),
        unite: 'saisie(s) au périmètre'
      },
      {
        libelle: 'Couverture MS SQL', icone: '🎯', accent: 'couverture',
        valeur: couverture.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %',
        unite: 'sinon repli ADEME',
        alerte: couverture < 80,
        // Cliquer la carte n'affiche que les lignes qu'elle signale : celles
        // qu'aucun facteur du référentiel n'adosse.
        filtreStatut: 'Fallback' as const
      }
    ];
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
    const MARQUEUR = marqueurEcran('deplacements_employes');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionDeplacement>({
      reference: 'referenceFacteur',
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
