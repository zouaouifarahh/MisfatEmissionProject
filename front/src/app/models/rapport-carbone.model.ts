import { BilanCarbone, PosteBilan, ScopeBilan } from '../core/bilan-carbone.service';

/**
 * Modèle du rapport de bilan carbone exhaustif.
 *
 * <p>Le rapport se compose sur {@link BilanCarbone}, qui porte déjà les scopes,
 * les postes et leurs quotes-parts : rien n'y est redéclaré. Ce fichier ajoute
 * ce que l'inventaire ne calcule pas — la ventilation par gaz, les ratios
 * d'intensité, le benchmark, la vulnérabilité, le plan d'action et la
 * trajectoire SBTi.</p>
 *
 * <p><strong>Aucune valeur n'est saisie dans le rapport.</strong> Tout chiffre
 * remonte du bilan ou des données d'activité ; le rédacteur amende les
 * commentaires, jamais les nombres. C'est ce qui garantit qu'un rapport imprimé
 * et l'écran qui l'a produit ne se contredisent pas.</p>
 */

// ---------------------------------------------------------------------------
// SECTION 1 — SYNTHÈSE EXÉCUTIVE
// ---------------------------------------------------------------------------

/** Indicateur de tête, tel que la synthèse le présente. */
export interface IndicateurCle {
  id: string;
  libelle: string;
  /** Valeur en tCO₂e, ou dans l'unité portée par {@link unite}. */
  valeur: number;
  unite: string;
  /** Part dans le total, en pourcentage ; `null` quand la notion ne s'applique pas. */
  pct: number | null;
  /** Variation par rapport à l'exercice précédent, en pourcentage. */
  variationPct: number | null;
  /** Vrai lorsqu'une hausse est défavorable — le cas de toute émission. */
  hausseDefavorable: boolean;
}

/** Poste émetteur du classement de tête. */
export interface PosteMajeur {
  rang: number;
  libelle: string;
  scopeCode: string;
  emissionTonnes: number;
  pctTotal: number;
  /** Cumul des postes jusqu'à celui-ci : donne à lire la concentration. */
  pctCumule: number;
}

export interface SyntheseExecutive {
  indicateurs: IndicateurCle[];
  postesMajeurs: PosteMajeur[];
  /** Nombre de postes concentrant 80 % de l'empreinte. */
  postesPourQuatreVingts: number;
  /** Constats rédigés, dérivés des chiffres et non saisis. */
  constats: string[];
}

// ---------------------------------------------------------------------------
// SECTION 2 — CADRE MÉTHODOLOGIQUE & PÉRIMÈTRE
// ---------------------------------------------------------------------------

/** Approche de consolidation retenue au sens du GHG Protocol. */
export type ApprocheConsolidation = 'CONTROLE_OPERATIONNEL' | 'CONTROLE_FINANCIER' | 'PART_CAPITAL';

/** Méthode de comptabilisation du Scope 2. */
export type MethodeScope2 = 'LOCATION_BASED' | 'MARKET_BASED';

export interface PerimetreRapport {
  approche: ApprocheConsolidation;
  libelleApproche: string;
  justification: string;
  /** Sociétés retenues au périmètre. */
  entitesIncluses: string[];
  entitesExclues: string[];
  /** Établissements couverts, nommés comme les écrans les nomment. */
  etablissements: string[];
  anneeReference: number | null;
  periodeDebut: string;
  periodeFin: string;
  methodeScope2: MethodeScope2;
  /** Catégories du Scope 3 volontairement hors périmètre, à documenter. */
  exclusionsScope3: { numero: number; intitule: string; motif: string }[];
}

/** Niveau de confiance d'une donnée, sur cinq crans. */
export type NiveauQualite = 'TRES_ELEVEE' | 'ELEVEE' | 'MOYENNE' | 'FAIBLE' | 'TRES_FAIBLE';

export interface QualiteDonnee {
  poste: string;
  source: string;
  facteurApplique: string;
  qualite: NiveauQualite;
  /** Incertitude estimée en pourcentage ; `null` si non chiffrable. */
  incertitudePct: number | null;
  observation: string;
}

export interface CadreMethodologique {
  referentiels: string[];
  perimetre: PerimetreRapport;
  qualite: QualiteDonnee[];
  /** Réserve non levée : le rapport ne doit pas sortir en l'état. */
  reserves: string[];
}

// ---------------------------------------------------------------------------
// SECTION 3 — ANALYSE DES GAZ À EFFET DE SERRE
// ---------------------------------------------------------------------------

/** Gaz couvert par l'inventaire, avec son potentiel de réchauffement. */
export interface GazEffetSerre {
  formule: string;
  nom: string;
  /** PRG à 100 ans, tel que le référentiel retenu le fixe. */
  prg100: number;
  /** Référentiel du PRG : « AR5 » ou « AR6 ». */
  referentielPrg: string;
  /** Contribution du gaz à l'empreinte, en tCO₂e. */
  contributionTonnes: number;
  pctTotal: number;
  sourcesPrincipales: string[];
}

/**
 * Facteur d'émission propre à un pays.
 *
 * <p>Le mix électrique d'un pays n'est pas celui d'un autre : le même
 * kilowattheure consommé en Tunisie et au Maroc ne porte pas la même empreinte.
 * Le rapport doit nommer le facteur appliqué, faute de quoi son chiffre n'est
 * pas vérifiable.</p>
 */
export interface FacteurPays {
  pays: string;
  drapeau: string;
  /** Intitulé du facteur : « Électricité réseau », « Gaz naturel »… */
  libelle: string;
  valeur: number;
  /** Unité du dénominateur : kWh, L, kg… reprise de EmissionFactor.unit. */
  unite: string;
  uniteNumerateur: string;
  source: string;
  anneeReference: number;
  incertitudePct: number | null;
}

