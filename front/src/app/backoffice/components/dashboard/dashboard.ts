import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

// Composants métiers
import { ProfileComponent } from '../profile/profile.component';
import { EmissionListComponent } from '../../../components/emission-list/emission-list';
import { CombustionVehiculesComponent } from '../../../components/combustion-vehicules/combustion-vehicules';
import { EmissionsRefrigerantsComponent } from '../../../components/emissions-refrigerants/emissions-refrigerants';
import { ElectriciteAcheteeComponent } from '../../../components/electricite-achetee/electricite-achetee';
import { BiensServicesComponent } from '../../../components/biens-services/biens-services';
import { BiensEquipementComponent } from '../../../components/biens-equipement/biens-equipement';
import { ActivitesEnergieComponent } from '../../../components/activites-energie/activites-energie';
import { TransportAmontComponent } from '../../../components/transport-amont/transport-amont';
import { DechetsComponent } from '../../../components/dechets/dechets';
import { VoyagesAffairesComponent } from '../../../components/voyages-affaires/voyages-affaires';
import { DeplacementsEmployesComponent } from '../../../components/deplacements-employes/deplacements-employes';
import { ActifsLouesAmontComponent } from '../../../components/actifs-loues-amont/actifs-loues-amont';
import { TransportAvalComponent } from '../../../components/transport-aval/transport-aval';
import { TransformationProduitsComponent } from '../../../components/transformation-produits/transformation-produits';
import { UtilisationProduitsComponent } from '../../../components/utilisation-produits/utilisation-produits';
import { FinDeVieProduitsComponent } from '../../../components/fin-de-vie-produits/fin-de-vie-produits';
import { ActifsLouesAvalComponent } from '../../../components/actifs-loues-aval/actifs-loues-aval';
import { FranchisesComponent } from '../../../components/franchises/franchises';
import { InvestissementsComponent } from '../../../components/investissements/investissements';
import { SauvegardeDonneesComponent } from '../../../components/sauvegarde-donnees/sauvegarde-donnees';
import { ReferentielCarboneComponent } from '../../../components/referentiel-carbone/referentiel-carbone';
import { AppHeaderComponent } from '../../../shared/app-header/app-header.component';
import { EmissionFactorsComponent } from '../../../components/emission-factors/emission-factors.component';
import { ImportDataComponent } from '../../../components/import-data/import-data.component';
import { CurrencyTrendComponent } from '../../../components/currency-trend/currency-trend.component';
import { TrajectoireSbtiComponent } from '../../../components/trajectoire-sbti/trajectoire-sbti.component';
import { ExchangeTickerComponent } from '../../../components/exchange-ticker/exchange-ticker.component';
import { GestionSocietesComponent } from '../../../components/gestion-societes/gestion-societes.component';
import { ReportingComponent } from '../../../components/reporting/reporting.component';
import { ConsolidationGroupeComponent } from '../../../components/consolidation-groupe/consolidation-groupe.component';
import { GestionEquipeComponent } from '../../../components/gestion-equipe/gestion-equipe.component';
import { ActivityDataComponent } from '../../../components/activity-data/activity-data.component';

// Services et Modèles
import { RolesService, DroitsAcces, droitsPourRole } from '../../../core/roles.service';
import { purgerMarqueursObsoletes, VERSION_APPARIEMENT } from '../../../core/appariement-referentiel';
import { CommentairesService, Commentaire } from '../../../core/commentaires.service';
import { TauxChangeService } from '../../../core/taux-change.service';
import {
  AFFECTATIONS_PROPOSEES,
  Compte,
  ComptesService,
  ROLES_PROPOSES
} from '../../../core/comptes.service';
import { SessionService } from '../../../core/session.service';
import { OrganizationService } from '../../../services/organization.service';
import { Filiale, Usine, AnneeReference } from '../../../models/organization.model';
import { EntityContextService } from '../../../core/entity-context.service';
import { EmissionStatsService, EmissionStats, StatsMode } from '../../../services/emission-stats.service';
import { DispatchStore } from '../../../shared/dispatch/dispatch-store';
import { libelleEcran } from '../../../shared/dispatch/regles-dispatch';
import {
  totauxLocaux, totauxLocauxParEtablissement, mesuresLocalesModifiees$
} from '../../../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from '../../../core/perimetre';
import { BilanCarboneService } from '../../../core/bilan-carbone.service';
import { ActivityDataService, ChampActivite } from '../../../core/activity-data.service';
import { kgVersTonnes, tonnesVersKg } from '../../../core/unites-carbone';
import { rapport } from '../../../core/consolidation-groupe';
import { ReportFiltersService } from '../../../core/report-filters.service';
import { TCo2ePipe } from '../../../shared/tco2e.pipe';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { RecalculFacteursService } from '../../../shared/dispatch/recalcul-facteurs';
import { messagePurge } from '../../../core/migrations-demarrage';

/**
 * Ligne du tableau de suivi de saisie.
 *
 * <p>Nommée pour que le panneau de détail puisse la recevoir : sans type
 * partagé, le clic sur l'œil transporterait un objet anonyme dont rien ne
 * garantirait la forme.</p>
 */
export interface LigneSuiviSaisie {
  scope: string;
  scopeLabel: string;
  classe: string;
  categorie: string;
  metier: string;
  base: string;
  quantite: string;
  valeur: number;
  pct: number;
}

interface DonneeAnnuelle {
  annee: number;
  valeur: number;
  hauteurBarre: number;
  provisoire?: boolean;
}

interface KpiEntreprise {
  id: string;
  label: string;
  icone: string;
  couleur: string;
  unite: string;
  donnees: DonneeAnnuelle[];
}

interface PeriodeOption {
  code: string;
  label: string;
  court: string;
  cumul: string;
  reference: string;
  facteur: number;
}

interface ProfilFiliale {
  pays: string;
  devise: string;
}

/** Empreinte d'un exercice, telle que l'histogramme pluriannuel la trace. */
/**
 * Exercice de l'historique pluriannuel.
 *
 * <p>Les émissions sont en <strong>tCO₂e</strong>, comme les agrégats du serveur
 * et comme l'étiquette que le tableau de bord affiche. La conversion depuis les
 * kilogrammes du bilan a lieu une seule fois, au chargement.</p>
 */
