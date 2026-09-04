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

import { lireClasseurVoyages, ETABLISSEMENT_DEFAUT } from './voyages-excel';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { SOURCE_VENTILATION, lignesVentileesPour } from '../../shared/dispatch/adaptateurs-mesure';
import { inject } from '@angular/core';
import {
  ModeVoyage, SegmentAerien, segmentAerien,
  choisirFacteurVoyage, classerFacteursVoyage, calculerEmissionVoyage, TRAJETS_PAR_MISSION
} from './voyages-facteur';
import {
  MODES_VOYAGE, reconnaitreMode, classeBadgeMode, emojiMode
} from '../../shared/mobilite/modes-transport';
import {
  DESTINATIONS_FREQUENTES, distanceIndicative, paysDeDepart
} from '../../shared/mobilite/trajets-voyages';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre
} from '../../shared/ui/perimetre-ecran';
import { MesuresServeurService, MesureServeur } from '../../services/mesures-serveur.service';
import { mesuresDeLEcran, ligneDeLaBase } from '../../shared/ui/mesures-en-tableau';
import { posteParId } from '../../core/nomenclature-scopes';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Mission, catégorie 6 du Scope 3. */
export interface EmissionVoyage {
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
  etablissement: string;
  reference: string;
  numeroOM: string;
  personne: string;
  provenance: Provenance;
  destination: string;
  /** Ville ou pays de départ, quand le suivi le documente. */
  depart: string;
  mode: ModeVoyage;
  segment: SegmentAerien | null;
  distanceKm: number | null;
  montant: number | null;
  /** Unité de la grandeur saisie : km, TND, EUR, nuitée… */
  unite: string;
  devise: string;
  participants: number;
  nbrJours: number | null;
  typeFacteur: string;
  referenceFacteur: string;
  facteur: number | null;
  uniteFacteur: string;
  baseAppliquee: string;
  emissionCalculee: number;
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

/** Catégorie GHG couverte : voyages d'affaires. */
const MOTIF_CATEGORIE = /^Category 6:/i;

const CLE_STOCKAGE = 'listeEmissionsVoyages';

const LIBELLE_CATEGORIE = 'Voyages d\'affaires';

/** Tailles de page proposées : les suivis annuels dépassent la centaine. */
const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-voyages-affaires',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './voyages-affaires.html',
  styleUrl: './voyages-affaires.css'
})
export class VoyagesAffairesComponent implements OnInit {

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionVoyage[] = [];
  filtreEtablissement = 'Tous';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // ---------- Pagination ----------
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