export interface AnalyseGaz {
  gaz: GazEffetSerre[];
  facteursPays: FacteurPays[];
  /** Part des émissions issues de facteurs propres au pays consulté. */
  pctFacteursLocalises: number;
  commentaires: string[];
}

// ---------------------------------------------------------------------------
// SECTION 4 — DÉCOMPOSITION DES SCOPES
// ---------------------------------------------------------------------------

/**
 * Décomposition d'un scope, enrichie pour le rapport.
 *
 * <p>{@link ScopeBilan} porte déjà les postes et leurs parts. S'y ajoutent ici
 * la lecture analytique et les leviers, que l'inventaire ne produit pas.</p>
 */
export interface DecompositionScope {
  scope: ScopeBilan;
  /** Postes collectés, du plus lourd au plus léger. */
  postesRetenus: PosteBilan[];
  /** Postes de la nomenclature restés sans mesure. */
  postesAbsents: PosteBilan[];
  /** Trois lectures au plus : ce que le chiffre dit, et ce qu'il ne dit pas. */
  analyses: string[];
  leviers: string[];
  /** Emplacement réservé à la capture du tableau de bord. */
  illustration: string;
}

export interface DecompositionScopes {
  scope1: DecompositionScope;
  scope2: DecompositionScope;
  scope3: DecompositionScope;
  /** Postes relevés en base mais absents de la nomenclature interne. */
  horsNomenclature: BilanCarbone['horsNomenclature'];
}

// ---------------------------------------------------------------------------
// SECTION 5 — RATIOS, BENCHMARK & VULNÉRABILITÉ
// ---------------------------------------------------------------------------

export interface RatioIntensite {
  id: string;
  libelle: string;
  valeur: number;
  unite: string;
  /** Dénominateur employé, nommé pour que le ratio soit reproductible. */
  denominateur: string;
  valeurDenominateur: number | null;
  /** Fourchette sectorielle indicative ; jamais présentée comme auditée. */
  fourchetteBasse: number | null;
  fourchetteHaute: number | null;
  /** Vrai lorsque la valeur sort de la fourchette : appelle une explication. */
  horsFourchette: boolean;
}

/** Exposition à un risque de transition ou physique. */
export interface Vulnerabilite {
  id: string;
  intitule: string;
  nature: 'TRANSITION' | 'PHYSIQUE';
  /** Exposition en tCO₂e ou en montant, selon le risque. */
  exposition: number;
  uniteExposition: string;
  probabilite: 'FAIBLE' | 'MOYENNE' | 'ELEVEE';
  impact: 'FAIBLE' | 'MOYEN' | 'ELEVE';
  commentaire: string;
}

export interface RatiosEtVulnerabilite {
  ratios: RatioIntensite[];
  /** Coût carbone théorique du périmètre, au prix retenu. */
  prixCarboneApplique: number | null;
  devisePrixCarbone: string;
  coutCarboneTheorique: number | null;
  vulnerabilites: Vulnerabilite[];
  /** Benchmark suspendu tant que la qualité des données ne le permet pas. */
  benchmarkExploitable: boolean;
  analyses: string[];
}

// ---------------------------------------------------------------------------
// SECTION 6 — PLAN D'ACTION & TRAJECTOIRE
// ---------------------------------------------------------------------------

export type PrioriteAction = 'P0' | 'P1' | 'P2' | 'P3';

export interface ActionReduction {
  id: string;
  poste: string;
  scopeCode: string;
  action: string;
  /** Réduction attendue sur le poste, en pourcentage. */
  impactPctPoste: number | null;
  /** Réduction attendue sur l'empreinte totale, en pourcentage. */
  impactPctTotal: number | null;
  priorite: PrioriteAction;
  horizon: string;
  responsable: string;
  /** Vrai lorsque l'action conditionne les suivantes. */
  bloquante: boolean;
}

export interface JalonTrajectoire {
  horizon: number;
  perimetre: string;
  /** Réduction visée par rapport à l'année de référence, en pourcentage. */
  reductionPct: number;
  referentiel: string;
  emissionCibleTonnes: number | null;
  statut: 'PREREQUIS' | 'A_ENGAGER' | 'ENGAGE' | 'ATTEINT';
}

export interface PlanEtTrajectoire {
  actions: ActionReduction[];
  jalons: JalonTrajectoire[];
  /** Couverture du Scope 3, contrainte d'éligibilité SBTi. */
  couvertureScope3Pct: number;
  eligibleSbti: boolean;
  motifsNonEligibilite: string[];
}

// ---------------------------------------------------------------------------
// RAPPORT COMPLET
// ---------------------------------------------------------------------------

/**
 * Rapport exhaustif d'un périmètre et d'un exercice.
 *
 * <p>Le bilan brut reste accessible sous {@link bilan} : le rapport en est une
 * lecture, non une copie. Une valeur qui divergerait entre les deux signalerait
 * un défaut de calcul, pas une nuance de présentation.</p>
 */
export interface RapportCarbone {
  /** Périmètre consulté, tel que les filtres l'ont arrêté. */
  pays: string;
  drapeau: string;
  annee: number | null;
  libelleSociete: string;
  libelleExercice: string;
  devise: string;

  /** Inventaire dont le rapport rend compte. */
  bilan: BilanCarbone;

  /** Horodatage ISO de génération, porté par la page de garde. */
  genereLe: string;

  synthese: SyntheseExecutive;
  methodologie: CadreMethodologique;
  gaz: AnalyseGaz;
  scopes: DecompositionScopes;
  ratios: RatiosEtVulnerabilite;
  plan: PlanEtTrajectoire;
}