interface PointHistorique {
  annee: number;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  /** Hauteurs des trois segments empilés, en pourcentage de la colonne. */
  h1: number;
  h2: number;
  h3: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProfileComponent,
    EmissionListComponent,
    CombustionVehiculesComponent,
    EmissionsRefrigerantsComponent,
    ElectriciteAcheteeComponent,
    BiensServicesComponent,
    BiensEquipementComponent,
    ActivitesEnergieComponent,
    TransportAmontComponent,
    DechetsComponent,
    VoyagesAffairesComponent,
    DeplacementsEmployesComponent,
    ActifsLouesAmontComponent,
    TransportAvalComponent,
    TransformationProduitsComponent,
    UtilisationProduitsComponent,
    FinDeVieProduitsComponent,
    ActifsLouesAvalComponent,
    FranchisesComponent,
    InvestissementsComponent,
    SauvegardeDonneesComponent,
    ReferentielCarboneComponent,
    AppHeaderComponent,
    EmissionFactorsComponent,
    ImportDataComponent,
    CurrencyTrendComponent,
    TrajectoireSbtiComponent,
    ExchangeTickerComponent,
    GestionSocietesComponent,
    ReportingComponent,
    ConsolidationGroupeComponent,
    GestionEquipeComponent,
    ActivityDataComponent,
    TCo2ePipe
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit, OnDestroy {

  /**
   * Abonnements de la console, résiliés à sa fermeture.
   *
   * <p>La console vit aussi longtemps que la session, mais elle est détruite et
   * reconstruite à chaque passage par la connexion : un abonnement laissé
   * ouvert s'y accumulerait, et chaque saisie déclencherait autant de
   * rechargements qu'il y a eu d'ouvertures.</p>
   */
  private readonly abonnements = new Subscription();

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  /**
   * Rôle et droits de navigation de l'utilisateur connecté.
   *
   * <p>Le rôle est déposé par l'authentification dans le stockage de session ;
   * aucun mot de passe ne transite ici. La navigation latérale s'y conforme :
   * un lecteur ne voit ni les écrans de saisie, ni les paramètres.</p>
   */
  private readonly rolesService = inject(RolesService);
  private readonly comptesService = inject(ComptesService);
  private readonly sessionService = inject(SessionService);

  userRole: string = 'ADMINISTRATEUR';
  droits: DroitsAcces = droitsPourRole(null);
  isSidebarCollapsed: boolean = false;

  /**
   * Droit requis par chaque écran de la console.
   *
   * <p>Masquer une entrée du menu ne suffit pas : l'onglet actif survit à un
   * changement de rôle, et une console rechargée sur un écran interdit
   * l'afficherait encore. La table sert donc aussi de garde à
   * {@link setActive}.</p>
   */
  private readonly droitParEcran: Record<string, keyof DroitsAcces> = {
    'dashboard-home': 'tableauDeBord',
    'import-data': 'importDonnees',
    'facteurs': 'emissionCarbone',
    'referentiel-carbone': 'emissionCarbone',
    'mesure': 'emissionCarbone',
    'reporting-executif': 'reporting',
    'consolidation-groupe': 'reporting',
    'ghg': 'reporting',
    'societes': 'parametres',
    'sauvegarde-donnees': 'parametres',
    'donnees-activite': 'donneesActivite',
    'm-prof': 'monProfil',
    'm-equipe': 'membresEquipe',
    'acces': 'demandesAcces'
  };

  /** L'écran demandé relève-t-il des droits du rôle actif ? */
  ecranAutorise(sub: string): boolean {
    // Les catégories de mesure partagent le droit du module d'émission plutôt
    // que d'être énumérées une à une : la nomenclature évolue, pas la règle.
    const droit = this.droitParEcran[sub] ?? (this.isCategory(sub) ? 'emissionCarbone' : null);
    if (!droit) return this.droits.profil === 'MASTER_ADMIN';
    return this.droits[droit] === true;
  }

  /**
   * Ramène l'utilisateur sur un écran auquel il a droit.
   *
   * <p>Le tableau de bord est ouvert aux trois profils : il fait un repli sûr,
   * là où une page blanche laisserait croire à une panne.</p>
   */
  private recadrerEcranActif(): void {
    if (!this.ecranAutorise(this.activeSub)) this.activeSub = 'dashboard-home';

    if (!this.droits.emissionCarbone) {
      this.menus.emissions = false;
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
    if (!this.droits.parametres) this.menus.parametres = false;
    if (!this.droits.monProfil && !this.droits.membresEquipe) this.menus.utilisateurs = false;
  }

  // ---------- FILTRES UI & MOTEUR DE RECHERCHE ----------
  filtreActif: string | number = 'ALL';
  selectedFilialeId: number | 'ALL' = 'ALL';
  selectedUsineId: number | 'ALL' = 'ALL';
  selectedAnnee: number | null = null;
  selectedDate: string = new Date().toISOString().slice(0, 10); // Date précise
  selectedPeriode: string = 'ANNEE';

  // Périodes : le facteur ramène l'empreinte annuelle à la fenêtre choisie.
  periodes: PeriodeOption[] = [
    { code: 'JOUR',      label: "Aujourd'hui",   court: 'Auj.',   cumul: 'cumul journalier',    reference: 'Référence journalière',    facteur: 1 / 365 },
    { code: 'SEMAINE',   label: 'Cette semaine', court: 'Sem.',   cumul: 'cumul hebdomadaire',  reference: 'Référence hebdomadaire',   facteur: 7 / 365 },
    { code: 'MOIS',      label: 'Ce mois',       court: 'Mois',   cumul: 'cumul mensuel',       reference: 'Référence mensuelle',      facteur: 1 / 12 },
    { code: 'TRIMESTRE', label: 'Ce trimestre',  court: 'Trim.',  cumul: 'cumul trimestriel',   reference: 'Référence trimestrielle',  facteur: 1 / 4 },
    { code: 'SEMESTRE',  label: 'Ce semestre',   court: 'Sem.',   cumul: 'cumul semestriel',    reference: 'Référence semestrielle',   facteur: 1 / 2 },
    { code: 'ANNEE',     label: 'Cette année',   court: 'Année',  cumul: 'cumul annuel',        reference: 'Référence annuelle',       facteur: 1 }
  ];

  /**
   * Profil pays / devise de la filiale active.
   *
   * <p>Lu sur la société elle-même : le pays et la devise sont des colonnes de
   * `filiale`, éditables depuis la gestion des sociétés. Une société créée par
   * l'utilisateur est donc traitée comme les autres, sans table de
   * correspondance à tenir à jour dans le code.</p>
   */
  private profilDe(filiale: Filiale | undefined): ProfilFiliale | null {
    if (!filiale) return null;
    return {
      pays: filiale.pays?.trim() || '—',
      devise: filiale.devise?.trim().toUpperCase() || 'TND'
    };
  }

  // ---------- MENUS & NAVIGATION ----------
  menus = {
    emissions: true,
    mesureCategories: false,
    // Déployé d'office : c'est la seule entrée, avec le tableau de bord, que
    // tous les profils voient — la replier la rendrait introuvable au lecteur.
    reporting: true,
    parametres: false,
    utilisateurs: false
  };

  activeSub: string = 'dashboard-home';
  activeScope: string | null = null;
  modulesGeneriques: string[] = ['ghg', 'm-equipe'];

  // ---------- DONNÉES D'ORGANISATION ----------
  filiales: Filiale[] = [];
  usines: Usine[] = [];
  annees: AnneeReference[] = [];

  /**
   * Structure des scopes et de leurs postes.
   *
   * <p>Chaque poste porte son code : C1 à C15 pour le Scope 3, où la
   * numérotation est celle du GHG Protocol et sert de langue commune avec les
   * auditeurs et le référentiel — « Category 4 » dans les classeurs, « C4 »
   * dans le menu. Les Scopes 1 et 2 n'ont pas de numérotation normative : leurs
   * postes portent S1 et S2, qui disent au moins de quel scope ils relèvent.</p>
   *
   * <p>Le code précède le libellé parce que c'est par lui qu'on cherche : un
   * responsable qui doit renseigner la catégorie 7 ne parcourt pas quinze
   * intitulés français pour retrouver « Déplacements des employés ».</p>
   */
  scopesData = [
    {
      id: 'scope1',
      name: 'Scope 1',
      categories: [
        { id: 'combustion-etablissements', code: 'S1', nom: 'Combustion dans les usines', icone: '🏭' },
        { id: 'combustion-vehicules', code: 'S1', nom: 'Combustion des véhicules', icone: '🚗' },
        { id: 'emissions-refrigerants', code: 'S1', nom: 'Émissions de réfrigérants', icone: '❄️' }
      ]
    },
    {
      id: 'scope2',
      name: 'Scope 2',
      categories: [
        { id: 'electricite-achetee', code: 'S2', nom: 'Électricité achetée', icone: '💡' }
      ]
    },
    {
      id: 'scope3',
      name: 'Scope 3',
      categories: [
        { id: 'biens-services', code: 'C1', nom: 'Biens et services achetés', icone: '📦' },
        { id: 'biens-equipement', code: 'C2', nom: 'Biens d\'équipement', icone: '🏗️' },
        { id: 'energie', code: 'C3', nom: 'Activités liées à l\'énergie', icone: '⛽' },
        { id: 'transport-amont', code: 'C4', nom: 'Transport en amont', icone: '🚚' },
        { id: 'dechets', code: 'C5', nom: 'Déchets', icone: '🗑️' },
        { id: 'voyages-affaires', code: 'C6', nom: 'Voyages d\'affaires', icone: '✈️' },
        { id: 'deplacements-employes', code: 'C7', nom: 'Déplacements des employés', icone: '🚌' },
        { id: 'actifs-loues-amont', code: 'C8', nom: 'Actifs loués en amont', icone: '🏢' },
        { id: 'transport-aval', code: 'C9', nom: 'Transport en aval', icone: '🚛' },
        { id: 'transformation-produits', code: 'C10', nom: 'Transformation des produits', icone: '🏭' },
        { id: 'utilisation-produits', code: 'C11', nom: 'Utilisation des produits', icone: '🛒' },
        { id: 'fin-de-vie-produits', code: 'C12', nom: 'Fin de vie des produits', icone: '♻️' },
        { id: 'actifs-loues-aval', code: 'C13', nom: 'Actifs loués en aval', icone: '🏢' },
        { id: 'franchises', code: 'C14', nom: 'Franchises', icone: '🤝' },
        { id: 'investissements', code: 'C15', nom: 'Investissements', icone: '💰' }
      ]
    }
  ];

  /**
   * Demandes d'accès en attente, lues en direct dans l'annuaire.
   *
   * <p>La liste n'est plus un jeu d'exemple : approuver une demande ici ouvre
   * réellement la connexion de l'intéressé sur l'écran de connexion, au
   * rafraîchissement suivant de sa page.</p>
   */
  demandesEnAttente: Compte[] = [];

  /** Rôles et périmètres que le Master Admin peut affecter à une demande. */
  readonly rolesAffectables = ROLES_PROPOSES;
  readonly affectationsProposees = AFFECTATIONS_PROPOSEES;

  /**
   * Décision en cours de saisie, par identifiant de demande.
   *
   * <p>Le rôle porté par la demande n'est qu'une proposition : l'écran l'offre
   * comme valeur de départ, et c'est ce que le Master Admin laisse ou change ici
   * qui sera appliqué à l'approbation.</p>
   */
  decisions: Record<number, { role: string; affectation: string }> = {};

  // ---------- STATISTIQUES & KPIS ----------
  // Les agrégats carbone (scopes, catégories, filiales) sont exclusivement
  // servis par emission-service ; voir chargerStats().

  /**
   * Séries extra-financières : chiffre d'affaires, effectif, production, ventes.
   *
   * <p>Elles étaient codées en dur, et se lisaient donc comme des chiffres
   * réels alors qu'aucun ne l'était. Elles viennent désormais de l'écran
   * « Données d'Activité & KPI », seul endroit où elles sont tenues, et sont
   * cloisonnées par société comme le reste du périmètre.</p>
   */
  private readonly activiteService = inject(ActivityDataService);

  selectedScopeSlice: string | null = null;
  selectedScope3Slice: string | null = null;

  // Palette calibrée pour un fond clair : teintes assez soutenues pour rester
  // lisibles sur blanc (cyan / vert / orange / violet), sans jaune.
  scope3Palette: string[] = [
    '#0284c7', '#16a34a', '#ea580c', '#9333ea', '#0891b2',
    '#059669', '#c2410c', '#7c3aed', '#0369a1', '#15803d',
    '#d97706', '#6d28d9', '#0e7490', '#166534', '#a21caf'
  ];

  /**
   * Route active, quand il y en a une.
   *
   * <p>La console s'affiche aussi hors routage — bancs d'essai, intégration
   * dans un hôte. L'injection est donc facultative : exiger un routeur
   * configuré ferait échouer un montage qui n'a que faire de l'URL.</p>
   */
  private readonly route = inject(ActivatedRoute, { optional: true });

  constructor(
    private router: Router,
    private organizationService: OrganizationService,
    private entityService: EntityContextService,
    private statsService: EmissionStatsService,
    private dispatchStore: DispatchStore,
    private recalculService: RecalculFacteursService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Incrémenté après un import réussi : force le rechargement des vues filles. */
  refreshToken = 0;

  // ---------- AGRÉGATS RÉELS ----------
  /**
   * Restitution du tableau de bord : des tonnes de CO₂ équivalent, toujours.
   *
   * <p>Une bascule laissait auparavant choisir entre valorisation physique et
   * valorisation monétaire. Elle induisait en erreur : le mode monétaire ne
   * donnait pas une autre lecture des émissions, il remplaçait les tCO₂e par
   * les montants d'achat des seules lignes adossées à un facteur monétaire.
   * Deux grandeurs incomparables occupaient donc les mêmes cartes, et la carte
   * « Total empreinte carbone » pouvait afficher des dinars.</p>
   *
   * <p>Le mode physique, lui, somme déjà les tCO₂e de <em>toutes</em> les
   * mesures — celles calculées par un facteur physique comme celles calculées
   * par un ratio monétaire. C'est le total consolidé, et c'est le seul que le
   * tableau de bord présente désormais.</p>
   */
  private static readonly MODE_RESTITUTION: StatsMode = 'PHYSIQUE';

  statsReelles: EmissionStats | null = null;

  /** Compte rendu de la reprise des lignes sans facteur, affiché une fois. */
  messageRecalcul = '';
  chargementStats = false;

  /**
   * Écarte les entrées de stockage devenues sans objet.
   *
   * <p>Les agrégats ne sont jamais mémorisés : ils sont recalculés à chaque
   * passage. Seules d'anciennes clés d'un format abandonné sont retirées — les
   * mesures des écrans et la répartition, elles, sont la source du repli et ne
   * doivent surtout pas être effacées.</p>
   */
  private purgerCachesObsoletes(): void {
    if (typeof localStorage === 'undefined') return;

    const obsoletes = ['statsDashboard', 'dashboardStatsCache', 'emissionStatsCache',
                       'repartitionGlobaleMisfat'];

    for (const cle of obsoletes) {
      if (localStorage.getItem(cle) !== null) {
        localStorage.removeItem(cle);
        if (isDevMode()) console.log('[dashboard] cache obsolète écarté :', cle);
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      for (const cle of obsoletes) sessionStorage.removeItem(cle);
    }

    // Marqueurs d'appariement des versions antérieures. La console est le point
    // d'entrée de tous les écrans de collecte : les écarter ici suffit à ce que
    // chacun rejoue sa migration à sa première ouverture, sans intervention.
    const marqueursEcartes = purgerMarqueursObsoletes();
    if (marqueursEcartes && isDevMode()) {
      console.log(`[dashboard] ${marqueursEcartes} marqueur(s) d'appariement obsolète(s) écarté(s) `
                  + `— l'appariement v${VERSION_APPARIEMENT} sera rejoué.`);
    }
  }

  /**
   * Périmètre organisationnel consulté, tel que les replis locaux l'appliquent.
   *
   * <p>Les écrans de saisie nomment leur usine, jamais leur société : la liste
   * des usines rattachées à la société sélectionnée est donc le seul moyen de
   * cloisonner les relevés locaux. Sur la vue consolidée groupe, aucune
   * restriction n'est posée — c'est le périmètre le plus large, et il est
   * explicitement demandé.</p>
   */
  private get organisationActive(): PerimetreOrganisation {
    const entityId = typeof this.selectedFilialeId === 'number' ? this.selectedFilialeId : null;
    const societe = this.filiales.find(f => f.id === entityId);
    const usines = societe?.usines?.length ? societe.usines : this.usines;

    return {
      entityId,
      etablissements: usines.map(u => u.nom).filter(Boolean),
      societeUnique: this.filiales.length <= 1
    };
  }

  // ---------- HISTORIQUE PLURIANNUEL ----------

  private readonly bilanService = inject(BilanCarboneService);

  /** Référentiel des pays d'implantation, partagé avec le rapport. */
  private readonly filtresRapport = inject(ReportFiltersService);

  /** Empreinte de chaque exercice ouvert, du plus ancien au plus récent. */
  historique: PointHistorique[] = [];
  chargementHistorique = false;

  /** Périmètre et liste d'exercices du dernier chargement, pour ne pas le rejouer. */
  private clefHistorique = '';

  /**
   * Trace l'empreinte de tous les exercices ouverts.
   *
   * <p>L'axe des abscisses suit la table des exercices : ouvrir une année dans
   * les paramètres la fait apparaître ici sans toucher au code. Chaque année
   * est calculée par le même service que le rapport — serveur, ventilation
   * comptable et saisies des écrans — pour qu'une colonne de l'histogramme et
   * la carte du haut ne racontent jamais deux histoires différentes.</p>
   *
   * <p>Le rechargement n'a lieu que si la société, l'usine ou la liste des
   * exercices ont bougé : changer d'année consultée ne redessine pas un
   * graphique qui les montre déjà toutes.</p>
   */
  chargerHistorique(): void {
    const filtre = this.entityService.filter;
    const annees = this.annees.map(a => a.valeur).sort((a, b) => a - b);

    const clef = `${filtre.entityId}|${filtre.usineId}|${annees.join(',')}`;
    if (!annees.length || clef === this.clefHistorique) return;

    this.clefHistorique = clef;
    this.chargementHistorique = true;

    forkJoin(
      annees.map(annee => this.bilanService
        .charger(filtre.entityId, filtre.usineId, annee)
        .pipe(catchError(() => of(null))))
    ).subscribe(bilans => {
      // Le bilan est tenu en kilogrammes, l'historique en tonnes : c'est
      // l'unité que le tableau de bord annonce (`uniteStats`) et celle des
      // agrégats du serveur. Sans cette conversion, la mini-carte affichait des
      // kilogrammes sous une étiquette « tCO₂eq » — mille fois trop lourds.
      const points = bilans.map((bilan, i) => ({
        annee: annees[i],
        scope1: kgVersTonnes(bilan?.scope1Kg ?? 0),
        scope2: kgVersTonnes(bilan?.scope2Kg ?? 0),
        scope3: kgVersTonnes(bilan?.scope3Kg ?? 0),
        total: kgVersTonnes(bilan?.totalKg ?? 0),
        h1: 0, h2: 0, h3: 0
      }));

      // Hauteurs rapportées à l'exercice le plus chargé : une échelle fondée
      // sur la somme des années écraserait toutes les colonnes.
      const maximum = Math.max(...points.map(p => p.total), 0);
      this.historique = points.map(point => ({
        ...point,
        h1: maximum > 0 ? (point.scope1 / maximum) * 100 : 0,
        h2: maximum > 0 ? (point.scope2 / maximum) * 100 : 0,
        h3: maximum > 0 ? (point.scope3 / maximum) * 100 : 0
      }));

      this.chargementHistorique = false;
      this.cdr.markForCheck();
    });
  }

  /** Le graphique a-t-il au moins un exercice chiffré à montrer ? */
  get historiqueRenseigne(): boolean {
    return this.historique.some(point => point.total > 0);
  }

  // ---------- TRACÉ DES AIRES EMPILÉES ----------

  /**
   * Repère du tracé, en unités de la zone de dessin.
   *
   * <p>Le graphique est un SVG et non une toile : il se rend côté serveur au
   * pré-rendu, s'imprime sans dépendre d'une option du navigateur, et n'ajoute
   * aucune librairie au paquet. La zone est étirée par la feuille de style,
   * les tracés portant {@code non-scaling-stroke} pour que l'étirement
   * n'épaississe pas les courbes.</p>
   */
  readonly svgLarg = 600;
  readonly svgHaut = 260;
  private readonly margeHaut = 16;
  private readonly margeBas = 12;

  /**
   * Empreinte de l'exercice le plus chargé ; échelle du graphique.
   *
   * <p>La cible n'entre pas dans le calcul : elle vaut 70 % du premier
   * exercice et lui est donc toujours inférieure. L'y faire entrer créerait
   * surtout un cycle, l'ordonnée de la cible dépendant elle-même de cette
   * échelle.</p>
   */
  private get maxHistorique(): number {
    return Math.max(...this.historique.map(p => p.total), 0);
  }

  private xPour(index: number): number {
    const n = this.historique.length;
    return n <= 1 ? this.svgLarg / 2 : (index * this.svgLarg) / (n - 1);
  }

  private yPour(valeur: number): number {
    const max = this.maxHistorique;
    const utile = this.svgHaut - this.margeHaut - this.margeBas;
    if (max <= 0) return this.svgHaut - this.margeBas;
    return this.margeHaut + (1 - valeur / max) * utile;
  }

  /** Position horizontale d'un exercice, en pourcentage de la largeur. */
  positionX(index: number): number {
    const n = this.historique.length;
    return n <= 1 ? 50 : (index / (n - 1)) * 100;
  }

  /**
   * Segments d'une courbe lissée, à tangente horizontale.
   *
   * <p>Deux cubiques par intervalle, comme pour les courbes des KPI de la même
   * page : le rendu reste souple sans jamais dépasser les points mesurés, ce
   * qu'une spline plus libre ferait sur une série en dents de scie.</p>
   */
  private segmentsLisses(points: { x: number; y: number }[]): string {
    let trace = '';
    for (let i = 0; i < points.length - 1; i++) {
      const milieu = +((points[i].x + points[i + 1].x) / 2).toFixed(2);
      trace += ` C ${milieu} ${points[i].y}, ${milieu} ${points[i + 1].y},`
        + ` ${points[i + 1].x} ${points[i + 1].y}`;
    }
    return trace;
  }

  private lisser(points: { x: number; y: number }[]): string {
    if (!points.length) return '';
    return `M ${points[0].x} ${points[0].y}${this.segmentsLisses(points)}`;
  }

  /** Points d'un niveau d'empilement, cumul des scopes jusqu'au rang demandé. */
  private niveau(rang: 0 | 1 | 2 | 3): { x: number; y: number }[] {
    return this.historique.map((point, i) => {
      const cumul = (rang >= 1 ? point.scope1 : 0)
        + (rang >= 2 ? point.scope2 : 0)
        + (rang >= 3 ? point.scope3 : 0);
      return { x: +this.xPour(i).toFixed(2), y: +this.yPour(cumul).toFixed(2) };
    });
  }

  /**
   * Aires empilées des trois scopes, du bas vers le haut.
   *
   * <p>Chaque aire est fermée sur la frontière du scope inférieur, et non sur
   * la ligne de base : c'est ce qui empile les contributions au lieu de les
   * superposer, et permet de lire le total à la hauteur de la courbe
   * supérieure.</p>
   */
  get airesHistorique(): { id: string; nom: string; couleur: string; aire: string; ligne: string }[] {
    if (this.historique.length < 1) return [];

    const definitions: { id: string; nom: string; couleur: string; rang: 1 | 2 | 3 }[] = [
      { id: 's1', nom: 'Scope 1', couleur: '#3FA96B', rang: 1 },
      { id: 's2', nom: 'Scope 2', couleur: '#E0803F', rang: 2 },
      { id: 's3', nom: 'Scope 3', couleur: '#4A96C4', rang: 3 }
    ];

    return definitions.map(definition => {
      const haut = this.niveau(definition.rang);
      const bas = this.niveau((definition.rang - 1) as 0 | 1 | 2);
      const retour = [...bas].reverse();

      return {
        ...definition,
        ligne: this.lisser(haut),
        aire: `${this.lisser(haut)} L ${retour[0].x} ${retour[0].y}`
          + `${this.segmentsLisses(retour)} Z`
      };
    });
  }

  /** Repères horizontaux et leur valeur, pour donner l'échelle. */
  get grilleHistorique(): { y: number; libelle: string }[] {
    const max = this.maxHistorique;
    if (max <= 0) return [];

    return [1, 0.66, 0.33, 0].map(part => ({
      y: +this.yPour(max * part).toFixed(2),
      libelle: this.formatCompact(max * part)
    }));
  }

  /**
   * Trajectoire cible : 30 % sous l'empreinte du premier exercice collecté.
   *
   * <p>Elle est rendue à plat, au niveau à atteindre, plutôt qu'en pente vers
   * 2030 : l'axe s'arrête au dernier exercice connu, et prolonger le trait
   * au-delà donnerait à lire des années qui ne figurent pas au graphique.</p>
   */
  get cibleHistorique(): { y: number; valeur: number; libelle: string } | null {
    const references = this.historique.filter(point => point.total > 0);
    if (references.length < 1) return null;

    const valeur = references[0].total * 0.7;
    return {
      valeur,
      y: +this.yPour(valeur).toFixed(2),
      libelle: `Cible −30 % (2030) · ${this.formatCompact(valeur)}`
    };
  }

  /** Points de la courbe supérieure, marqués sur chaque exercice. */
  get marqueursHistorique(): { x: number; y: number; annee: number; actif: boolean }[] {
    return this.niveau(3).map((point, i) => ({
      ...point,
      annee: this.historique[i].annee,
      actif: this.estAnneeActive(this.historique[i].annee)
    }));
  }

  // ---------- MINI-CARTES DE SYNTHÈSE ----------

  /** Exercice dont les mini-cartes rendent compte : celui qui est consulté. */
  private get pointCourant(): PointHistorique | null {
    return this.historique.find(p => p.annee === this.selectedAnnee)
      ?? this.historique[this.historique.length - 1]
      ?? null;
  }

  get anneeCarte(): number | null {
    return this.pointCourant?.annee ?? this.selectedAnnee;
  }

  get totalCarte(): number {
    return this.pointCourant?.total ?? this.totalEmissions;
  }

  /**
   * Variation entre l'exercice consulté et le précédent exercice collecté.
   *
   * <p>Un exercice antérieur non collecté n'est pas un exercice à zéro : la
   * carte reste alors vide plutôt que d'annoncer une progression qui ne
   * mesurerait que l'avancement de la collecte.</p>
   */
  get variationCarte(): { pct: number; precedent: number; hausse: boolean } | null {
    const courant = this.pointCourant;
    if (!courant || courant.total <= 0) return null;

    const anterieurs = this.historique.filter(p => p.annee < courant.annee && p.total > 0);
    if (!anterieurs.length) return null;

    const precedent = anterieurs[anterieurs.length - 1];
    const pct = ((courant.total - precedent.total) / precedent.total) * 100;
    if (!Number.isFinite(pct)) return null;

    return { pct, precedent: precedent.annee, hausse: pct >= 0 };
  }

  /** Scope majoritaire de l'exercice consulté, tel que la carte l'annonce. */
  get scopeDominantCarte(): { libelle: string; pct: number; couleur: string } | null {
    const courant = this.pointCourant;
    if (!courant || courant.total <= 0) return null;

    const parts = [
      { libelle: 'Scope 1', valeur: courant.scope1, couleur: '#3FA96B' },
      { libelle: 'Scope 2', valeur: courant.scope2, couleur: '#E0803F' },
      { libelle: 'Scope 3', valeur: courant.scope3, couleur: '#4A96C4' }
    ];

    const dominant = parts.reduce((max, part) => (part.valeur > max.valeur ? part : max));
    if (dominant.valeur <= 0) return null;

    return {
      libelle: dominant.libelle,
      pct: (dominant.valeur / courant.total) * 100,
      couleur: dominant.couleur
    };
  }

  /**
   * Nombre abrégé : milliers, millions, milliards.
   *
   * <p>Une empreinte à neuf chiffres déborde d'une mini-carte et ne se lit pas
   * d'un coup d'œil ; l'ordre de grandeur, si.</p>
   *
   * <p>Le palier des milliers porte deux décimales, comme les suivants : sur une
   * empreinte de quelques milliers de tonnes — le cas courant d'un site
   * industriel — une seule décimale confondait 8 850 et 8 949 sous le même
   * « 8,9 k ».</p>
   */
  formatCompact(valeur: number): string {
    const absolu = Math.abs(valeur);
    const format = (nombre: number, decimales: number) =>
      nombre.toLocaleString('fr-FR', {
        minimumFractionDigits: decimales, maximumFractionDigits: decimales
      });

    if (absolu >= 1e9) return `${format(valeur / 1e9, 2)} Md`;
    if (absolu >= 1e6) return `${format(valeur / 1e6, 2)} M`;
    if (absolu >= 1e3) return `${format(valeur / 1e3, 2)} k`;
    return format(valeur, absolu >= 10 ? 0 : 2);
  }

  // ---------- JALONS DE TRAJECTOIRE (SBTi) ----------

  /**
   * Jalons de réduction posés sur le graphique d'évolution.
   *
   * <p>Les pourcentages sont ceux d'une trajectoire alignée 1,5 °C ; ils
   * s'appliquent au <strong>premier exercice collecté</strong>, qui fait office
   * d'année de base. Un jalon dont la valeur sortirait de l'échelle du graphique
   * n'est pas tracé : une ligne hors cadre ne documente rien.</p>
   */
  get jalonsHistorique(): { annee: number; pct: number; y: number; libelle: string }[] {
    const references = this.historique.filter(point => point.total > 0);
    if (!references.length) return [];

    const base = references[0].total;
    const maximum = this.maxHistorique;

    return [
      { annee: 2028, pct: 25 },
      { annee: 2030, pct: 50 }
    ]
      .map(jalon => {
        const valeur = base * (1 - jalon.pct / 100);
        return {
          annee: jalon.annee,
          pct: jalon.pct,
          y: +this.yPour(valeur).toFixed(2),
          libelle: `−${jalon.pct} % en ${jalon.annee} · ${this.formatCompact(valeur)}`,
          valeur
        };
      })
      .filter(jalon => jalon.valeur <= maximum)
      .map(({ annee, pct, y, libelle }) => ({ annee, pct, y, libelle }));
  }

  // ---------- JAUGE D'INTENSITÉ CARBONE ----------

  /**
   * Seuil sectoriel de l'intensité produit, en kgCO₂e par unité.
   *
   * <p>Ordre de grandeur de la transformation plastique et métallique pour une
   * pièce de l'ordre du kilogramme. <strong>Ce n'est pas une donnée auditée</strong> :
   * il sert de repère de lecture, et reste un paramètre pour que le lecteur
   * puisse le contester.</p>
   */
  seuilIntensiteSectoriel = 5;

  /**
   * Jauge de l'intensité carbone, en arc de cercle.
   *
   * <p>L'échelle court jusqu'à deux fois le seuil : au-delà, l'aiguille se
   * bloque en butée plutôt que de sortir du cadran, et le libellé dit le
   * dépassement. Un cadran dont l'aiguille sort ne se lit plus.</p>
   */
  get jaugeIntensite(): {
    valeur: number; seuil: number; pctEchelle: number; angle: number;
    arc: string; statut: 'BON' | 'VIGILANCE' | 'CRITIQUE' | 'NON RENSEIGNÉ';
    libelle: string; renseignee: boolean;
  } {
    const intensite = this.intensiteCarbone;
    const seuil = this.seuilIntensiteSectoriel;
    const echelle = seuil * 2;

    // Intensité non calculable : l'aiguille reste au repos à gauche, mais le
    // statut le dit. Un cadran vert « BON » sur une production non renseignée
    // annonçait une performance parfaite là où il n'y avait rien à diviser.
    const valeur = intensite ?? 0;
    const pctEchelle = intensite !== null && echelle > 0
      ? Math.min((intensite / echelle) * 100, 100)
      : 0;

    // Demi-cadran : 180° de gauche à droite.
    const angle = -90 + (pctEchelle / 100) * 180;

    const statut: 'BON' | 'VIGILANCE' | 'CRITIQUE' | 'NON RENSEIGNÉ' =
      intensite === null ? 'NON RENSEIGNÉ'
        : intensite <= seuil * 0.6 ? 'BON'
          : intensite <= seuil ? 'VIGILANCE'
            : 'CRITIQUE';

    const libelle = intensite === null
      ? 'Production non renseignée : intensité non calculable'
      : intensite > echelle
        ? `Hors échelle — plus de ${this.formatCompact(echelle)} kgCO₂e / unité`
        : `${intensite.toFixed(2)} kgCO₂e / unité pour un repère de ${seuil}`;

    return {
      valeur, seuil, pctEchelle, angle,
      arc: this.arcJauge(pctEchelle),
      statut, libelle,
      renseignee: intensite !== null
    };
  }

  /**
   * Tracé de l'arc rempli de la jauge.
   *
   * <p>Demi-cercle de rayon 70 centré en (80, 80), parcouru de la gauche vers la
   * droite. Le tracé est calculé plutôt que dessiné pour que le remplissage
   * suive exactement la valeur.</p>
   */
  private arcJauge(pct: number): string {
    if (pct <= 0) return '';

    const rayon = 70;
    const cx = 80;
    const cy = 80;

    const angle = Math.PI * (pct / 100);
    const x = +(cx - rayon * Math.cos(angle)).toFixed(2);
    const y = +(cy - rayon * Math.sin(angle)).toFixed(2);

    // Un demi-tour exact impose le grand arc ; en dessous, le petit suffit.
    const grandArc = pct >= 100 ? 1 : 0;
    return `M ${cx - rayon} ${cy} A ${rayon} ${rayon} 0 ${grandArc} 1 ${x} ${y}`;
  }

  // ---------- COMPARATIF MULTI-PAYS ----------

  /** Bilans consolidés par pays, pour le comparatif inter-implantations. */
  comparatifPays: {
    pays: string; drapeau: string; societes: number;
    totalT: number; scope1T: number; scope2T: number; scope3T: number;
    largeur: number; pctScope1: number; pctScope2: number; pctScope3: number;
  }[] = [];

  chargementComparatif = false;

  /**
   * Charge un bilan consolidé par pays d'implantation.
   *
   * <p>La Tunisie réunit trois sociétés : son bilan est la fusion des leurs, par
   * la même règle que le rapport — les émissions s'additionnent, les quotes-parts
   * se recalculent. Sans cette consolidation, comparer « MISFAT Tunisie » à
   * « MISFAT Maroc » opposerait une société à un pays entier.</p>
   */
  private chargerComparatifPays(): void {
    const pays = this.filtresRapport.paysDisponibles();
    if (!pays.length) return;

    this.chargementComparatif = true;
    const annee = this.entityService.filter.year;

    forkJoin(
      pays.map(option => this.bilanService
        .chargerConsolide(option.filiales.map(f => f.id), annee, {
          libelleSociete: option.nom,
          pays: option.nom,
          devise: option.devise,
          annee,
          libelleExercice: annee === null ? 'Tous exercices' : String(annee)
        })
        .pipe(catchError(() => of(null))))
    ).subscribe(bilans => {
      const lignes = bilans.map((bilan, i) => ({
        pays: pays[i].nom,
        drapeau: pays[i].drapeau,
        societes: pays[i].filiales.length,
        totalT: kgVersTonnes(bilan?.totalKg ?? 0),
        scope1T: kgVersTonnes(bilan?.scope1Kg ?? 0),
        scope2T: kgVersTonnes(bilan?.scope2Kg ?? 0),
        scope3T: kgVersTonnes(bilan?.scope3Kg ?? 0)
      }));

      const maximum = Math.max(...lignes.map(l => l.totalT), 0);

      this.comparatifPays = lignes
        .map(ligne => ({
          ...ligne,
          // Plancher de 1,5 % : une barre nulle disparaîtrait sous son socle.
          largeur: maximum > 0 ? Math.max((ligne.totalT / maximum) * 100, 1.5) : 0,
          pctScope1: ligne.totalT > 0 ? (ligne.scope1T / ligne.totalT) * 100 : 0,
          pctScope2: ligne.totalT > 0 ? (ligne.scope2T / ligne.totalT) * 100 : 0,
          pctScope3: ligne.totalT > 0 ? (ligne.scope3T / ligne.totalT) * 100 : 0
        }))
        .sort((a, b) => b.totalT - a.totalT);

      this.chargementComparatif = false;
      this.cdr.markForCheck();
    });
  }

  /** Le comparatif porte-t-il au moins un pays chiffré ? */
  get comparatifRenseigne(): boolean {
    return this.comparatifPays.some(ligne => ligne.totalT > 0);
  }

  // ---------- SURVOL ET INFOBULLES ----------

  /**
   * Segment survolé, tous graphiques confondus.
   *
   * <p>Une seule variable pour l'ensemble : survoler une pastille de légende met
   * en avant le segment correspondant, et réciproquement. Deux états séparés
   * laisseraient les deux vues se contredire.</p>
   */
  segmentSurvole: string | null = null;

  survoler(clef: string | null): void {
    this.segmentSurvole = clef;
  }

  /** Le segment est-il celui que le pointeur désigne ? */
  estSurvole(clef: string): boolean {
    return this.segmentSurvole === clef;
  }

  /** Un autre segment est-il survolé ? Sert à estomper le reste du graphique. */
  estEstompe(clef: string): boolean {
    return this.segmentSurvole !== null && this.segmentSurvole !== clef;
  }

  /**
   * Écart d'un scope avec l'exercice précédent, en pourcentage.
   *
   * <p>L'historique porte les trois scopes par exercice : la variation est donc
   * calculable au niveau du scope. Elle ne l'est pas au niveau des
   * sous-catégories, que l'historique n'individualise pas — l'infobulle d'un
   * poste ne l'annonce donc pas plutôt que d'afficher un tiret trompeur.</p>
   *
   * @returns la variation, ou `null` quand aucun exercice antérieur n'est chiffré.
   */
  ecartScopeN1(scopeCode: string): number | null {
    const courant = this.historique.find(p => p.annee === this.selectedAnnee)
      ?? this.historique[this.historique.length - 1];
    if (!courant) return null;

    const anterieurs = this.historique.filter(p => p.annee < courant.annee && p.total > 0);
    const precedent = anterieurs[anterieurs.length - 1];
    if (!precedent) return null;

    const valeurDe = (point: PointHistorique): number =>
      scopeCode === 'SCOPE_1' ? point.scope1
        : scopeCode === 'SCOPE_2' ? point.scope2
        : point.scope3;

    const avant = valeurDe(precedent);
    if (avant <= 0) return null;

    return ((valeurDe(courant) - avant) / avant) * 100;
  }

  /**
   * Contenu de l'infobulle d'un segment de scope.
   *
   * <p>Catégorie, valeur, part, puis variation lorsqu'elle existe. Le texte est
   * assemblé ici plutôt que dans le gabarit : une interpolation de six termes
   * répétée sur trois graphiques deviendrait illisible.</p>
   */
  infobulleScope(nom: string, scopeCode: string, valeurT: number, pct: number): string {
    const lignes = [
      nom,
      `${valeurT.toFixed(2)} ${this.uniteStats}`,
      `${pct.toFixed(1)} % du périmètre`
    ];

    const ecart = this.ecartScopeN1(scopeCode);
    if (ecart !== null) {
      lignes.push(`${ecart >= 0 ? '▲ +' : '▼ '}${ecart.toFixed(1)} % vs exercice précédent`);
    }

    return lignes.join(' · ');
  }

  /** Infobulle d'un poste : sans variation, l'historique ne l'individualise pas. */
  infobullePoste(nom: string, valeurT: number, pct: number): string {
    return `${nom} · ${valeurT.toFixed(2)} ${this.uniteStats} · ${pct.toFixed(1)} % du scope`;
  }

  // ---------- VENTILATION EMPILÉE PAR SCOPE ----------

  /**
   * Ventilation interne d'un scope, en segments empilés.
   *
   * <p>Les barres de rang disent quel poste domine ; l'empilement dit comment le
   * scope se compose. Les deux lectures sont complémentaires : l'une classe,
   * l'autre montre la structure.</p>
   */
  ventilationEmpilee(scopeCode: string): {
    nom: string; valeur: number; pct: number; rang: number; clef: string;
  }[] {
    const details = this.detailsDuScope(scopeCode);
    const total = details.reduce((somme, poste) => somme + poste.valeur, 0);
    if (total <= 0) return [];

    // Les teintes viennent de la feuille de style : chaque segment reçoit son
    // rang, et le CSS décline le dégradé du scope. Poser des couleurs ici
    // dupliquerait la palette entre le composant et la feuille de style.
    return details
      .filter(poste => poste.valeur > 0)
      .slice(0, 6)
      .map((poste, index) => ({
        nom: poste.nom,
        valeur: poste.valeur,
        pct: (poste.valeur / total) * 100,
        rang: index + 1,
        clef: `${scopeCode}|${poste.nom}`
      }));
  }

  /** Exercice consulté, mis en avant dans l'histogramme. */
  estAnneeActive(annee: number): boolean {
    return this.selectedAnnee === annee;
  }

  /** Un clic sur une colonne bascule tout le tableau de bord sur cet exercice. */
  choisirAnnee(annee: number): void {
    this.entityService.selectYear(annee);
  }

  // ---------- ANALYSE DÉCISIONNELLE ----------

  /**
   * Pourcentage à la française, virgule décimale comprise.
   *
   * <p>{@code toFixed} écrit « 50.0 » : un point décimal au milieu d'un tableau
   * de bord entièrement francophone se lit comme une coquille.</p>
   */
  private pourcentFr(valeur: number): string {
    return valeur.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** Scope le plus contributeur de l'exercice consulté. */
  private get scopeDominant(): { nom: string; valeur: number; pct: number } | null {
    const retenus = this.scopesStats.filter(s => s.valeur > 0 && s.code !== 'NON_CLASSE');
    if (!retenus.length) return null;

    const dominant = retenus.reduce((max, s) => (s.valeur > max.valeur ? s : max));
    return { nom: dominant.nom, valeur: dominant.valeur, pct: dominant.pct };
  }

  /** Poste le plus lourd du scope dominant, cité comme cause principale. */
  private get posteDominant(): string | null {
    const dominant = this.scopeDominant;
    if (!dominant) return null;

    const code = dominant.nom.startsWith('Scope 1') ? 'SCOPE_1'
      : dominant.nom.startsWith('Scope 2') ? 'SCOPE_2' : 'SCOPE_3';
    const id = code === 'SCOPE_1' ? 'scope1' : code === 'SCOPE_2' ? 'scope2' : 'scope3';

    const postes = this.postesDuScope(id, code).filter(p => p.valeur > 0);
    if (!postes.length) return null;

    return postes.reduce((max, p) => (p.valeur > max.valeur ? p : max)).nom;
  }

  /**
   * Lecture de l'exercice consulté, en une phrase.
   *
   * <p>Chaque élément est repris du calcul affiché juste au-dessus : le texte
   * commente le tableau de bord, il n'ajoute aucune donnée qui n'y figure
   * pas.</p>
   */
  get analyseExercice(): string {
    const exercice = this.selectedAnnee ?? '—';

    if (!this.statsSontReelles || this.totalEmissions <= 0) {
      return `Aucune émission n'est chiffrée sur le périmètre ${this.filialeLabel} pour `
        + `l'exercice ${exercice}. Les catégories restent à collecter : le tableau de bord `
        + `atteste du périmètre examiné, non d'une empreinte nulle.`;
    }

    const total = this.totalEmissions.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    const dominant = this.scopeDominant;
    if (!dominant) return `En ${exercice}, l'empreinte globale s'élève à ${total} ${this.uniteStats}.`;

    const poste = this.posteDominant;
    const cause = poste ? `, tiré principalement par ${poste.toLowerCase()}` : '';

    return `En ${exercice}, l'empreinte globale s'élève à ${total} ${this.uniteStats}. `
      + `Le ${dominant.nom.split(' · ')[0]} représente le poste majeur avec `
      + `${this.pourcentFr(dominant.pct)} % des émissions${cause}.`;
  }

  /**
   * Variation par rapport à l'exercice précédent de l'historique.
   *
   * <p>Rendue vide quand la comparaison n'a pas de sens : un exercice
   * précédent non collecté n'est pas un exercice à zéro, et annoncer une
   * hausse de 100 % ne dirait rien de la trajectoire.</p>
   */
  get analyseVariation(): string {
    const courant = this.historique.find(p => p.annee === this.selectedAnnee);
    if (!courant || courant.total <= 0) return '';

    const anterieurs = this.historique.filter(p => p.annee < courant.annee && p.total > 0);
    if (!anterieurs.length) return '';

    const precedent = anterieurs[anterieurs.length - 1];
    const variation = ((courant.total - precedent.total) / precedent.total) * 100;
    if (!Number.isFinite(variation)) return '';

    const sens = variation >= 0 ? 'hausse' : 'baisse';
    const lecture = variation >= 0
      ? "marquant une augmentation de l'intensité carbone"
      : "marquant une amélioration de l'intensité carbone";

    return `Les émissions sont en ${sens} de ${this.pourcentFr(Math.abs(variation))} % par rapport à `
      + `${precedent.annee}, ${lecture}.`;
  }

  /** Flèche du bandeau d'analyse : elle suit le sens de la variation. */
  get iconeVariation(): string {
    return this.analyseVariation.includes('hausse') ? '📈' : '📉';
  }

  /**
   * Répartition importée que le cloisonnement écarte de l'exercice consulté.
   *
   * <p>Une balance solde un exercice et un seul : celle d'un autre millésime ne
   * pèse rien ici, et c'est la règle. Mais l'écran d'import affiche le total du
   * classeur sans filtre, quand le tableau de bord rendait zéro sans un mot —
   * la même donnée valait dix-neuf mille tonnes d'un côté et rien de l'autre,
   * et rien n'expliquait l'écart. Un poste vide se lit alors comme une collecte
   * à faire, alors que la donnée est là, rangée sous une autre année.</p>
   *
   * @returns `null` quand la répartition est comptée, ou qu'il n'y en a pas.
   */
  get ventilationHorsPerimetre():
    { fichier: string; exercice: number | null; exerciceConsulte: number | null;
      tonnes: number; lignes: number } | null {

    const kg = this.dispatchStore.emissionKgHorsPerimetre();
    if (!kg) return null;

    const etat = this.dispatchStore.instantane;

    return {
      fichier: etat.fichier,
      exercice: etat.exercice,
      exerciceConsulte: this.entityService.filter.year ?? null,
      tonnes: kgVersTonnes(kg),
      lignes: etat.lignes.length
    };
  }

  /**
   * Rattache la répartition importée à l'exercice consulté.
   *
   * <p>Le millésime d'un classeur est deviné de son nom : il peut donc être
   * faux, et rien ne permettait de le corriger sans tout réimporter. Le
   * rattachement reste une décision de l'exploitant — le bandeau l'expose, il
   * ne l'applique pas de lui-même : déplacer d'office une balance d'un exercice
   * à l'autre lui prêterait une année que personne n'a posée.</p>
   */
  rattacherVentilationALExerciceConsulte(): void {
    const annee = this.entityService.filter.year ?? null;
    if (annee === null) return;

    this.dispatchStore.rattacherAExercice(annee);
    this.chargerStats();
  }

  /** Recharge les agrégats depuis la base pour le périmètre courant. */
  chargerStats(): void {
    const f = this.entityService.filter;
    this.chargementStats = true;
    this.selectedFilialeSlice = null;

    // Le magasin suit le même périmètre : une balance de 2025 ne doit pas
    // remonter sur 2026, ni la ventilation d'une société sur une autre.
    this.dispatchStore.suivrePerimetre(f.year ?? null, f.entityId ?? null);

    this.statsService.aggregate(
      DashboardComponent.MODE_RESTITUTION, f.entityId, f.usineId, f.year
    ).subscribe({
      next: stats => {
        this.statsReelles = this.fusionnerVentilation(stats);
        this.chargementStats = false;
        // Le recalcul est complet : on force le rendu plutôt que d'attendre le
        // prochain cycle, que rien ne garantit après une réponse réseau.
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: () => {
        // Le serveur est muet : la ventilation locale reste seule à porter le
        // bilan de l'exercice consulté, plutôt que de tout ramener à zéro.
        this.statsReelles = this.fusionnerVentilation(null);
        this.chargementStats = false;
        this.cdr.markForCheck();
      }
    });

  }

  /**
   * Ajoute la ventilation comptable aux agrégats du serveur.
   *
   * <p>Les lignes ventilées vivent dans le navigateur : sans cette fusion, le
   * Scope 3 resterait à zéro sur le tableau de bord alors que les catégories
   * les affichent. Elles ne sont ajoutées qu'en restitution physique — un
   * ratio en kgCO₂e ne se convertit pas en dinars.</p>
   */
  /**
   * Libellé de la nomenclature portant le même identifiant qu'un écran.
   *
   * <p>Les écrans destinataires de la ventilation reprennent l'identifiant de
   * leur catégorie : la correspondance est donc exacte, sans rapprochement de
   * chaînes qui pourrait se tromper.</p>
   */
  private nomNomenclature(ecran: string): string | null {
    for (const scope of this.scopesData) {
      const trouvee = scope.categories.find(categorie => categorie.id === ecran);
      if (trouvee) return trouvee.nom;
    }

    // Rapprochement de repli, insensible à la casse et aux accents : « dechets »,
    // « DECHETS » et « Déchets » désignent la même catégorie.
    const recherche = this.clefComparable(ecran);
    for (const scope of this.scopesData) {
      const trouvee = scope.categories.find(
        categorie => this.clefComparable(categorie.id) === recherche
          || this.clefComparable(categorie.nom) === recherche
      );
      if (trouvee) return trouvee.nom;
    }

    return null;
  }

  /** Forme comparable d'une clé : sans accents, sans ponctuation, en minuscules. */
  private clefComparable(valeur: string): string {
    return String(valeur ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private fusionnerVentilation(stats: EmissionStats | null): EmissionStats | null {
    // Les deux replis sont indépendants : la ventilation d'un classeur et les
    // saisies des écrans. Sortir ici quand la première est vide priverait le
    // tableau de bord de la seconde — c'est ce qui laissait le Scope 3 à zéro.
    // La ventilation est désormais toujours fusionnée : elle porte des tCO₂e,
    // et c'est en tCO₂e que le tableau de bord restitue.
    const lignes = this.dispatchStore.lignesActives;

    const base: EmissionStats = stats ?? {
      mode: DashboardComponent.MODE_RESTITUTION, unit: 'tCO2e', currency: null, measureCount: 0,
      total: 0, scope1: 0, scope2: 0, scope3: 0,
      byScope: {}, byCategory: {}, byScopeCategory: {}, byFiliale: [],
      byCurrency: {}, unconvertedCurrencies: []
    };

    const fusion: EmissionStats = {
      ...base,
      byScope: { ...base.byScope },
      byCategory: { ...base.byCategory },
      byScopeCategory: Object.fromEntries(
        Object.entries(base.byScopeCategory ?? {}).map(([cle, valeur]) => [cle, { ...valeur }])
      )
    };

    for (const ligne of lignes) {
      if (!ligne.ecran || !ligne.scope) continue;

      const scope = ligne.scope;
      // Le libellé de la nomenclature, quand l'écran destinataire en est une
      // catégorie : sans cela, la ventilation créerait un poste parallèle au
      // lieu d'alimenter celui que le tableau de bord affiche déjà.
      const categorie = this.nomNomenclature(ligne.ecran) ?? libelleEcran(ligne.ecran);

      // Les lignes ventilées sont tenues en kgCO₂e, `EmissionStats` en tCO₂e :
      // sans cette conversion, chaque apport local pèse mille fois son poids.
      const valeur = kgVersTonnes(ligne.emissionKg);

      fusion.total += valeur;
      fusion.measureCount += 1;
      fusion.byScope[scope] = (fusion.byScope[scope] ?? 0) + valeur;
      fusion.byCategory[categorie] = (fusion.byCategory[categorie] ?? 0) + valeur;

      const parScope = fusion.byScopeCategory[scope] ?? {};
      parScope[categorie] = (parScope[categorie] ?? 0) + valeur;
      fusion.byScopeCategory[scope] = parScope;

      if (scope === 'SCOPE_1') fusion.scope1 += valeur;
      else if (scope === 'SCOPE_2') fusion.scope2 += valeur;
      else fusion.scope3 += valeur;
    }

    const finale = this.reventilerParFiliale(this.completerParMesuresLocales(fusion));
    this.tracerCalcul(stats, finale);
    return finale;
  }

  /**
   * Trace le détail du calcul dans la console, en développement seulement.
   *
   * <p>Le tableau de bord additionne trois sources — le serveur, la
   * ventilation d'un classeur et les saisies des écrans. Quand un poste
   * surprend, seule cette trace dit laquelle l'a alimenté.</p>
   */
  private tracerCalcul(serveur: EmissionStats | null, finale: EmissionStats): void {
    if (!isDevMode()) return;

    // Une réponse serveur incomplète ne doit pas faire tomber le rendu sur une
    // trace de mise au point : le journal cède, jamais le tableau de bord.
    const parFiliale = (finale.byFiliale ?? []).map(part => ({
      filiale: this.filiales.find(f => f.id === part.filialeId)?.libelle ?? 'Non affectée',
      filialeId: part.filialeId,
      valeur: Math.round(part.value),
      part: `${part.share.toFixed(1)} %`
    }));

    console.log('[dashboard] Stats calculées filiales :', parFiliale);

    console.log('[dashboard] Stats calculées catégories :', {
      scope1: Math.round(finale.scope1),
      scope2: Math.round(finale.scope2),
      scope3: Math.round(finale.scope3),
      total: Math.round(finale.total),
      parScopeEtCategorie: finale.byScopeCategory
    });

    console.log('[dashboard] Origine des apports :', {
      serveur: Math.round(serveur?.total ?? 0),
      ventilation: Math.round(
        this.dispatchStore.lignesActives
          .filter(l => l.ecran)
          .reduce((somme, l) => somme + l.emissionKg, 0)
      ),
      mesuresDesEcrans: totauxLocaux(this.entityService.filter.year ?? null, this.organisationActive),
      exercice: this.entityService.filter.year,
      societe: this.entityService.filter.entityId
    });
  }

  /**
   * Complète les agrégats par les mesures saisies dans les écrans.
   *
   * <p>Chaque catégorie conserve ses lignes dans le navigateur. Le serveur ne
   * les connaît pas tant qu'elles ne lui ont pas été soumises : sans ce repli,
   * une catégorie renseignée à l'écran resterait à zéro sur le tableau de
   * bord. Le repli ne s'applique que là où le serveur ne rapporte rien — une
   * catégorie qu'il documente n'est jamais écrasée, ni doublée.</p>
   */
  private completerParMesuresLocales(stats: EmissionStats): EmissionStats {
    const exercice = this.entityService.filter.year ?? null;
    const locaux = totauxLocaux(exercice, this.organisationActive);

    if (isDevMode()) {
      console.log('[dashboard] Mesures relevées dans les écrans :', {
        exercice,
        categoriesRenseignees: locaux.length,
        totalKgCO2e: Math.round(locaux.reduce((s, l) => s + l.emissionKg, 0)),
        detail: locaux
      });

      if (!locaux.length) {
        console.warn(
          '[dashboard] Aucune mesure locale retenue. Causes possibles : aucune saisie '
          + `enregistrée, ou des lignes hors de l'exercice ${exercice ?? '(tous)'}, `
          + 'ou des lignes dont le facteur reste non résolu (émission à 0).'
        );
      }
    }

    if (!locaux.length) return stats;

    const fusion: EmissionStats = {
      ...stats,
      byScope: { ...stats.byScope },
      byCategory: { ...stats.byCategory },
      byScopeCategory: Object.fromEntries(
        Object.entries(stats.byScopeCategory ?? {}).map(([cle, valeur]) => [cle, { ...valeur }])
      )
    };

    for (const local of locaux) {
      const nom = this.nomNomenclature(local.categorie);
      if (!nom || !local.emissionKg) continue;

      const parScope = fusion.byScopeCategory[local.scope] ?? {};

      // Le serveur ne fait foi que s'il rapporte une valeur non nulle. Un poste
      // présent mais à zéro — le cas de Déchets — est bien surchargé par le
      // relevé local, sans quoi la catégorie resterait muette.
      const valeurServeur = Number(parScope[nom] ?? 0);
      if (valeurServeur > 0) continue;

      // Les relevés d'écran sont tenus en kgCO₂e, `EmissionStats` en tCO₂e.
      const valeur = kgVersTonnes(local.emissionKg);

      parScope[nom] = valeur;
      fusion.byScopeCategory[local.scope] = parScope;

      fusion.byCategory[nom] = (fusion.byCategory[nom] ?? 0) + valeur;
      fusion.byScope[local.scope] = (fusion.byScope[local.scope] ?? 0) + valeur;
      fusion.total += valeur;
      fusion.measureCount += local.lignes;

      if (local.scope === 'SCOPE_1') fusion.scope1 += valeur;
      else if (local.scope === 'SCOPE_2') fusion.scope2 += valeur;
      else fusion.scope3 += valeur;
    }

    // Le calcul est terminé : on force le rendu plutôt que d'attendre un cycle
    // que rien ne garantit après une réponse réseau.
    this.cdr.detectChanges();

    return fusion;
  }

  /**
   * Réaffecte la ventilation à sa filiale et recalcule les quotes-parts.
   *
   * <p>Le serveur calcule les parts sur ses seules mesures : sans ce
   * réajustement, la carte « Distribution par filiale » afficherait 0 % pour
   * une société dont tout le bilan vient d'un classeur comptable.</p>
   */
  private reventilerParFiliale(stats: EmissionStats): EmissionStats {
    const apports = new Map<number | null, number>();

    const ajouter = (filialeId: number | null, valeur: number) => {
      if (!valeur) return;
      apports.set(filialeId, (apports.get(filialeId) ?? 0) + valeur);
    };

    // 1. La ventilation d'un classeur : société déclarée, à défaut celle du
    //    filtre, à défaut l'unique société du groupe.
    const ventile = this.dispatchStore.lignesActives
      .filter(ligne => ligne.ecran)
      .reduce((somme, ligne) => somme + ligne.emissionKg, 0);

    ajouter(
      this.dispatchStore.instantane.entityId
        ?? (typeof this.selectedFilialeId === 'number' ? this.selectedFilialeId : null)
        ?? (this.filiales.length === 1 ? this.filiales[0].id : null),
      ventile
    );

    // 2. Les saisies des écrans : chacune nomme son usine, et l'organigramme
    //    donne la filiale. Sans ce rapprochement, tout resterait « non
    //    affecté » alors que la réponse figure dans les données.
    for (const [usine, valeur] of totauxLocauxParEtablissement(
      this.entityService.filter.year ?? null, this.organisationActive
    )) {
      ajouter(this.filialeDeLUsine(usine), valeur);
    }

    // La répartition par filiale peut manquer d'une réponse partielle : on la
    // normalise plutôt que de la propager telle quelle aux vues qui l'attendent.
    if (!apports.size) return { ...stats, byFiliale: stats.byFiliale ?? [] };

    const parts = (stats.byFiliale ?? []).map(part => ({ ...part }));

    for (const [filialeId, valeur] of apports) {
      const existante = parts.find(part => part.filialeId === filialeId);
      if (existante) {
        existante.value += valeur;
        existante.measureCount += 1;
      } else {
        parts.push({ filialeId, value: valeur, share: 0, measureCount: 1 });
      }
    }

    const total = parts.reduce((somme, part) => somme + part.value, 0);
    const byFiliale = parts
      .filter(part => part.value > 0)
      .map(part => ({ ...part, share: total ? (part.value / total) * 100 : 0 }));

    return { ...stats, byFiliale };
  }

  /**
   * Filiale portant une usine donnée.
   *
   * <p>Le rapprochement se fait sur le nom, seule donnée que les écrans de
   * saisie conservent. Une usine inconnue de l'organigramme retombe sur la
   * société sélectionnée, puis sur l'unique société du groupe : la
   * « non affectée » n'est retenue qu'en dernier ressort.</p>
   */
  private filialeDeLUsine(nomUsine: string): number | null {
    const recherche = this.motCleOrganisation(nomUsine);

    if (recherche) {
      // Correspondance exacte d'abord : « MISFAT 1 » doit rejoindre l'usine
      // « MISFAT I » avant que la souplesse ne s'en mêle.
      for (const filiale of this.filiales) {
        const exacte = (filiale.usines ?? []).some(
          usine => this.motCleOrganisation(usine.nom ?? '') === recherche
        );
        if (exacte) return filiale.id;
      }

      // Puis rapprochement souple : le mot clé principal suffit, « Misfat »
      // rejoignant « TN MISFAT TUNISIE » comme « MISFAT 1 ».
      for (const filiale of this.filiales) {
        const candidats = [
          this.motCleOrganisation(filiale.libelle ?? ''),
          ...(filiale.usines ?? []).map(usine => this.motCleOrganisation(usine.nom ?? ''))
        ].filter(Boolean);

        const proche = candidats.some(
          candidat => candidat.includes(recherche) || recherche.includes(candidat)
        );
        if (proche) return filiale.id;
      }
    }

    // Une ligne sans rattachement trouvé revient au périmètre consulté, puis à
    // la société principale du groupe : « non affectée » n'apprend rien à
    // l'utilisateur et fausse toutes les quotes-parts.
    if (typeof this.selectedFilialeId === 'number') return this.selectedFilialeId;
    return this.filiales.length ? this.filiales[0].id : null;
  }

  /**
   * Mot clé d'un libellé d'organisation.
   *
   * <p>Les saisies écrivent « Misfat 1 », l'organigramme « TN MISFAT TUNISIE » :
   * chiffres, chiffres romains, indicatifs de pays et ponctuation sont ôtés
   * pour ne garder que l'enseigne. Sans cela, aucune des deux formes ne
   * rejoindrait l'autre et tout finirait « non affecté ».</p>
   */
  private motCleOrganisation(libelle: string): string {
    const nettoye = String(libelle ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();

    if (!nettoye) return '';

    const mots = nettoye.split(' ').filter(mot => {
      if (/^\d+$/.test(mot)) return false;                    // numéro de site
      if (/^[IVX]+$/.test(mot)) return false;                 // chiffre romain
      if (/^(TN|FR|MA|DZ|EU|SA|SARL|SAS|SPA|GROUPE|USINE|SITE)$/.test(mot)) return false;
      return mot.length >= 3;
    });

    if (!mots.length) return nettoye.replace(/\s+/g, '');

    // Le mot le plus long porte l'enseigne : « SOLAUFIL » dans
    // « FR SOLAUFIL FRANCE », « MISFAT » dans « TN MISFAT TUNISIE ».
    return mots.reduce((plusLong, mot) => (mot.length > plusLong.length ? mot : plusLong));
  }

  /** Ventilation par catégorie, triée par contribution décroissante. */
  get categoriesStats(): {
    nom: string; valeur: number; pct: number; couleur: string;
    nonResolu?: boolean; lignes?: number
  }[] {
    const carte = this.statsReelles?.byCategory ?? {};
    const total = Object.values(carte).reduce((s, v) => s + v, 0);

    const valorisees = Object.entries(carte)
      .map(([nom, valeur]) => ({ nom, valeur, pct: total ? (valeur / total) * 100 : 0, couleur: '' }))
      .sort((a, b) => b.valeur - a.valeur)
      .map((item, i) => ({ ...item, couleur: this.scope3Palette[i % this.scope3Palette.length] }));

    // Une catégorie renseignée mais sans facteur pèse zéro : l'omettre la
    // ferait passer pour absente, alors qu'elle attend d'être complétée.
    const connues = new Set(valorisees.map(c => c.nom));
    const enAttente = totauxLocaux(this.entityService.filter.year ?? null, this.organisationActive)
      .filter(local => local.emissionKg === 0 && local.lignes > 0)
      .map(local => ({
        nom: this.nomNomenclature(local.categorie) ?? local.categorie,
        valeur: 0, pct: 0, couleur: '#CBD5E1',
        nonResolu: true, lignes: local.lignes
      }))
      .filter(c => !connues.has(c.nom));

    return [...valorisees, ...enAttente];
  }

  /**
   * Ventilation par scope, alimentée par la base.
   *
   * <p>Les trois scopes sont toujours représentés, y compris à zéro : un scope
   * absent du graphique se lirait comme non couvert par le périmètre, alors
   * qu'il l'est simplement sans émission mesurée.</p>
   */
  get scopesStats(): { code: string; nom: string; valeur: number; pct: number; couleur: string }[] {
    const carte = this.statsReelles?.byScope ?? {};
    const total = Object.values(carte).reduce((s, v) => s + v, 0);

    const socle = [
      { code: 'SCOPE_1', nom: 'Scope 1 · Direct', couleur: '#16a34a' },
      { code: 'SCOPE_2', nom: 'Scope 2 · Énergie', couleur: '#ea580c' },
      { code: 'SCOPE_3', nom: 'Scope 3 · Chaîne de valeur', couleur: '#0284c7' }
    ].map(s => ({ ...s, valeur: carte[s.code] ?? 0 }));

    // Les mesures dont le facteur n'est pas rattaché au référentiel.
    const nonClasse = carte['NON_CLASSE'] ?? 0;
    if (nonClasse > 0) {
      socle.push({ code: 'NON_CLASSE', nom: 'Non classé', couleur: '#94a3b8', valeur: nonClasse });
    }

    return socle.map(s => ({ ...s, pct: total ? (s.valeur / total) * 100 : 0 }));
  }

  // ---------- HISTOGRAMME GLOBAL PAR CATÉGORIE ----------

  /**
   * Barres de l'histogramme des catégories.
   *
   * <p>La hauteur est relative au poste le plus élevé, et non au total : sur une
   * répartition très déséquilibrée, une échelle sur le total écraserait tous les
   * postes secondaires contre la ligne de base.</p>
   *
   * <p>Sur un périmètre sans mesure, la structure du graphique est conservée
   * avec les catégories du référentiel à zéro : une zone vide ferait douter du
   * chargement, là où des barres à plat montrent que la collecte reste à faire.</p>
   */
  get categorieBarres(): { nom: string; valeur: number; pct: number; hauteur: number; couleur: string }[] {
    const mesurees = this.categoriesStats.filter(c => c.valeur > 0);

    if (!mesurees.length) {
      const attendues = this.scopesData.flatMap(s => s.categories).slice(0, 8);
      return attendues.map((categorie, i) => ({
        nom: categorie.nom,
        valeur: 0,
        pct: 0,
        hauteur: 0,
        couleur: this.scope3Palette[i % this.scope3Palette.length]
      }));
    }

    // Toutes les catégories renseignées sont montrées, du plus fort
    // contributeur au plus faible. Tronquer la liste retirait des données sans
    // le dire ; c'est la barre qui s'affine et le libellé qui s'incline.
    const retenues = mesurees;
    const maximum = Math.max(...retenues.map(c => c.valeur));

    return retenues.map(c => ({
      nom: c.nom,
      valeur: c.valeur,
      pct: c.pct,
      // Plancher de 4 % : une barre nulle en hauteur disparaîtrait sous son socle.
      hauteur: maximum > 0 ? Math.max((c.valeur / maximum) * 100, 4) : 0,
      couleur: c.couleur
    }));
  }

  // ---------- DÉTAIL EXHAUSTIF DES POSTES PAR SCOPE ----------

  /**
   * Rattache un libellé de catégorie à la nomenclature interne.
   *
   * <p>La base stocke les intitulés du classeur GHG (« Category 2: Capital
   * Goods ») alors que le tableau de bord raisonne en catégories françaises.
   * Le numéro de catégorie est le seul repère univoque entre les deux
   * nomenclatures ; à défaut, on compare les libellés normalisés.</p>
   */
  private categorieCanonique(scopeId: string, brute: string): string {
    const texte = String(brute ?? '').trim();
    const cle = this.clefComparable(texte);
    if (!cle) return texte;

    // Le numéro de catégorie est le seul repère univoque entre les deux
    // nomenclatures : « Category 15: Investments » et « C15 » désignent le
    // quinzième poste du Scope 3. Le code seul n'est reconnu que s'il occupe
    // tout le libellé — sinon « C15 » se retrouverait à capter n'importe quel
    // intitulé commençant par un C suivi de chiffres.
    const numero = /^categor(?:y|ie)(\d{1,2})/.exec(cle)?.[1]
      ?? /^c(\d{1,2})$/.exec(cle)?.[1];

    if (numero) {
      const scope3 = this.scopesData.find(s => s.id === 'scope3');
      const categorie = scope3?.categories[Number(numero) - 1];
      if (categorie) return categorie.nom;
    }

    // Le rapprochement passe des deux côtés par la forme comparable. Il ne
    // comparait jusqu'ici qu'une clé désaccentuée à un libellé accentué :
    // « Émissions de réfrigérants » ne pouvait donc jamais se reconnaître, et
    // le poste partait en fin de liste hors nomenclature pendant que la ligne
    // prévue par le référentiel restait à zéro.
    const connue = this.scopesData
      .flatMap(s => s.categories)
      .find(c => this.clefComparable(c.nom) === cle || this.clefComparable(c.id) === cle);

    return connue ? connue.nom : texte;
  }

  /**
   * Postes d'un scope, nomenclature complète.
   *
   * <p>Toutes les catégories prévues par le référentiel sont listées, y compris
   * celles sans mesure, affichées à zéro. Masquer une catégorie non collectée
   * la ferait disparaître du bilan : sur le Scope 3, où 15 catégories sont
   * attendues par le GHG Protocol, l'absence d'un poste est une information de
   * pilotage — elle signale une collecte à lancer, pas une émission nulle.</p>
   *
   * <p>Les catégories présentes en base mais hors nomenclature sont ajoutées en
   * fin de liste, pour qu'aucune mesure ne sorte du total affiché.</p>
   */
  private postesDuScope(scopeId: string, scopeCode: string): { nom: string; icone: string; valeur: number; pct: number }[] {
    const carte = this.statsReelles?.byScopeCategory?.[scopeCode] ?? {};

    const mesures = new Map<string, number>();
    for (const [brute, valeur] of Object.entries(carte)) {
      const nom = this.categorieCanonique(scopeId, brute);
      mesures.set(nom, (mesures.get(nom) ?? 0) + valeur);
    }

    const nomenclature = this.scopesData.find(s => s.id === scopeId)?.categories ?? [];
    const postes = nomenclature.map(categorie => ({
      nom: categorie.nom,
      icone: categorie.icone,
      valeur: mesures.get(categorie.nom) ?? 0
    }));

    const attendues = new Set(nomenclature.map(c => c.nom));
    for (const [nom, valeur] of mesures) {
      if (!attendues.has(nom)) postes.push({ nom, icone: '•', valeur });
    }

    const total = postes.reduce((s, p) => s + p.valeur, 0);
    return postes.map(p => ({ ...p, pct: total ? (p.valeur / total) * 100 : 0 }));
  }

  get scope1Postes() { return this.postesDuScope('scope1', 'SCOPE_1'); }
  get scope2Postes() { return this.postesDuScope('scope2', 'SCOPE_2'); }
  get scope3Postes() { return this.postesDuScope('scope3', 'SCOPE_3'); }

  // ---------- TABLEAU DE SYNTHÈSE EXÉCUTIF ----------

  /**
   * Source d'émission métier et base de données rattachée, par catégorie.
   *
   * <p>La catégorie GHG désigne une famille normative ; l'exploitant, lui,
   * raisonne en périmètres opérationnels (« Parc Auto », « STEG »). Cette
   * correspondance donne au tableau la lecture métier attendue en comité, sans
   * altérer la classification GHG qui reste celle du référentiel.</p>
   */
  private readonly correspondanceMetier: { [categorie: string]: { metier: string; base: string } } = {
    'Combustion dans les usines': { metier: 'Chaufferies & fours', base: 'Relevés énergie site' },
    'Combustion des véhicules': { metier: 'Parc Auto', base: 'Cartes carburant' },
    'Émissions de réfrigérants': { metier: 'Groupes froid & clim', base: 'Fiches maintenance' },
    'Électricité achetée': { metier: 'STEG — Électricité', base: 'Factures STEG' },
    'Biens et services achetés': { metier: 'Achats Acier & Consommables', base: 'Achats ERP' },
    "Biens d'équipement": { metier: 'Immobilisations', base: 'Registre immobilisations' },
    "Activités liées à l'énergie": { metier: 'Amont énergétique', base: 'Facteurs amont' },
    'Transport en amont': { metier: 'Fret entrant', base: 'Transporteurs amont' },
    'Déchets': { metier: 'Déchets industriels', base: 'Bordereaux déchets' },
    "Voyages d'affaires": { metier: 'Missions & déplacements', base: 'Notes de frais' },
    'Déplacements des employés': { metier: 'Domicile–Travail', base: 'Enquête mobilité' },
    'Actifs loués en amont': { metier: 'Actifs loués amont', base: 'Contrats de location' },
    'Transport en aval': { metier: 'Fret sortant', base: 'Transporteurs aval' },
    'Transformation des produits': { metier: 'Transformation aval', base: 'Données clients' },
    'Utilisation des produits': { metier: 'Usage produits vendus', base: 'Modèle d\'usage' },
    'Fin de vie des produits': { metier: 'Fin de vie filtres', base: 'Filière recyclage' },
    'Actifs loués en aval': { metier: 'Actifs loués aval', base: 'Contrats de location' },
    'Franchises': { metier: 'Réseau franchisé', base: 'Reporting franchises' },
    'Investissements': { metier: 'Portefeuille participations', base: 'Consolidation financière' }
  };

  /**
   * Lignes du tableau de synthèse, tous scopes confondus.
   *
   * <p>La nomenclature complète est reprise, Scope 3 compris avec ses quinze
   * catégories : un poste à zéro atteste que la catégorie a été examinée, alors
   * que son absence laisserait penser qu'elle a été omise du périmètre.</p>
   */
  get syntheseSources(): LigneSuiviSaisie[] {
    const total = this.statsReelles?.total ?? 0;

    const groupes = [
      { id: 'scope1', code: 'SCOPE_1', label: 'Scope 1', classe: 'sc-1' },
      { id: 'scope2', code: 'SCOPE_2', label: 'Scope 2', classe: 'sc-2' },
      { id: 'scope3', code: 'SCOPE_3', label: 'Scope 3', classe: 'sc-3' }
    ];

    return groupes.flatMap(groupe =>
      this.postesDuScope(groupe.id, groupe.code).map(poste => {
        const metier = this.correspondanceMetier[poste.nom];
        return {
          scope: groupe.code,
          scopeLabel: groupe.label,
          classe: groupe.classe,
          categorie: poste.nom,
          metier: metier?.metier ?? poste.nom,
          base: metier?.base ?? 'Saisie manuelle',
          // La quantité d'origine n'est pas agrégée par catégorie côté serveur ;
          // le tableau restitue donc l'unité de restitution du mode courant.
          quantite: poste.valeur > 0 ? `${this.formaterNombre(poste.valeur)} ${this.uniteStats}` : `0 ${this.uniteStats}`,
          valeur: poste.valeur,
          pct: total ? (poste.valeur / total) * 100 : 0
        };
      })
    );
  }

  private formaterNombre(valeur: number): string {
    return valeur.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /**
   * Scope retenu par les boutons au-dessus du tableau ; null pour tout afficher.
   *
   * <p>Simple état d'affichage : le filtre s'applique aux lignes déjà calculées,
   * sans nouvel appel au serveur.</p>
   */
  scopeFiltre: string | null = null;

  basculerScopeFiltre(code: string): void {
    this.scopeFiltre = this.scopeFiltre === code ? null : code;
  }

  /** Lignes du tableau après application du filtre de scope. */
  // ---------- Détail d'une ligne de saisie et fil de commentaires ----------

  private readonly commentairesService = inject(CommentairesService);
  private readonly tauxChange = inject(TauxChangeService);

  /** Ligne dont le panneau latéral est ouvert, ou null. */
  ligneDetail: LigneSuiviSaisie | null = null;
  /** Commentaire en cours de rédaction. */
  commentaireSaisi = '';
  erreurCommentaire = '';

  /**
   * Clé stable d'une ligne de suivi.
   *
   * <p>Le scope et la catégorie l'identifient : l'index de tableau changerait
   * au moindre filtre, et le fil de commentaires se rattacherait alors à la
   * mauvaise ligne.</p>
   */
  cleLigne(ligne: { scope: string; categorie: string }): string {
    return `${ligne.scope}|${ligne.categorie}`;
  }

  nombreCommentaires(ligne: { scope: string; categorie: string }): number {
    return this.commentairesService.compter(this.cleLigne(ligne));
  }

  /** Fil de la ligne ouverte, du plus ancien au plus récent. */
  get commentairesDetail(): Commentaire[] {
    if (!this.ligneDetail) return [];
    return this.commentairesService.pourLigne(this.cleLigne(this.ligneDetail));
  }

  get peutSupprimerCommentaire(): boolean {
    return this.commentairesService.peutSupprimer;
  }

  ouvrirDetailSaisie(ligne: LigneSuiviSaisie): void {
    this.ligneDetail = ligne;
    this.commentaireSaisi = '';
    this.erreurCommentaire = '';
  }

  fermerDetailSaisie(): void {
    this.ligneDetail = null;
    this.commentaireSaisi = '';
    this.erreurCommentaire = '';
  }

  /**
   * Ajoute un commentaire au fil de la ligne ouverte.
   *
   * <p>L'horodatage est produit ici, au moment du geste : le service ne le
   * fabrique pas lui-même pour rester vérifiable sans dépendre de l'heure.</p>
   */
  ajouterCommentaire(): void {
    if (!this.ligneDetail) return;

    const ecrit = this.commentairesService.ajouter(
      this.cleLigne(this.ligneDetail),
      this.commentaireSaisi,
      this.nomUtilisateur,
      new Date().toISOString()
    );

    if (!ecrit) {
      this.erreurCommentaire = 'Saisissez un commentaire avant de l\'ajouter.';
      return;
    }

    this.commentaireSaisi = '';
    this.erreurCommentaire = '';
    this.cdr.markForCheck();
  }

  supprimerCommentaire(id: number): void {
    this.commentairesService.supprimer(id);
    this.cdr.markForCheck();
  }

  /** Nom affiché sur les commentaires, tel que la session le porte. */
  get nomUtilisateur(): string {
    if (typeof sessionStorage === 'undefined') return 'Utilisateur';
    try {
      return sessionStorage.getItem('userName')
        ?? localStorage.getItem('userName')
        ?? 'Utilisateur';
    } catch {
      return 'Utilisateur';
    }
  }

  get syntheseFiltrees() {
    const lignes = this.syntheseSources;
    return this.scopeFiltre ? lignes.filter(l => l.scope === this.scopeFiltre) : lignes;
  }

  /**
   * Total du tableau tel qu'il est affiché.
   *
   * <p>Il suit le filtre : afficher le total groupe sous une vue restreinte à un
   * seul scope laisserait croire que la somme des lignes visibles ne correspond
   * pas au pied de tableau.</p>
   */
  get syntheseTotal(): number {
    return this.syntheseFiltrees.reduce((somme, ligne) => somme + ligne.valeur, 0);
  }

  get syntheseTotalPct(): number {
    const general = this.statsReelles?.total ?? 0;
    return general ? (this.syntheseTotal / general) * 100 : 0;
  }

  /**
   * Unité de restitution, invariable.
   *
   * <p>Conservée comme accesseur plutôt que remplacée par une chaîne dans les
   * gabarits : les légendes, les donuts et le tableau de synthèse la lisent
   * tous, et une unité nommée en un seul endroit ne peut pas diverger d'un
   * widget à l'autre.</p>
   */
  get uniteStats(): string {
    return 'tCO₂eq';
  }

  // ---------- DISTRIBUTION PAR FILIALE / PAYS ----------
  /** Palette des filiales, stable d'un rendu à l'autre. */
  private readonly filialePalette = ['#0284c7', '#16a34a', '#f97316', '#9333ea', '#0891b2', '#c2410c'];

  selectedFilialeSlice: string | null = null;

  /**
   * Affichage des postes et sociétés sans émission.
   *
   * <p>Les deux listes couvrent volontairement toute la nomenclature — une
   * catégorie absente se lirait comme hors périmètre alors qu'elle est
   * seulement en attente de collecte. Mais quinze lignes à 0 % noient les trois
   * qui portent le bilan : elles sont donc repliées par défaut, et restent à un
   * clic.</p>
   */
  afficherScope3Zero = false;

  /** Postes du Scope 3 réellement montrés, selon l'état du dépliant. */
  get scope3Affiches(): { nom: string; total: number; pct: number; couleur: string }[] {
    return this.afficherScope3Zero ? this.scope3Full : this.scope3Full.filter(p => p.total > 0);
  }

  get scope3Masques(): number {
    return this.scope3Full.length - this.scope3Full.filter(p => p.total > 0).length;
  }

  /**
   * Seuil d'invraisemblance d'une empreinte annuelle de filiale, en tCO₂e.
   *
   * <p>Un million de tonnes est l'ordre de grandeur d'un cimentier ou d'une
   * aciérie intégrée. Une filiale de filtration qui l'atteint ne décrit pas une
   * performance industrielle : elle signale une donnée fausse — un facteur
   * saisi dans la mauvaise unité, une quantité prise pour un montant.</p>
   *
   * <p>Le tableau de bord n'écarte pas la valeur pour autant. Masquer une
   * donnée aberrante la rendrait introuvable ; l'afficher en la signalant
   * conduit l'utilisateur à la ligne qu'il doit corriger.</p>
   */
  static readonly SEUIL_EMPREINTE_INVRAISEMBLABLE = 1_000_000;

  /**
   * Filiales dont l'empreinte de l'exercice dépasse toute vraisemblance.
   *
   * <p>Alimente le bandeau d'alerte : le nom de la société et son chiffre,
   * parce qu'un avertissement qui ne dit pas où regarder ne fait que
   * inquiéter.</p>
   */
  get filialesInvraisemblables(): { nom: string; valeur: number }[] {
    return this.filialesStats
      .filter(f => f.valeur > DashboardComponent.SEUIL_EMPREINTE_INVRAISEMBLABLE)
      .map(f => ({ nom: f.nom, valeur: f.valeur }));
  }

  /** Seuil rappelé dans le bandeau, pour que l'alerte se justifie d'elle-même. */
  readonly seuilInvraisemblance = DashboardComponent.SEUIL_EMPREINTE_INVRAISEMBLABLE;

  /**
   * Sociétés montrées dans la distribution : toutes, sans exception.
   *
   * <p>Les sociétés à 0 % étaient repliées derrière un bouton « Voir toutes
   * les sociétés ». Le repli servait la lisibilité du donut, mais il coûtait
   * plus qu'il ne rapportait sur un tableau de bord Groupe : une filiale
   * masquée ne se distingue pas d'une filiale absente du périmètre, et un zéro
   * affiché dit précisément ce qu'il faut savoir — la collecte reste à
   * faire.</p>
   */
  get filialesAffichees(): { nom: string; pays: string; drapeau: string; valeur: number; pct: number; couleur: string }[] {
    return this.filialesStats;
  }

  toggleFilialeSlice(nom: string): void {
    this.selectedFilialeSlice = this.selectedFilialeSlice === nom ? null : nom;
  }

  /**
   * Distribution des émissions par filiale, telle que renvoyée par la base.
   *
   * <p>Le nom et le pays viennent d'organization-service : emission-service ne
   * connaît que l'identifiant de filiale porté par la mesure, et le rapprochement
   * se fait donc ici, où la liste des filiales est déjà chargée.</p>
   */
  /**
   * Distribution par filiale, couvrant tout le périmètre organisationnel.
   *
   * <p>Toutes les sociétés en base sont représentées, y compris celles sans
   * mesure : en vue consolidée, une filiale absente du graphique se lirait
   * comme hors périmètre de reporting, alors qu'elle est seulement en attente
   * de collecte. Une part à 0 % est une information de pilotage, pas un vide.</p>
   *
   * <p>Quand une société est sélectionnée, seule celle-ci est retenue : le
   * graphique suit alors le périmètre demandé.</p>
   */
  get filialesStats(): { nom: string; pays: string; drapeau: string; valeur: number; pct: number; couleur: string }[] {
    const parts = this.statsReelles?.byFiliale ?? [];
    const total = parts.reduce((s, p) => s + p.value, 0);

    const perimetre = this.selectedFilialeId === 'ALL'
      ? this.filiales
      : this.filiales.filter(f => f.id === this.selectedFilialeId);

    const lignes = perimetre.map(filiale => {
      const part = parts.find(p => p.filialeId === filiale.id);
      const valeur = part?.value ?? 0;
      const pays = filiale.pays?.trim() || '—';

      return {
        nom: filiale.libelle,
        pays,
        drapeau: this.drapeauDe(pays),
        valeur,
        // La part est recalculée sur le total affiché : restreindre le périmètre
        // à une société doit la porter à 100 %, pas conserver sa quote-part groupe.
        pct: total ? (valeur / total) * 100 : 0,
        couleur: ''
      };
    });

    // Part rattachée à aucune société. Elle vient presque toujours de la
    // ventilation d'un classeur consultée sur « toutes les sociétés » : aucune
    // société n'est alors déterminable, et « Non affectée » laisse croire à une
    // donnée perdue là où il ne manque qu'une sélection. Le libellé dit donc
    // quoi faire, plutôt que de constater.
    const orpheline = parts.find(p => p.filialeId == null);
    if (orpheline && this.selectedFilialeId === 'ALL') {
      const ventilee = this.dispatchStore.lignesActives.some(ligne => ligne.ecran);

      lignes.push({
        nom: ventilee
          ? 'Ventilation non rattachée — sélectionnez une société'
          : 'Non affectée',
        pays: '—',
        drapeau: ventilee ? '🔀' : '🏳️',
        valeur: orpheline.value,
        pct: total ? (orpheline.value / total) * 100 : 0,
        couleur: ''
      });
    }

    return lignes
      .sort((a, b) => b.valeur - a.valeur)
      .map((ligne, i) => ({ ...ligne, couleur: this.filialePalette[i % this.filialePalette.length] }));
  }

  get filialeDonutGradient(): string {
    const items = this.filialesStats.filter(f => f.valeur > 0);
    if (!items.length) return 'conic-gradient(#e2e8f0 0% 100%)';

    let curseur = 0;
    const stops = items.map(item => {
      const debut = curseur;
      curseur += item.pct;
      const couleur = (this.selectedFilialeSlice && this.selectedFilialeSlice !== item.nom)
        ? '#e2e8f0'
        : item.couleur;
      return `${couleur} ${debut}% ${curseur}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  get filialeDonutCenter(): { valeur: number; label: string; pct: number | null } {
    if (this.selectedFilialeSlice) {
      const item = this.filialesStats.find(f => f.nom === this.selectedFilialeSlice);
      if (item) return { valeur: item.valeur, label: item.nom, pct: item.pct };
    }
    const total = this.filialesStats.reduce((s, f) => s + f.valeur, 0);
    return { valeur: total, label: `${this.filialesStats.length} filiale(s)`, pct: null };
  }

  ngOnInit(): void {
    this.purgerCachesObsoletes();

    // Les reprises de démarrage ont déjà tourné : si l'une a neutralisé des
    // lignes, l'utilisateur doit l'apprendre ici et non le déduire d'un total
    // qui a bougé sans explication.
    this.messageRecalcul = messagePurge();

    // Les cours sont chargés une fois pour toute la console : c'est eux qui
    // ramènent au dinar les facteurs libellés en euros ou en dollars, et deux
    // chargements séparés donneraient deux résultats pour la même ligne.
    this.tauxChange.charger().subscribe();

    // Le rôle commande la navigation : il est lu avant tout le reste, pour
    // qu'aucun écran interdit ne s'affiche même le temps d'un cycle de rendu.
    this.rolesService.droits$.subscribe(droits => {
      this.droits = droits;
      this.userRole = this.rolesService.role ?? 'ADMINISTRATEUR';
      this.recadrerEcranActif();
      this.cdr.markForCheck();
    });

    // Les demandes d'accès suivent l'annuaire : approuver ici doit se voir
    // immédiatement dans le tableau, sans rechargement de la console.
    this.comptesService.enAttente$.subscribe(demandes => {
      this.demandesEnAttente = demandes;

      // La ligne s'ouvre sur ce que la demande propose. Une saisie déjà commencée
      // n'est pas écrasée : l'annuaire se rafraîchit à chaque écriture, y compris
      // pendant que le Master Admin choisit un rôle dans la liste.
      for (const demande of demandes) {
        this.decisions[demande.id] ??= {
          role: demande.role || 'MODERATEUR',
          affectation: demande.affectation || 'GROUPE_MISFAT'
        };
      }

      this.cdr.markForCheck();
    });

    // Une correction saisie dans l'écran de pilotage — ou dans un autre onglet —
    // recalcule aussitôt l'intensité carbone et la productivité.
    this.activiteService.donnees$.subscribe(() => this.cdr.markForCheck());

    // Écran demandé par l'URL — /settings/profile, /settings/team. Il est lu
    // après les droits : setActive refuse ce que le rôle n'autorise pas, et la
    // console retombe alors sur le tableau de bord.
    const ecran = this.route?.snapshot.data['ecran'];
    if (typeof ecran === 'string' && ecran) this.setActive(ecran);

    // Les lignes enregistrées avant que leur catégorie ne soit documentée
    // portent « non résolu » et pèsent zéro. Le référentiel désormais complet,
    // on les reprend une fois, puis on recalcule les agrégats.
    this.recalculService.reprendreLignesNonResolues().then(bilan => {
      if (!bilan.length) return;

      const reprises = bilan.reduce((somme, b) => somme + b.reprises, 0);
      const emissionKg = bilan.reduce((somme, b) => somme + b.emissionKg, 0);

      // Décompte mesuré, catégorie par catégorie : plus aucun chiffre d'exemple.
      console.log('[dashboard] Reprise des facteurs — bilan par catégorie :',
        bilan.map(b => ({
          catégorie: b.categorie,
          reprises: b.reprises,
          kgCO2e: Math.round(b.emissionKg),
          motif: b.ecartees.sansCandidat === -1
            ? 'catégorie sans facteur candidat au référentiel'
            : b.ecartees.sansQuantite
              ? `${b.ecartees.sansQuantite} ligne(s) sans quantité exploitable`
              : b.reprises ? '—' : 'rien à reprendre'
        }))
      );

      // Une reprise nulle ne mérite pas de bandeau : le log suffit.
      if (!reprises) { this.chargerStats(); this.cdr.detectChanges(); return; }

      this.messageRecalcul =
        `${reprises} ligne(s) sans facteur ont été reprises et valorisées `
        + `(${(emissionKg / 1000).toFixed(2)} tCO₂e).`;

      if (isDevMode()) console.log('[dashboard] Reprise des lignes non résolues :', bilan);

      this.chargerStats();
      this.cdr.detectChanges();
    });

    this.chargerFiliales();
    this.chargerAnnees();

    // Aucun chargement en propre ici : le filtre global n'émet qu'une fois
    // l'exercice par défaut arrêté, et l'abonnement ci-dessous s'en charge dès
    // cet instant. Un appel direct lisait le filtre de façon synchrone, donc
    // avant que la liste des exercices soit revenue : la requête partait sans
    // année, le serveur la lisait comme « tous les exercices », et le tableau
    // de bord affichait la somme de toutes les années sous le millésime en
    // cours avant de se corriger. Au rendu serveur, où il n'y a pas de seconde
    // réponse, ce total faux était le seul que la page portait.
    //
    // Une saisie enregistrée dans un écran de collecte doit se voir ici sans
    // changer de filtre ni recharger la page. Les cartes restaient sinon sur le
    // compte du dernier chargement, et le poste paraissait figé à zéro.
    this.abonnements.add(
      mesuresLocalesModifiees$.subscribe(() => {
        this.chargerStats();
        this.cdr.markForCheck();
      })
    );

    // Le header pilote le périmètre : le dashboard s'y aligne au lieu de
    // maintenir ses propres sélections en parallèle.
    this.entityService.filter$.subscribe(filtre => {
      this.selectedFilialeId = filtre.entityId ?? 'ALL';
      this.selectedUsineId = filtre.usineId ?? 'ALL';
      if (filtre.year !== null && filtre.year !== this.selectedAnnee) {
        this.selectedAnnee = filtre.year;
        // Le bandeau des taux suit l'exercice retenu dans l'en-tête.
        this.alignerDateSurAnnee(filtre.year);
      }
      if (filtre.entityId !== null) {
        this.organizationService.getUsinesByFiliale(filtre.entityId).subscribe({
          next: data => {
            this.usines = data;
            this.cdr.markForCheck();
          },
          error: err => console.error('Erreur lors du chargement des usines', err)
        });
      } else {
        this.usines = [];
      }
      this.chargerStats();
      this.chargerHistorique();
      this.chargerComparatifPays();
      this.cdr.markForCheck();
    });
  }

  /** Un import réussi rafraîchit les tableaux ET recalcule les agrégats. */
  onImported(): void {
    this.refreshToken++;
    this.chargerStats();
    this.cdr.markForCheck();
  }

  /**
   * Une écriture sur le référentiel des sociétés recharge les filtres.
   *
   * <p>Le donut par filiale et les badges de contexte lisent le pays, la devise
   * et le libellé sur la liste locale : sans ce rechargement, une société
   * créée n'apparaîtrait qu'au prochain démarrage de l'application.</p>
   */
  onSocietesModifiees(): void {
    this.chargerFiliales();
    this.chargerAnnees();
    this.chargerStats();
  }

  // ---------- GESTION DES FILTRES ----------
  changerFiltre(filtre: string | number): void {
    this.filtreActif = filtre;
    if (typeof filtre === 'number') {
      this.onUsineChange(filtre);
    } else {
      this.onUsineChange('ALL');
    }
  }

  // Les <select> du template renvoient des chaînes : on normalise en nombre
  // pour que les comparaisons avec les ids de l'API (numériques) soient justes.
  onFilialeChange(filialeId: number | string): void {
    const id = filialeId === 'ALL' ? 'ALL' : Number(filialeId);
    this.selectedFilialeId = id;
    this.selectedUsineId = 'ALL';
    this.usines = [];

    if (id !== 'ALL') {
      this.organizationService.getUsinesByFiliale(id).subscribe({
        next: (data) => {
          this.usines = data;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Erreur lors du chargement des usines', err)
      });
    }
  }

  onUsineChange(usineId: number | string): void {
    this.selectedUsineId = usineId === 'ALL' ? 'ALL' : Number(usineId);
  }

  onAnneeChange(annee: number): void {
    this.selectedAnnee = annee;
    this.alignerDateSurAnnee(annee);
  }

  onDateChange(date: string): void {
    this.selectedDate = date;
  }

  /**
   * Ramène la date de référence dans l'exercice sélectionné.
   *
   * <p>La date pilote la semaine du bandeau des taux : consulter l'exercice
   * 2025 avec une date de 2026 afficherait des cours postérieurs à la période
   * analysée, et valoriserait un bilan 2025 à des taux 2026. Le jour et le mois
   * sont conservés pour que l'utilisateur retrouve son repère saisonnier.</p>
   *
   * <p>L'exercice en cours fait exception : on y garde la date du jour, seule
   * date pour laquelle un cours est effectivement publié.</p>
   */
  private alignerDateSurAnnee(annee: number | null): void {
    if (annee == null) return;

    const aujourdhui = new Date();
    if (annee === aujourdhui.getFullYear()) {
      this.selectedDate = aujourdhui.toISOString().slice(0, 10);
      return;
    }

    const courante = new Date(`${this.selectedDate}T00:00:00`);
    const repere = isNaN(courante.getTime()) ? aujourdhui : courante;
    if (repere.getFullYear() === annee) return;

    // Le 29 février n'existe pas tous les ans : `Date` le reporte au 1er mars,
    // ce qui reste une date valide de l'exercice visé.
    const cible = new Date(annee, repere.getMonth(), repere.getDate());
    this.selectedDate = this.versIso(cible);
  }

  // ---------- REPÈRE TEMPOREL DE LA BANNIÈRE ----------

  /** Date de référence du périmètre, à défaut aujourd'hui. */
  private get jourReference(): Date {
    const date = new Date(`${this.selectedDate}T00:00:00`);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  /** « Lundi 03 août 2026 ». */
  get libelleJour(): string {
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const jour = this.jourReference;
    return `${jours[jour.getDay()]} ${jour.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    })}`;
  }

  /** « Semaine 32 · 03/08 → 09/08 ». */
  get libelleSemaine(): string {
    const jour = this.jourReference;
    const lundi = new Date(jour);
    // getDay() place dimanche à 0 : on le ramène en fin de semaine ISO.
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    const dimanche = new Date(lundi);
    dimanche.setDate(dimanche.getDate() + 6);

    const court = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `Semaine ${this.numeroSemaineIso(jour)} · ${court(lundi)} → ${court(dimanche)}`;
  }

  /** Numéro de semaine ISO 8601, celui qu'utilise le contrôle de gestion. */
  private numeroSemaineIso(jour: Date): number {
    const repere = new Date(Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate()));
    // Le jeudi de la semaine détermine l'année ISO de rattachement.
    repere.setUTCDate(repere.getUTCDate() + 4 - (repere.getUTCDay() || 7));
    const premierJanvier = new Date(Date.UTC(repere.getUTCFullYear(), 0, 1));
    return Math.ceil(((repere.getTime() - premierJanvier.getTime()) / 86400000 + 1) / 7);
  }

  /** Format `AAAA-MM-JJ` en heure locale ; `toISOString` décalerait d'un jour. */
  private versIso(date: Date): string {
    const mois = `${date.getMonth() + 1}`.padStart(2, '0');
    const jour = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${mois}-${jour}`;
  }

  onPeriodeChange(periode: string): void {
    this.selectedPeriode = periode;
  }

  resetFiltres(): void {
    this.selectedFilialeId = 'ALL';
    this.selectedUsineId = 'ALL';
    this.selectedDate = new Date().toISOString().slice(0, 10);
    this.selectedPeriode = 'ANNEE';
    this.filtreActif = 'ALL';
    if (this.annees.length > 0) {
      const enCours = this.annees.find(a => a.statut === 'EN_COURS');
      this.selectedAnnee = enCours ? enCours.valeur : this.annees[this.annees.length - 1].valeur;
    }
  }

  // ---------- CHARGEMENT DES DONNÉES DE L'ORGANISATION ----------
  chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: (data) => {
        this.filiales = data;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Erreur lors du chargement des filiales', err)
    });
  }

  chargerAnnees(): void {
    this.organizationService.getAnnees().subscribe({
      next: (data) => {
        this.annees = data;
        const enCours = data.find(a => a.statut === 'EN_COURS');
        this.selectedAnnee = enCours ? enCours.valeur : (data.length ? data[data.length - 1].valeur : null);
        // L'axe des abscisses de l'histogramme suit cette liste : un exercice
        // ouvert depuis les paramètres y apparaît sans intervention.
        this.chargerHistorique();
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Erreur lors du chargement des années', err)
    });
  }

  // ---------- MÉTHODES D'ANALYSE & KPIS ----------
  private construireKpi(id: string, label: string, icone: string, couleur: string, unite: string,
                        valeurs: { annee: number; valeur: number; provisoire?: boolean }[]): KpiEntreprise {
    // Une série vide donnerait `-Infinity` : le maximum est borné à zéro, et
    // la carte affiche son état vide plutôt qu'une hauteur de barre absurde.
    const max = valeurs.length ? Math.max(...valeurs.map(v => v.valeur)) : 0;
    const donnees: DonneeAnnuelle[] = valeurs.map(v => ({
      ...v,
      hauteurBarre: max > 0 ? Math.max((v.valeur / max) * 100, 8) : 8
    }));
    return { id, label, icone, couleur, unite, donnees };
  }

  getCroissance(kpi: KpiEntreprise): number {
    const complets = kpi.donnees.filter(d => !d.provisoire);
    if (complets.length < 2) return 0;
    const dernier = complets[complets.length - 1].valeur;
    const avantDernier = complets[complets.length - 2].valeur;
    return avantDernier !== 0 ? ((dernier - avantDernier) / avantDernier) * 100 : 0;
  }

  /** Dernier point de la série ; un point neutre quand elle est vide. */
  getValeurActuelle(kpi: KpiEntreprise): DonneeAnnuelle {
    return kpi.donnees[kpi.donnees.length - 1]
      ?? { annee: this.selectedAnnee ?? new Date().getFullYear(), valeur: 0, hauteurBarre: 8 };
  }

  // ---------- CONTEXTE ACTIF : PAYS, DEVISE, PÉRIODE ----------
  get profilActif(): ProfilFiliale | null {
    if (this.selectedFilialeId === 'ALL') return null;
    return this.profilDe(this.filiales.find(f => f.id === this.selectedFilialeId));
  }

  /** Devise de restitution des montants (TND en consolidation groupe). */
  get devise(): string {
    return this.profilActif ? this.profilActif.devise : 'TND';
  }

  /** Libellé du badge devise : multi-devise tant qu'aucune filiale n'est choisie. */
  get deviseBadge(): string {
    return this.profilActif ? this.profilActif.devise : 'Multi-devise';
  }

  get paysActif(): string {
    return this.profilActif ? this.profilActif.pays : 'Groupe MISFAT';
  }

  /** Emoji drapeau d'un pays ; pavillon neutre pour un pays non répertorié. */
  drapeauDe(pays: string | null | undefined): string {
    const parPays: { [pays: string]: string } = {
      Tunisie: '🇹🇳', Maroc: '🇲🇦', France: '🇫🇷', Algérie: '🇩🇿', Italie: '🇮🇹', Espagne: '🇪🇸'
    };
    return parPays[(pays ?? '').trim()] ?? '🏳️';
  }

  /**
   * Drapeaux affichés dans l'en-tête.
   *
   * <p>En vue consolidée, seuls les pays où le groupe est réellement implanté
   * sont montrés : la liste suit les sociétés en base et s'étend d'elle-même à
   * chaque nouvelle implantation.</p>
   */
  get drapeaux(): string[] {
    if (this.profilActif) return [this.drapeauDe(this.profilActif.pays)];

    const pays = [...new Set(
      this.filiales.map(f => f.pays?.trim()).filter((p): p is string => !!p)
    )];
    return pays.length ? pays.map(p => this.drapeauDe(p)) : ['🏳️'];
  }

  get vueActive(): string {
    if (this.selectedUsineId === 'ALL') return 'Toutes les usines';
    const usine = this.usines.find(u => u.id === this.selectedUsineId);
    return usine ? usine.nom : 'Toutes les usines';
  }

  get periodeActive(): PeriodeOption {
    return this.periodes.find(p => p.code === this.selectedPeriode) || this.periodes[this.periodes.length - 1];
  }

  get filialeLabel(): string {
    if (this.selectedFilialeId === 'ALL') return 'Tous les pays';
    const filiale = this.filiales.find(f => f.id === this.selectedFilialeId);
    return filiale ? filiale.libelle : 'Tous les pays';
  }

  // ---------- STATISTIQUES FILTRÉES ----------
  /**
   * Empreinte du périmètre courant, telle que calculée par la base.
   *
   * <p>Aucun repli de démonstration : sur un périmètre sans mesure, le tableau
   * de bord affiche des zéros et le signale explicitement. Un jeu fictif se
   * confondrait avec de vrais chiffres et fausserait toute lecture de la
   * trajectoire carbone.</p>
   */
  get stats(): { totalCO2: number; scope1: number; scope2: number; scope3: number } {
    const r = this.statsReelles;
    return {
      totalCO2: r?.total ?? 0,
      scope1: r?.scope1 ?? 0,
      scope2: r?.scope2 ?? 0,
      scope3: r?.scope3 ?? 0
    };
  }

  /** Indique si l'affichage repose sur des mesures effectivement enregistrées. */
  get statsSontReelles(): boolean {
    return !!this.statsReelles && this.statsReelles.measureCount > 0;
  }

  // ---------- KPIS ENTREPRISE ----------

  /**
   * Séries extra-financières du périmètre, telles que l'écran de pilotage les
   * tient.
   *
   * <p>Elles ne sont plus codées en dur : l'écran « Données d'Activité & KPI »
   * en est la source unique, et une correction saisie là se répercute ici sans
   * délai. Un exercice non renseigné n'apparaît pas dans la série — l'y porter
   * à zéro ferait chuter toutes les courbes sans qu'aucune activité n'ait
   * baissé.</p>
   */
  private serieActivite(champ: ChampActivite, diviseur = 1): { annee: number; valeur: number }[] {
    return this.activiteService.liste(this.entiteActive)
      .map(releve => ({ annee: releve.annee, valeur: releve[champ] }))
      .filter((point): point is { annee: number; valeur: number } =>
        typeof point.valeur === 'number' && Number.isFinite(point.valeur))
      .map(point => ({ annee: point.annee, valeur: point.valeur / diviseur }));
  }

  /** Société consultée, sous la forme attendue par l'annuaire d'activité. */
  private get entiteActive(): number | null {
    return typeof this.selectedFilialeId === 'number' ? this.selectedFilialeId : null;
  }

  /**
   * Exercices présents dans les données affichées.
   *
   * <p>La plage se lit sur l'historique qui alimente le graphique d'évolution.
   * Elle retombe sur les exercices de référence tant que les bilans ne sont
   * pas revenus : l'en-tête ne doit pas afficher de plage vide pendant le
   * chargement.</p>
   */
  private get anneesConnues(): number[] {
    const source = this.historique.length
      ? this.historique.map(point => point.annee)
      : this.annees.map(annee => annee.valeur);
    return source.filter(annee => Number.isFinite(annee));
  }

  /** Exercice le plus ancien présent dans les données, s'il en existe un. */
  get anneeMin(): number | null {
    const annees = this.anneesConnues;
    return annees.length ? Math.min(...annees) : null;
  }

  /** Exercice le plus récent présent dans les données, s'il en existe un. */
  get anneeMax(): number | null {
    const annees = this.anneesConnues;
    return annees.length ? Math.max(...annees) : null;
  }

  /**
   * Plage inscrite derrière « Performance MISFAT ».
   *
   * <p>Un exercice unique s'écrit sans tiret : « 2026 » et non
   * « 2026–2026 ». Aucun exercice connu n'écrit rien plutôt qu'un tiret
   * orphelin.</p>
   */
  get plageAnnees(): string {
    const min = this.anneeMin;
    const max = this.anneeMax;
    if (min === null || max === null) {
      return '';
    }
    return min === max ? `${min}` : `${min}–${max}`;
  }

  get kpisEntreprise(): KpiEntreprise[] {
    const arrondir = (serie: { annee: number; valeur: number }[], decimales: number) => {
      const f = Math.pow(10, decimales);
      return serie.map(v => ({ ...v, valeur: Math.round(v.valeur * f) / f }));
    };

    return [
      this.construireKpi('ca', 'Chiffre d\'Affaires', '💰', '#9333ea', `M ${this.devise}`,
        arrondir(this.serieActivite('chiffreAffairesM'), 2)),
      this.construireKpi('effectifs', 'Effectif Employés', '👥', '#0284c7', 'employés',
        arrondir(this.serieActivite('effectif'), 0)),
      this.construireKpi('production', 'Volume de Production', '📦', '#ea580c', 'M unités',
        arrondir(this.serieActivite('production', 1_000_000), 2)),
      this.construireKpi('ventes', 'Ventes', '🛒', '#16a34a', 'M unités',
        arrondir(this.serieActivite('ventes', 1_000_000), 2))
    ];
  }

  /** Vrai tant qu'aucune donnée d'activité n'a été saisie pour ce périmètre. */
  get activiteAbsente(): boolean {
    return this.activiteService.liste(this.entiteActive).length === 0;
  }

  get totalEmissions(): number {
    return this.stats.scope1 + this.stats.scope2 + this.stats.scope3;
  }

  get usinesFiltered(): Usine[] {
    if (this.selectedFilialeId === 'ALL') {
      return this.usines;
    }
    return this.usines.filter(u => u.filialeId === this.selectedFilialeId);
  }

  /** Postes d'un scope relevés en base, triés par contribution décroissante. */
  private detailsDuScope(code: string): { nom: string; valeur: number }[] {
    const carte = this.statsReelles?.byScopeCategory?.[code] ?? {};
    return Object.entries(carte)
      .map(([nom, valeur]) => ({ nom, valeur }))
      .sort((a, b) => b.valeur - a.valeur);
  }

  get scope1Details(): { nom: string; valeur: number }[] {
    return this.detailsDuScope('SCOPE_1');
  }

  get scope2Details(): { nom: string; valeur: number }[] {
    return this.detailsDuScope('SCOPE_2');
  }

  /**
   * Dénominateur extra-financier de l'exercice consulté.
   *
   * <p>Lu sur l'exercice affiché, et non sur le dernier exercice renseigné :
   * rapporter l'empreinte de 2024 à la production de 2026 donnerait un ratio
   * qui ne documente aucune année.</p>
   */
  private denominateur(champ: ChampActivite): number | null {
    return this.activiteService.valeur(this.entiteActive, this.selectedAnnee, champ);
  }

  /**
   * Intensité carbone : kgCO₂e par unité produite.
   *
   * <p>L'empreinte est tenue en tonnes ; elle passe au kilogramme parce qu'une
   * pièce de filtration pèse quelques centaines de grammes de CO₂ et que
   * l'exprimer en tonnes ne donnerait que des zéros. Même unité que la colonne
   * correspondante de la consolidation Groupe.</p>
   *
   * <p>{@code null} — et non zéro — quand la production n'est pas renseignée :
   * un zéro se lirait comme une intensité nulle, c'est-à-dire comme une
   * performance parfaite, là où il n'y a simplement rien à diviser.</p>
   */
  get intensiteCarbone(): number | null {
    return rapport(tonnesVersKg(this.totalEmissions), this.denominateur('production'));
  }

  /**
   * Intensité par salarié, en tCO₂e.
   *
   * <p>En tonnes, comme la consolidation Groupe : l'empreinte d'un salarié se
   * compte en tonnes, et le kilogramme donnerait des nombres à six chiffres
   * sans rien gagner en lisibilité.</p>
   */
  get intensiteEffectif(): number | null {
    return rapport(this.totalEmissions, this.denominateur('effectif'));
  }

  /**
   * Intensité par million de chiffre d'affaires, en tCO₂e.
   *
   * <p>Le chiffre d'affaires est déjà tenu en millions par l'écran « Données
   * d'Activité » : il sert de dénominateur tel quel, et le ratio se lit « tant
   * de tonnes par million ».</p>
   */
  get intensiteChiffreAffaires(): number | null {
    return rapport(this.totalEmissions, this.denominateur('chiffreAffairesM'));
  }

  /**
   * Productivité carbone : valeur économique produite par tonne émise.
   *
   * <p>L'inverse de l'intensité au chiffre d'affaires, et le sens dans lequel
   * un comité de direction lit la performance : combien l'entreprise crée de
   * richesse pour chaque tonne qu'elle émet. Plus le ratio monte, mieux
   * c'est — là où toutes les intensités se lisent à la baisse.</p>
   *
   * <p>La carte portait auparavant un chiffre d'affaires par salarié : une
   * productivité économique, sans aucun CO₂ au numérateur ni au dénominateur,
   * qui n'avait pas sa place parmi les indicateurs carbone.</p>
   *
   * <p>Le chiffre d'affaires est ramené des millions à l'unité pour que le
   * ratio s'exprime dans la devise du périmètre.</p>
   */
  get productiviteCarbone(): number | null {
    const chiffreAffairesM = this.denominateur('chiffreAffairesM');
    if (typeof chiffreAffairesM !== 'number' || chiffreAffairesM <= 0) return null;

    return rapport(chiffreAffairesM * 1_000_000, this.totalEmissions);
  }

  // ---------- CARTES DE SYNTHÈSE : SÉRIES ET TENDANCES ----------

  /**
   * Intensité carbone par exercice, en kg CO₂e par unité produite.
   *
   * <p>L'empreinte est lue sur l'historique déjà chargé pour le graphique
   * d'évolution — {@code PointHistorique.total} est en tonnes, ramenées au
   * kilogramme pour que le ratio s'exprime en kgCO₂e — et la production sur les
   * relevés d'activité. Un exercice sans production renseignée est écarté : le
   * ratio n'aurait pas de dénominateur.</p>
   */
  private get serieIntensite(): { annee: number; valeur: number }[] {
    return this.serieRatio(point => rapport(
      tonnesVersKg(point.total),
      this.activiteService.valeur(this.entiteActive, point.annee, 'production')));
  }

  /**
   * Productivité carbone par exercice.
   *
   * <p>Même formule que {@link productiviteCarbone}, étendue à toute la série
   * pour que la variation se calcule sur l'exercice consulté.</p>
   */
  private get serieProductiviteCarbone(): { annee: number; valeur: number }[] {
    return this.serieRatio(point => {
      const chiffreAffairesM =
        this.activiteService.valeur(this.entiteActive, point.annee, 'chiffreAffairesM');
      if (typeof chiffreAffairesM !== 'number' || chiffreAffairesM <= 0) return null;

      return rapport(chiffreAffairesM * 1_000_000, point.total);
    });
  }

  /**
   * Série d'un ratio sur l'historique déjà chargé pour le graphique d'évolution.
   *
   * <p>Un exercice dont le ratio n'est pas calculable est écarté plutôt que
   * porté à zéro : une année sans dénominateur creuserait un puits dans la
   * courbe, et la variation d'un exercice à l'autre s'y lirait comme un
   * effondrement de l'empreinte.</p>
   */
  private serieRatio(
    calcul: (point: PointHistorique) => number | null
  ): { annee: number; valeur: number }[] {

    const serie: { annee: number; valeur: number }[] = [];

    for (const point of this.historique) {
      const valeur = calcul(point);
      if (valeur !== null) serie.push({ annee: point.annee, valeur });
    }

    return serie;
  }

  /**
   * Variation d'une série entre l'exercice consulté et le précédent renseigné.
   *
   * <p>Le point de référence est l'exercice sélectionné dans le tableau de
   * bord ; faute de relevé cette année-là, c'est le dernier exercice de la
   * série, celui que la carte affiche déjà. La variation est enveloppée dans un
   * objet pour qu'une variation nulle reste distincte de son absence :
   * {@code null} fait masquer le badge.</p>
   */
  private tendanceSerie(serie: { annee: number; valeur: number }[]): { pct: number } | null {
    if (serie.length < 2) return null;

    const consulte = serie.findIndex(point => point.annee === this.selectedAnnee);
    const index = consulte >= 0 ? consulte : serie.length - 1;
    if (index < 1) return null;

    const precedent = serie[index - 1].valeur;
    if (precedent <= 0) return null;

    return { pct: ((serie[index].valeur - precedent) / precedent) * 100 };
  }

  /** Variations affichées par les trois cartes de synthèse. */
  get tendanceIntensite(): { pct: number } | null {
    return this.tendanceSerie(this.serieIntensite);
  }

  get tendanceProduction(): { pct: number } | null {
    return this.tendanceSerie(this.serieActivite('production', 1_000_000));
  }

  get tendanceProductivite(): { pct: number } | null {
    return this.tendanceSerie(this.serieProductiviteCarbone);
  }

  /**
   * Commentaire de la carte de productivité carbone.
   *
   * <p>L'exercice cité est celui sélectionné dans le tableau de bord, et non le
   * dernier relevé de la série : les deux divergent dès qu'on consulte une
   * année antérieure.</p>
   *
   * <p>Le sens de lecture est inverse de celui des intensités : une
   * productivité qui monte est une bonne nouvelle, puisqu'elle dit que la même
   * tonne émise porte davantage de valeur.</p>
   */
  get noteProductivite(): string {
    if (this.productiviteCarbone === null) {
      return "Renseignez le chiffre d'affaires dans « Données d'Activité & KPI » pour que la "
        + 'productivité carbone devienne calculable.';
    }

    const tendance = this.tendanceProductivite;
    if (tendance === null) {
      return 'Première année de suivi disponible.';
    }

    const annee = this.selectedAnnee ?? new Date().getFullYear();
    return tendance.pct >= 0
      ? `Davantage de valeur par tonne émise en ${annee}.`
      : `Recul en ${annee} : chaque tonne émise porte moins de valeur.`;
  }

  // ---------- COURBES LISSÉES (AREA CHARTS) ----------
  /**
   * Repère SVG des séries : viewBox 0 0 100 26, marge verticale de 3.
   *
   * <p>Seuls les cinq derniers exercices sont tracés : au-delà, les points se
   * resserrent au point de rendre la courbe illisible dans une carte de cette
   * largeur.</p>
   */
  private pointsCourbe(kpi: KpiEntreprise): { x: number; y: number }[] {
    const vals = kpi.donnees.slice(-5).map(d => d.valeur);
    if (!vals.length) return [];
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const amplitude = max - min || 1;
    const pasX = vals.length > 1 ? 100 / (vals.length - 1) : 100;
    return vals.map((v, i) => ({
      x: +(i * pasX).toFixed(2),
      y: +(23 - ((v - min) / amplitude) * 20).toFixed(2)
    }));
  }

  /** Tracé de la courbe, lissé par cubiques de Bézier à tangente horizontale. */
  getCourbe(kpi: KpiEntreprise): string {
    const p = this.pointsCourbe(kpi);
    if (p.length < 2) return '';
    let d = `M ${p[0].x} ${p[0].y}`;
    for (let i = 0; i < p.length - 1; i++) {
      const milieuX = +((p[i].x + p[i + 1].x) / 2).toFixed(2);
      d += ` C ${milieuX} ${p[i].y}, ${milieuX} ${p[i + 1].y}, ${p[i + 1].x} ${p[i + 1].y}`;
    }
    return d;
  }

  /** Même tracé, refermé sur la ligne de base pour le remplissage dégradé. */
  getAire(kpi: KpiEntreprise): string {
    const courbe = this.getCourbe(kpi);
    if (!courbe) return '';
    const p = this.pointsCourbe(kpi);
    return `${courbe} L ${p[p.length - 1].x} 26 L ${p[0].x} 26 Z`;
  }

  getMarqueurs(kpi: KpiEntreprise): { x: number; y: number }[] {
    return this.pointsCourbe(kpi);
  }

  // ---------- GESTION DES GRAPHIQUES (DONUT & SCOPES) ----------
  toggleScopeSlice(nom: string): void {
    this.selectedScopeSlice = this.selectedScopeSlice === nom ? null : nom;
  }

  /**
   * Parts du donut par scope, alimentées par l'agrégat de la base.
   *
   * <p>Aucune valeur n'est codée en dur : sur une base sans mesure, les trois
   * scopes ressortent à zéro et le graphique affiche son état vide plutôt qu'un
   * jeu de démonstration qui se confondrait avec de vrais chiffres.</p>
   */
  get scopeDonutItems(): { nom: string; total: number; pct: number; couleur: string }[] {
    return this.scopesStats.map(s => ({
      nom: s.nom,
      total: s.valeur,
      pct: s.pct,
      couleur: s.couleur
    }));
  }

  /** Vrai tant qu'aucune mesure du périmètre n'alimente les graphiques. */
  get aucuneDonneeAgregee(): boolean {
    return !this.statsReelles || this.statsReelles.measureCount === 0;
  }

  get scopeDonutGradient(): string {
    let cursor = 0;
    const stops = this.scopeDonutItems.map(it => {
      const start = cursor;
      cursor += it.pct;
      const color = (this.selectedScopeSlice && this.selectedScopeSlice !== it.nom) ? '#e2e8f0' : it.couleur;
      return `${color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  get scopeDonutCenter(): { value: number; label: string; pct: number | null; focused: boolean } {
    if (this.selectedScopeSlice) {
      const it = this.scopeDonutItems.find(i => i.nom === this.selectedScopeSlice);
      if (it) return { value: it.total, label: it.nom, pct: it.pct, focused: true };
    }
    const total = this.scopeDonutItems.reduce((s, i) => s + i.total, 0);
    return { value: total, label: `${this.uniteStats} total`, pct: null, focused: false };
  }

  toggleScope3Slice(nom: string): void {
    this.selectedScope3Slice = this.selectedScope3Slice === nom ? null : nom;
  }

  /**
   * Les 15 catégories du Scope 3, triées par contribution décroissante.
   *
   * <p>La nomenclature complète est conservée : une catégorie non collectée
   * ressort à zéro plutôt que de disparaître, ce qui laisserait croire que le
   * périmètre GHG est couvert alors qu'il ne l'est que partiellement.</p>
   */
  get scope3Full(): { nom: string; total: number; pct: number; couleur: string }[] {
    return this.scope3Postes
      .map(poste => ({ nom: poste.nom, total: poste.valeur, pct: poste.pct }))
      .sort((a, b) => b.total - a.total)
      .map((item, i) => ({ ...item, couleur: this.scope3Palette[i % this.scope3Palette.length] }));
  }


  // ---------- UI & NAVIGATION LATÉRALE ----------
  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  /** Compte rendu de la dernière décision, affiché au-dessus du tableau. */
  messageAcces = '';

  /** Approuve une demande : l'intéressé peut se connecter dès maintenant. */
  /**
   * Valide une demande en affectant le rôle retenu.
   *
   * <p>Le rôle et le périmètre appliqués sont ceux choisis dans la ligne, non
   * ceux que la demande proposait : l'attribution des accès est un acte
   * administratif, et le demandeur ne se donne pas ses propres droits.</p>
   */
  accepterDemande(compte: Compte): void {
    const decision = this.decisions[compte.id];
    this.comptesService.approuver(compte.id, decision);

    const role = decision?.role || compte.role;
    this.messageAcces = `${compte.firstName} ${compte.lastName} peut désormais se connecter `
      + `avec l'adresse ${compte.email}, en tant que ${role}.`;

    delete this.decisions[compte.id];
    this.cdr.markForCheck();
  }

  refuserDemande(compte: Compte): void {
    this.comptesService.refuser(compte.id);
    this.messageAcces = `La demande de ${compte.firstName} ${compte.lastName} a été refusée.`;
    delete this.decisions[compte.id];
    this.cdr.markForCheck();
  }

  /** Referme la session et ramène à l'écran de connexion. */
  allerAAccueil(): void {
    this.sessionService.fermer();
    this.router.navigate(['/signin']);
  }

  toggleMenu(menuName: keyof typeof this.menus): void {
    this.menus[menuName] = !this.menus[menuName];
    if (menuName === 'mesureCategories' && !this.menus.mesureCategories) {
      this.activeScope = null;
    }
  }

  /** Déploie ou replie un scope, sans jamais changer l'onglet actif. */
  toggleScope(scopeId: string, evenement?: Event): void {
    evenement?.stopPropagation();
    this.activeScope = this.activeScope === scopeId ? null : scopeId;
  }

  isCategory(id: string): boolean {
    return this.scopesData.some(scope => scope.categories.some(cat => cat.id === id));
  }

  /**
   * Catégories disposant d'un écran de saisie.
   *
   * <p>Le menu latéral propose la nomenclature GHG complète, dont toutes les
   * catégories ne sont pas encore développées. Sans cette liste, cliquer sur
   * l'une d'elles n'afficherait rien du tout : l'utilisateur ne saurait pas
   * distinguer un écran manquant d'une panne.</p>
   */
  private readonly ecransDisponibles = new Set([
    'combustion-etablissements', 'combustion-vehicules', 'emissions-refrigerants',
    'electricite-achetee',
    'biens-services', 'biens-equipement', 'energie', 'transport-amont', 'dechets',
    'voyages-affaires', 'deplacements-employes', 'actifs-loues-amont',
    'transport-aval', 'transformation-produits', 'utilisation-produits',
    'fin-de-vie-produits', 'actifs-loues-aval', 'franchises', 'investissements'
  ]);

  /** Vrai quand la catégorie active dispose d'un écran de saisie. */
  ecranDisponible(sub: string): boolean {
    return this.ecransDisponibles.has(sub);
  }

  /** Libellé de la catégorie active, pour l'écran d'attente. */
  libelleCategorie(sub: string): string {
    for (const scope of this.scopesData) {
      const trouvee = scope.categories.find(cat => cat.id === sub);
      if (trouvee) return `${trouvee.icone} ${trouvee.nom}`;
    }
    return sub;
  }

  /**
   * Déploie ou replie le sous-menu des catégories de mesure.
   *
   * <p>Ce bouton ne pilote qu'un repli : il ne doit jamais devenir l'onglet
   * actif. Lui laisser écraser {@code activeSub} faisait perdre la catégorie
   * choisie dès qu'un clic l'atteignait, par propagation ou par recouvrement,
   * et l'écran retombait sur une valeur sans contenu de saisie.</p>
   */
  basculerSousMenuMesure(evenement?: Event): void {
    evenement?.stopPropagation();

    this.menus.mesureCategories = !this.menus.mesureCategories;
    if (!this.menus.mesureCategories) this.activeScope = null;

    if (isDevMode()) {
      console.log('Sous-menu Mesure', this.menus.mesureCategories ? 'déployé' : 'replié',
                  '| onglet conservé :', this.activeSub);
    }
  }

  /**
   * Retient la catégorie cliquée.
   *
   * <p>{@code stopPropagation} garantit qu'aucun gestionnaire parent ne
   * réagira au même clic et ne réécrira l'onglet juste après.</p>
   */
  setActive(sub: string, evenement?: Event): void {
    evenement?.stopPropagation();

    // « mesure » n'est pas un écran : c'est l'en-tête du sous-menu. L'accepter
    // comme onglet ferait perdre la catégorie choisie à chaque clic qui
    // l'atteint, par propagation ou par recouvrement.
    if (sub === 'mesure') {
      this.basculerSousMenuMesure();
      return;
    }

    // Un écran hors des droits du rôle ne s'ouvre pas, même si un lien y mène
    // encore : le menu peut avoir été masqué après coup, le clic non.
    if (!this.ecranAutorise(sub)) {
      if (isDevMode()) console.warn('[dashboard] Écran refusé au rôle actif :', sub, this.droits.profil);
      return;
    }

    this.activeSub = sub;

    // Trace de navigation, utile pour rapprocher un écran vide d'un clic.
    if (isDevMode()) {
      console.log('Onglet actif changé vers :', sub,
                  '| écran disponible :', this.ecranDisponible(sub));
    }

    if (sub === 'facteurs' || sub === 'referentiel-carbone') {
      this.menus.emissions = true;
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
    else if (this.isCategory(sub)) {
      this.menus.mesureCategories = true;
      const parentScope = this.scopesData.find(scope => scope.categories.some(cat => cat.id === sub));
      if (parentScope) {
        this.activeScope = parentScope.id;
      }
    }
    else {
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
  }
}