  readonly modesVoyage = MODES_VOYAGE;
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
  facteurSelectionne: FacteurDetaille | null = null;
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  avertissementFacteur = '';
  avertissementStockage = '';
  erreurInitialisation = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    etablissement: '',
    reference: '',
    numeroOM: '',
    personne: '',
    provenance: 'Réel' as Provenance,
    destination: '',
    depart: '',
    mode: 'Avion' as ModeVoyage,
    monetaire: false,
    distanceKm: null as number | null,
    montant: null as number | null,
    devise: 'TND',
    participants: 1,
    nbrJours: null as number | null,
    typeFacteur: '',
    referenceFacteur: '',
    facteur: null as number | null,
    uniteFacteur: '',
    baseAppliquee: '',
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
    this.chargerMesuresServeur();
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
    console.error('[voyages-affaires] initialisation incomplète :', message);
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
          : 'Aucun facteur de voyage d\'affaires dans le référentiel carbone. '
            + 'Importez la base depuis « Référentiel Facteurs ».';
        this.cdr.detectChanges();
      },
      error: () => {
        this.avertissementReferentiel = 'Référentiel carbone injoignable (emission-service, port 8082).';
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

  /** Destinations proposées à la saisie ; le champ reste libre. */
  readonly destinationsFrequentes = DESTINATIONS_FREQUENTES;

  /** Vrai quand la distance affichée vient de la table et non d'une saisie. */
  distanceProposee = false;

  /**
   * Propose une distance dès que le trajet est renseigné.
   *
   * <p>Elle n'écrase jamais une distance saisie : la table donne des ordres de
   * grandeur de capitale à capitale, l'utilisateur connaît son trajet. Une
   * valeur proposée est en revanche remplacée quand le trajet change, sinon
   * elle documenterait l'ancien.</p>
   *
   * <p>Un trajet que la table ignore laisse le champ vide plutôt que de
   * l'approcher : une distance inventée se retrouverait dans un bilan carbone
   * sans que rien ne la distingue d'une distance relevée.</p>
   */
  onTrajetChange(): void {
    const saisieManuelle = this.formModel.distanceKm !== null && !this.distanceProposee;
    if (saisieManuelle) return;

    const proposee = distanceIndicative(this.formModel.depart, this.formModel.destination);

    this.formModel.distanceKm = proposee;
    this.distanceProposee = proposee !== null;
    this.cdr.detectChanges();
  }

  /** L'utilisateur reprend la main sur la distance : elle cesse d'être proposée. */
  onDistanceSaisie(): void {
    this.distanceProposee = false;
  }

  /**
   * Pays d'implantation de la société consultée.
   *
   * <p>Il sert de départ par défaut : une mission part du site où travaille la
   * personne, et le ressaisir à chaque ligne n'apprend rien.</p>
   */
  paysDeLaSociete = '';

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
    this.paysDeLaSociete = paysDeDepart(societe?.pays);

    // Un départ vide suit la société ; un départ déjà saisi ne bouge pas, il
    // peut documenter une mission partie d'ailleurs.
    if (!this.formModel.depart) this.formModel.depart = this.paysDeLaSociete;

    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    if (this.formModel.etablissement
        && !this.usinesDisponibles.some(u => u.nom === this.formModel.etablissement)) {
      this.formModel.etablissement = '';
    }
    if (this.filtreEtablissement !== 'Tous'
        && !this.usinesDisponibles.some(u => u.nom === this.filtreEtablissement)) {
      this.filtreEtablissement = 'Tous';
    }
    if (this.formModel.monetaire) this.formModel.devise = this.deviseActive;
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
    grandeur: 'distanceKm', facteur: 'facteur',
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

    // Les lignes saisies vivent ici ; celles issues de la ventilation
    // appartiennent au magasin, seul capable de les republier à tous ses
    // abonnés — tableau, indicateurs et bilan se mettent à jour ensemble.
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarder();

    const clesVentilees = evenement.avant
      .map((ligne: any) => ligne?.cleVentilation)
      .filter((cle: unknown): cle is string => typeof cle === 'string' && cle.length > 0);

    if (clesVentilees.length) {
      const facteur = Number(evenement.apres[0]?.facteur ?? 0);
      this.dispatchStore.reprendreFacteur(clesVentilees, facteur);
    }
  }

  /** Exercice consulte, impose au tableau comme au tableau de bord. */
  exerciceActif: number | null = null;

  /** Perimetre organisationnel que les lignes doivent respecter. */
  /** Perimetre consulte, ouvert au gabarit pour le panneau des mesures serveur. */
  get perimetreAffiche(): PerimetreOrganisation { return this.perimetreActif; }
  private get perimetreActif(): PerimetreOrganisation {
    return perimetreOrganisation(
      this.societeActiveId, this.usinesDisponibles.map(u => u.nom), this.filiales.length);
  }

  /** Tri du perimetre : ce qui est retenu, et ce qui est ecarte. */
  private get triPerimetre() {
    return trierParPerimetre([...this.lignesServeur, ...this.toutesLignes], this.exerciceActif, this.perimetreActif);
  }

  /** Lignes du perimetre consulte : societe ET exercice. */
  get lignesDuPerimetre() { return this.triPerimetre.retenues; }

  get emissionsFiltrees(): EmissionVoyage[] {
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
      return [item.numeroOM, item.reference, item.personne, item.destination,
              item.mode, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'distance') {
          return ((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) * sens;
        }
        if (this.sortColumn === 'om') return a.numeroOM.localeCompare(b.numeroOM) * sens;
        if (this.sortColumn === 'personne') return a.personne.localeCompare(b.personne) * sens;
        if (this.sortColumn === 'periode') {
          return (new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime()) * sens;
        }
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  /**
   * Lignes de la page courante.
   *
   * <p>Un suivi annuel dépasse la centaine de missions : n'afficher qu'une page
   * évite de reconstruire tout le tableau à chaque frappe dans la recherche.</p>
   */
  get emissionsPage(): EmissionVoyage[] {
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

  /** Remet la pagination à la première page dès que le filtrage change. */
  onFiltreChange(): void {
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  get totalDistance(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + (e.distanceKm ?? 0), 0);
  }

  get nombreSansFacteur(): number {
    return this.listeEmissions.filter(e => e.facteur === null).length;
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

  ouvrirModale(emission?: EmissionVoyage): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursCompatibles = [];

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        etablissement: emission.etablissement,
        reference: emission.reference,
        numeroOM: emission.numeroOM,
        personne: emission.personne,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        destination: emission.destination,
        depart: emission.depart,
        mode: emission.mode,
        monetaire: emission.montant !== null && emission.distanceKm === null,
        distanceKm: emission.distanceKm,
        montant: emission.montant,
        devise: emission.devise,
        participants: emission.participants || 1,
        nbrJours: emission.nbrJours,
        typeFacteur: emission.typeFacteur,
        referenceFacteur: emission.referenceFacteur,
        facteur: emission.facteur,
        uniteFacteur: emission.uniteFacteur,
        baseAppliquee: emission.baseAppliquee,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin
      };
      this.rechercherFacteur(emission.referenceFacteur);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        reference: '',
        numeroOM: '',
        personne: '',
        provenance: 'Réel',
        destination: '',
        depart: '',
        mode: 'Avion',
        monetaire: false,
        distanceKm: null,
        montant: null,
        devise: this.deviseActive,
        participants: 1,
        nbrJours: null,
        typeFacteur: '',
        referenceFacteur: '',
        facteur: null,
        uniteFacteur: '',
        baseAppliquee: '',
        dateDebut: '',
        dateFin: ''
      };
      this.rechercherFacteur();
    }

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  /** Segment aérien du trajet saisi, affiché pour justifier le facteur retenu. */
  get segmentCourant(): SegmentAerien | null {
    return this.formModel.mode === 'Avion' ? segmentAerien(this.formModel.distanceKm) : null;
  }

  /**
   * Rapproche la mission et le référentiel MS SQL.
   *
   * <p>Le mode désigne la famille de facteurs ; pour un vol, la distance en
   * détermine le segment, dont l'intensité au passager-kilomètre diffère
   * fortement.</p>
   */
  rechercherFacteur(referencePreferee?: string): void {
    const critere = {
      mode: this.formModel.mode,
      distanceKm: this.formModel.distanceKm,
      monetaire: this.formModel.monetaire,
      devise: this.formModel.devise
    };

    this.facteursCompatibles = classerFacteursVoyage(this.facteursDisponibles, critere);

    const prefere = referencePreferee
      ? this.facteursCompatibles.find(f => f.referenceCode === referencePreferee)
      : undefined;

    this.appliquerFacteur(prefere ?? choisirFacteurVoyage(this.facteursDisponibles, critere));
    this.cdr.detectChanges();
  }

  changerBaseCalcul(monetaire: boolean): void {
    this.formModel.monetaire = monetaire;
    if (monetaire) this.formModel.devise = this.deviseActive;
    this.rechercherFacteur();
  }

  onFacteurChoisiChange(): void {
    const retenu = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId)) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;
    this.facteurChoisiId = facteur?.id ?? null;

    if (!facteur) {
      this.formModel.typeFacteur = '';
      this.formModel.referenceFacteur = '';
      this.formModel.facteur = null;
      this.formModel.uniteFacteur = '';
      this.formModel.baseAppliquee = '';

      const segment = this.segmentCourant;
      this.avertissementFacteur = this.facteursDisponibles.length
        ? segment
          ? `Aucun facteur « ${segment} » dans le référentiel : la mission sera enregistrée sans valorisation.`
          : `Aucun facteur ${this.formModel.monetaire ? 'monétaire' : 'physique'} `
            + `pour « ${this.formModel.mode} » dans le référentiel.`
        : '';
      return;
    }

    this.avertissementFacteur = '';
    this.formModel.typeFacteur = facteur.typeName;
    this.formModel.referenceFacteur = facteur.referenceCode;
    this.formModel.facteur = facteur.factorValue;
    this.formModel.uniteFacteur = facteur.unit;
    this.formModel.baseAppliquee = facteur.databaseSource;
  }

  /**
   * Décomposition du calcul, pour l'aperçu de la modale.
   *
   * <p>La distance saisie est celle de l'aller ; le calcul la double depuis
   * toujours, mais la modale annonçait « Distance × Facteur × Participants » et
   * taisait ce doublement. Un total deux fois supérieur à ce que la formule
   * affichée laissait attendre se lit comme une erreur — et rien ne permettait
   * de vérifier que c'en était une ou non.</p>
   *
   * <p>Rend {@code null} sur une valorisation monétaire : un montant de mission
   * couvre déjà le billet entier et n'est pas doublé.</p>
   */
  get detailAllerRetour(): {
    aller: number; trajets: number; total: number; participants: number;
  } | null {

    if (this.formModel.monetaire) return null;

    const aller = this.formModel.distanceKm;
    if (aller === null || !Number.isFinite(aller) || aller <= 0) return null;

    const participants = this.formModel.participants > 0 ? this.formModel.participants : 1;

    return {
      aller,
      trajets: TRAJETS_PAR_MISSION,
      total: aller * TRAJETS_PAR_MISSION,
      participants
    };
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionVoyage({
      facteur: this.formModel.facteur,
      monetaire: this.formModel.monetaire,
      distanceKm: this.formModel.distanceKm,
      montant: this.formModel.montant,
      participants: this.formModel.participants
    });
  }

  /** Le facteur suit la distance : changer de trajet peut changer de segment. */
  onDistanceChange(): void {
    this.rechercherFacteur(this.formModel.referenceFacteur || undefined);
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || (!m.numeroOM && !m.reference) || !m.dateDebut || !m.dateFin) {
      return this.refuser('Usine, N° d\'ordre de mission et période sont obligatoires.');
    }

    const grandeur = m.monetaire ? m.montant : m.distanceKm;
    if (grandeur === null || grandeur <= 0) {
      return this.refuser(m.monetaire
        ? 'Le montant facturé est obligatoire.'
        : 'La distance est obligatoire.');
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin précède la date de début.');
    }

    const ligne: EmissionVoyage = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      etablissement: m.etablissement,
      reference: m.reference.trim(),
      numeroOM: m.numeroOM.trim(),
      personne: m.personne.trim(),
      provenance: m.provenance,
      destination: m.destination.trim(),
      depart: m.depart.trim(),
      mode: m.mode,
      segment: this.segmentCourant,
      distanceKm: m.monetaire ? null : m.distanceKm,
      montant: m.monetaire ? m.montant : null,
      unite: m.monetaire ? m.devise : 'km',
      devise: m.devise,
      participants: m.participants || 1,
      nbrJours: m.nbrJours,
      typeFacteur: m.typeFacteur,
      referenceFacteur: m.referenceFacteur,
      facteur: m.facteur,
      uniteFacteur: m.uniteFacteur,
      baseAppliquee: m.baseAppliquee,
      emissionCalculee: this.emissionPrevisionnelle,
      dateDebut: m.dateDebut,
      dateFin: m.dateFin,
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
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} missions). `
        + 'Les lignes restent affichées mais ne seront pas conservées à la fermeture.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Import du suivi des ordres de mission ----------

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
      ...colonnesIdentite('MS3C6BT', 'VOY-0088'),
      'Référence': '2025-0001',
      'N° Ordre de Mission': 'OE250001',
      'Date': '2025-01-01',
      'Personne': 'NAOUFEL MABROUK',
      'Destination': 'MAROC',
      'Date début': '2025-01-05',
      'Date Fin': '2025-01-10',
      'Nbr Jours': 6,
      'Distance en Km': 3343.82
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [14, 22, 14, 26, 18, 14, 14, 12, 18].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'SUIVI');
    XLSX.writeFile(classeur, 'gabarit-voyages-affaires.xlsx');
  }

  /**
   * Import du suivi des ordres de mission.
   *
   * <p>Le classeur est lu par le parser tolérant : en-tête détecté, colonnes
   * rapprochées par synonymes, lignes de total écartées. Chaque mission est
   * ensuite rapprochée du référentiel MS SQL selon son segment aérien.</p>
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
        const resultat = lireClasseurVoyages(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille de voyages reconnue : une ligne d\'en-tête '
            + 'portant Référence ou N° Ordre de Mission est attendue.';
          this.cdr.detectChanges();
          return;
        }
        // Colonnes obligatoires absentes : message propre, pas d'exception.
        if (resultat.colonnesManquantes.length) {
          this.importErreurMsg = resultat.avertissement;
          this.cdr.detectChanges();
          return;
        }
        if (!resultat.lignes.length) {
          this.importErreurMsg = `Feuille « ${resultat.feuille} » sans mission exploitable.`;
          this.cdr.detectChanges();
          return;
        }

        const usineDefaut = this.usinesDisponibles[0]?.nom ?? ETABLISSEMENT_DEFAUT;
        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let sansFacteur = 0;

        const ajoutees: EmissionVoyage[] = resultat.lignes.map((brute, index) => {
          const monetaire = brute.typeSaisie === 'Montant';
          // Le moyen de transport est lu du fichier quand il y figure ; à
          // défaut, une mission valorisée au kilomètre relève de l'aérien.
          const mode = reconnaitreMode(brute.modeTexte, 'Avion') as ModeVoyage;

          const facteur = choisirFacteurVoyage(this.facteursDisponibles, {
            mode, distanceKm: brute.distanceKm, monetaire, devise: this.deviseActive
          });
          if (!facteur) sansFacteur++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            etablissement: brute.etablissement === ETABLISSEMENT_DEFAUT
              ? usineDefaut
              : brute.etablissement,
            reference: brute.reference,
            numeroOM: brute.numeroOM,
            personne: brute.personne,
            provenance: 'Excel' as Provenance,
            destination: brute.destination,
            depart: brute.depart,
            mode,
            segment: mode === 'Avion' ? segmentAerien(brute.distanceKm) : null,
            distanceKm: monetaire ? null : (brute.distanceKm ?? brute.quantite),
            montant: monetaire ? (brute.montant ?? brute.quantite) : brute.montant,
            unite: brute.unite,
            devise: brute.devise || this.deviseActive,
            participants: 1,
            nbrJours: brute.nbrJours,
            typeFacteur: facteur?.typeName ?? '',
            referenceFacteur: facteur?.referenceCode ?? '',
            facteur: facteur?.factorValue ?? null,
            uniteFacteur: facteur?.unit ?? '',
            baseAppliquee: facteur?.databaseSource ?? '',
            emissionCalculee: calculerEmissionVoyage({
              facteur: facteur?.factorValue ?? null, monetaire,
              distanceKm: brute.distanceKm ?? brute.quantite,
              montant: brute.montant ?? brute.quantite, participants: 1
            }),
            dateDebut: brute.dateDebut || brute.dateOrdre,
            dateFin: brute.dateFin || brute.dateOrdre,
            societeId: this.societeActiveId,
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} lignes effectuée avec succès !`;

        const details: string[] = [];
        if (sansFacteur) {
          details.push(`${sansFacteur} mission(s) hors segment documenté : émission à 0, à compléter`);
        }
        if (resultat.rejets.length) {
          details.push(`${resultat.rejets.length} ligne(s) écartée(s) : total ou mission incomplète`);
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
      'N° OM': e.numeroOM,
      'Reference': e.reference,
      'Employe': e.personne,
      'Provenance': e.provenance,
      'Destination / Pays': e.destination,
      'Mode': e.mode,
      'Segment': e.segment ?? '',
      'Distance (km)': e.distanceKm,
      'Montant': e.montant,
      'Devise': e.montant !== null ? e.devise : '',
      'Participants': e.participants,
      'Nbr jours': e.nbrJours,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Voyages');
    XLSX.writeFile(classeur, `voyages-affaires-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        libelle: 'Distance parcourue', icone: '✈️', accent: 'volume',
        valeur: (somme(e => e.distanceKm ?? 0)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
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


  private readonly dispatchStore = inject(DispatchStore);

  /**
   * Lignes reçues de la ventilation d'un classeur comptable.
   *
   * <p>Une ligne de balance ne porte ni mode, ni filière, ni prestataire : ces
   * champs prennent la valeur « Non précisé », qui se lit dans la grille comme
   * une qualification restant à faire. Le montant, le facteur et les émissions,
   * eux, sont exacts. Identifiant négatif : la sauvegarde de l'écran ne les
   * écrit jamais dans son stockage.</p>
   */
  get lignesVentilees(): EmissionVoyage[] {
    const annee = new Date().getFullYear();

    return lignesVentileesPour<EmissionVoyage>(this.dispatchStore, 'voyages-affaires', (ligne, rang) => ({
        id: -(rang + 1),
        scope: ligne.scope ?? 'SCOPE_3',
        categorie: 'voyages-affaires',
        etablissement: this.societeActiveLabel,
        reference: ligne.mainAccount || ligne.reference || 'VENT',
        numeroFacture: ligne.mainAccount || '',
        provenance: 'Excel',
        mode: 'Non précisé' as any, distanceKm: null, participants: 1, nbrJours: null,
        collaborateur: '', motif: '', destination: '',
        montant: ligne.quantite,
        devise: ligne.uniteFacteur || 'TND',
        facteur: ligne.facteur,
        uniteFacteur: ligne.uniteFacteur || 'TND',
        libelleFacteur: ligne.libelleFacteur,
        baseAppliquee: ligne.baseAppliquee,
        origineFacteur: ligne.origineFacteur,
        emissionCalculee: ligne.emissionKg,
        dateDebut: annee + '-01-01',
        dateFin: annee + '-12-31',
        societeId: this.societeActiveId,
        creeLe: '',
        sourceData: SOURCE_VENTILATION
    }) as unknown as EmissionVoyage);
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionVoyage[] {
    return [...this.lignesVentilees, ...this.listeEmissions];
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
    const MARQUEUR = marqueurEcran('voyages_affaires');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionVoyage>({
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
  private readonly CATEGORIE_REPLI = 'voyages-affaires';

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
  get lignesServeur(): EmissionVoyage[] {
    return mesuresDeLEcran(
      this.mesuresServeur, { numeroGhg: 6 }, this.exerciceActif, this.perimetreAffiche
    ).map(m => ligneDeLaBase(m, posteParId('voyages-affaires')?.libelle ?? this.CATEGORIE_REPLI) as unknown as EmissionVoyage);
  }

}