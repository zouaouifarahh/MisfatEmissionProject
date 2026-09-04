/**
 * Chapitres du rapport normé GHG Protocol.
 *
 * <p>Les onze chapitres attendus d'un inventaire d'émissions publiable :
 * périmètre, données, méthode, qualité, vérification, objectifs, ratios,
 * divulgations et validation. Chacun porte des blocs de texte que le
 * responsable RSE amende ; le chiffre, lui, vient toujours du bilan calculé et
 * n'est jamais saisi à la main.</p>
 */

/** Bloc de commentaire éditable au sein d'un chapitre. */
export interface BlocNorme {
  id: string;
  intitule: string;
}

/** Contenu chiffré propre à certains chapitres, rendu par le composant. */
export type GabaritNorme =
  | 'couverture' | 'donnees' | 'historique' | 'methodologie'
  | 'ratios' | 'objectifs' | 'solutions' | 'signature';

/**
 * Solution ou recommandation RSE saisie par le responsable.
 *
 * <p>Seul contenu du rapport qui ne dérive d'aucun calcul : le reste part de
 * l'inventaire, celle-ci part d'un arbitrage humain. Les chiffres du bilan
 * disent où l'entreprise en est ; ces solutions disent ce qu'elle compte
 * faire, et rien dans les mesures ne permet de les déduire.</p>
 *
 * <p>Chacune porte son identifiant, stable tant qu'elle existe : c'est l'ancre
 * du sommaire, et le repère qui permet de la modifier ou de la retirer sans
 * confondre deux solutions au titre identique.</p>
 */
export interface SolutionRSE {
  id: string;
  titre: string;

  /**
   * Échéance, telle qu'elle paraît sur le badge — « 2028 », « T3 2027 ».
   *
   * <p>Texte libre et non une date : un plan d'action s'engage sur un horizon,
   * parfois un trimestre, parfois « en continu ». Imposer un calendrier ferait
   * inventer un jour et un mois que personne n'a arrêtés.</p>
   */
  horizon: string;

  /** Périmètre concerné — sites, flux, familles d'achat. */
  portee: string;

  /** Effet attendu sur l'empreinte, tel que la direction l'estime. */
  impact: string;

  /**
   * Ancien champ libre, antérieur à la séparation portée / impact.
   *
   * <p>Conservé en lecture seule le temps que les répartitions déjà saisies
   * soient reprises : {@link migrerSolution} le verse dans la portée, où il
   * documente au moins ce qu'il documentait. L'effacer aurait fait disparaître
   * du texte que quelqu'un avait écrit.</p>
   */
  texte?: string;

  /**
   * Scope ou catégorie que la mesure vise.
   *
   * <p>Distinct de la portée, qui nomme des sites et des flux : celui-ci
   * rattache l'action à un poste du bilan, de sorte qu'on puisse lire ce que
   * chaque scope reçoit d'efforts.</p>
   */
  scopeVise?: string;

  /**
   * Réduction estimée, en tCO₂e par an.
   *
   * <p>Chiffrée, quand {@link impact} reste littéraire. Les deux coexistent :
   * une direction annonce parfois « −12 % du Scope 2 » sans avoir arrêté de
   * tonnage, et forcer un nombre ferait inventer une précision absente.
   * {@code null} dit « non chiffré », jamais « zéro ».</p>
   */
  impactTco2e?: number | null;

  /** Avancement de la mesure, tel que la direction le suit. */
  statut?: StatutSolution;
}

/**
 * Avancement d'une mesure du plan d'actions.
 *
 * <p>Cinq états et pas davantage : un plan que l'on ne sait plus lire d'un coup
 * d'œil ne se pilote pas. « Écartée » est conservé plutôt que supprimé — savoir
 * qu'une piste a été examinée puis rejetée vaut mieux que de la voir
 * disparaître, et évite qu'on la propose à nouveau.</p>
 */
export type StatutSolution = 'Proposée' | 'Engagée' | 'En cours' | 'Réalisée' | 'Écartée';

/** Les statuts, dans l'ordre où le plan les présente. */
export const STATUTS_SOLUTION: readonly StatutSolution[] =
  ['Proposée', 'Engagée', 'En cours', 'Réalisée', 'Écartée'];

/**
 * Ramène une solution relue à la forme courante.
 *
 * <p>Une solution écrite avant la séparation des champs ne porte qu'un texte
 * libre : il devient la portée, et l'horizon comme l'impact restent vides
 * plutôt que d'être devinés. Le rendu sait taire un champ vide ; il ne saurait
 * pas rattraper une échéance inventée.</p>
 */
export function migrerSolution(solution: SolutionRSE): SolutionRSE {
  const portee = solution.portee ?? '';

  return {
    id: solution.id,
    titre: solution.titre ?? '',
    horizon: solution.horizon ?? '',
    portee: portee || (solution.texte ?? ''),
    impact: solution.impact ?? '',

    // Les trois champs du plan d'actions sont postérieurs aux premières
    // saisies. Une solution relue d'avant leur existence les reçoit vides
    // plutôt que devinés : « Proposée » serait une affirmation sur un
    // avancement que personne n'a déclaré.
    scopeVise: solution.scopeVise ?? '',
    impactTco2e: solution.impactTco2e ?? null,
    statut: solution.statut
  };
}

export interface ChapitreNorme {
  id: string;
  numero: number;
  titre: string;
  /** Intitulé normatif anglais, celui que les auditeurs recherchent. */
  titreNorme: string;
  icone: string;
  gabarit?: GabaritNorme;
  blocs: BlocNorme[];
}

export const CHAPITRES_NORME: ChapitreNorme[] = [
  {
    id: 'couverture', numero: 1, icone: '📘',
    titre: 'Page de garde et informations générales',
    titreNorme: 'Cover Page & General Information',
    gabarit: 'couverture',
    blocs: [{ id: 'couverture.objet', intitule: 'Objet du rapport' }]
  },
  {
    id: 'perimetre', numero: 2, icone: '🏭',
    titre: "Périmètre organisationnel et opérationnel",
    titreNorme: 'Company & Inventory Boundary',
    blocs: [
      { id: 'perimetre.organisationnel', intitule: 'Périmètre organisationnel' },
      { id: 'perimetre.operationnel', intitule: 'Périmètre opérationnel et exclusions' }
    ]
  },
  {
    id: 'donnees', numero: 3, icone: '📊',
    titre: "Données d'émissions de GES",
    titreNorme: 'GHG Emissions Data',
    gabarit: 'donnees',
    blocs: [{ id: 'donnees.commentaire', intitule: 'Commentaire sur les données' }]
  },
  {
    id: 'annee-reference', numero: 4, icone: '📈',
    titre: "Année de référence et suivi dans le temps",
    titreNorme: 'Base Year & Tracking Over Time',
    gabarit: 'historique',
    blocs: [
      { id: 'reference.justification', intitule: "Choix de l'année de référence" },
      { id: 'reference.recalcul', intitule: 'Politique de recalcul' }
    ]
  },
  {
    id: 'methodologie', numero: 5, icone: '🧮',
    titre: 'Méthodologie de calcul',
    titreNorme: 'Calculation Methodology',
    gabarit: 'methodologie',
    blocs: [
      { id: 'methodologie.approche', intitule: 'Approche retenue' },
      { id: 'methodologie.facteurs', intitule: "Sources des facteurs d'émission" }
    ]
  },
  {
    id: 'qualite', numero: 6, icone: '🔍',
    titre: "Gestion de la qualité de l'inventaire",
    titreNorme: 'Inventory Quality Management',
    blocs: [
      { id: 'qualite.incertitude', intitule: 'Niveau d\'incertitude' },
      { id: 'qualite.controles', intitule: 'Contrôles mis en œuvre' }
    ]
  },
  {
    id: 'verification', numero: 7, icone: '✔️',
    titre: 'Vérification et audit',
    titreNorme: 'Verification & Audit',
    blocs: [{ id: 'verification.statut', intitule: 'Statut de la vérification' }]
  },
  {
    id: 'objectifs', numero: 8, icone: '🎯',
    titre: 'Objectifs de réduction et performance',
    titreNorme: 'GHG Targets & Reduction Performance',
    gabarit: 'objectifs',
    blocs: [{ id: 'objectifs.trajectoire', intitule: 'Trajectoire de décarbonation' }]
  },
  {
    id: 'ratios', numero: 9, icone: '⚖️',
    titre: "Indicateurs d'intensité et pilotage",
    titreNorme: 'Ratio Indicators & Management',
    gabarit: 'ratios',
    blocs: [{ id: 'ratios.lecture', intitule: 'Lecture des ratios' }]
  },
  {
    id: 'divulgations', numero: 10, icone: '🌱',
    titre: 'Divulgations complémentaires',
    titreNorme: 'Additional Disclosures',
    blocs: [
      { id: 'divulgations.compensation', intitule: 'Compensation et crédits carbone' },
      { id: 'divulgations.initiatives', intitule: 'Initiatives RSE complémentaires' }
    ]
  },
  {
    id: 'solutions', numero: 11, icone: '💡',
    titre: 'Solutions et recommandations',
    titreNorme: 'Mitigation Measures & Recommendations',
    gabarit: 'solutions',
    blocs: [{ id: 'solutions.cadre', intitule: "Cadre général du plan d'action" }]
  },
  {
    id: 'signature', numero: 12, icone: '✍️',
    titre: 'Validation et contacts',
    titreNorme: 'Sign-off & Contact',
    gabarit: 'signature',
    blocs: [{ id: 'signature.declaration', intitule: 'Déclaration de conformité' }]
  }
];

/**
 * Paramètres du rapport normé, propres à un périmètre.
 *
 * <p>Cibles de réduction, année de référence et mentions de validation : ce que
 * le rapport porte en propre. Les dénominateurs des ratios — production,
 * chiffre d'affaires, effectif — n'y figurent pas : ils sont tenus par l'écran
 * « Données d'Activité & KPI », et les dupliquer ici ferait diverger les deux
 * copies au premier oubli.</p>
 */
export interface ParametresNorme {
  /** Commentaires du responsable RSE, par identifiant de bloc. */
  textes: Record<string, string>;

  /**
   * Solutions et recommandations, dans l'ordre où le rapport les présente.
   *
   * <p>Une liste et non un texte unique : chaque solution paraît au sommaire
   * sous son titre, et un lecteur qui cherche une mesure précise doit pouvoir
   * l'y trouver sans parcourir un pavé.</p>
   */
  solutions: SolutionRSE[];

  anneeReference: number | null;
  objectifPct: number | null;
  anneeCible: number | null;

  responsable: string;
  fonction: string;
  verificateur: string;
  statutVerification: string;
}

/** Statuts de vérification proposés, du plus faible au plus engageant. */
export const STATUTS_VERIFICATION = [
  'Non vérifié — inventaire interne',
  'Revue interne effectuée',
  'Vérification externe en cours',
  'Vérifié par un tiers indépendant (assurance limitée)',
  'Vérifié par un tiers indépendant (assurance raisonnable)'
] as const;

export function parametresVides(): ParametresNorme {
  return {
    textes: {},
    solutions: [],
    anneeReference: null,
    objectifPct: null,
    anneeCible: null,
    responsable: '',
    fonction: 'Responsable RSE',
    verificateur: '',
    statutVerification: STATUTS_VERIFICATION[0]
  };
}

/** Éléments du bilan dont les textes par défaut ont besoin. */
export interface ContexteNorme {
  societe: string;
  exercice: string;
  totalT: string;
  scope1T: string;
  scope2T: string;
  scope3T: string;
  postesCollectes: number;
  postesTotal: number;
  mesures: number;
  serveurJoignable: boolean;
}

/**
 * Textes par défaut, dérivés du bilan.
 *
 * <p>Ils décrivent ce que l'inventaire contient réellement plutôt que de servir
 * un modèle générique : un rapport prérempli de formules creuses serait signé
 * sans être lu. Chaque phrase reste amendable d'un clic sur le crayon.</p>
 */
export function textesParDefaut(contexte: ContexteNorme): Record<string, string> {
  const {
    societe, exercice, totalT, scope1T, scope2T, scope3T,
    postesCollectes, postesTotal, mesures, serveurJoignable
  } = contexte;

  return {
    'couverture.objet':
      `Le présent document restitue l'inventaire des émissions de gaz à effet de serre de `
      + `${societe} pour l'exercice ${exercice}. Il est établi selon la méthodologie du GHG `
      + `Protocol (Corporate Accounting and Reporting Standard) et s'appuie sur la base carbone `
      + `de l'ADEME pour les facteurs d'émission. L'empreinte consolidée s'établit à ${totalT} `
      + `tCO₂e, dont ${scope1T} tCO₂e au Scope 1, ${scope2T} tCO₂e au Scope 2 et ${scope3T} `
      + `tCO₂e au Scope 3.`,

    'perimetre.organisationnel':
      `Le périmètre organisationnel retenu est celui de ${societe}, consolidé selon l'approche du `
      + `contrôle opérationnel. Il couvre les sites de production MISFAT 1, MISFAT 2 et MISFAT 3 `
      + `ainsi que les fonctions support et le siège. Les filiales et usines effectivement `
      + `intégrées à cet inventaire sont celles déclarées au référentiel des sociétés de `
      + `l'application ; toute entité créée postérieurement à la clôture en est exclue.`,

    'perimetre.operationnel':
      `Le périmètre opérationnel couvre les trois scopes du GHG Protocol. Sur les ${postesTotal} `
      + `postes de la nomenclature, ${postesCollectes} ont donné lieu à une collecte pour cet `
      + `exercice. Les postes restants sont déclarés à zéro : cette valeur atteste qu'ils ont été `
      + `examinés et ne préjuge pas de leur poids réel une fois collectés. Aucune exclusion `
      + `discrétionnaire n'a été pratiquée au sein des postes retenus.`,

    'donnees.commentaire':
      `Les données ci-après agrègent ${mesures} ligne(s) de mesure rattachées au périmètre `
      + `[${societe} — ${exercice}]. Trois sources les alimentent : les mesures enregistrées en `
      + `base, la ventilation de la balance comptable et les saisies conservées dans les écrans `
      + `de catégorie ; l'origine de chaque poste est indiquée en regard. `
      + (serveurJoignable
        ? `Le service d'agrégation a répondu : les données de base sont intégrées.`
        : `Le service d'agrégation n'a pas répondu lors de l'édition : ce tableau doit être `
          + `reconduit une fois le service rétabli avant toute diffusion externe.`),

    'reference.justification':
      `L'année de référence sert de repère à la trajectoire de réduction. Elle est retenue pour `
      + `la représentativité de son activité et la complétude de sa collecte. Renseignez ci-dessus `
      + `l'exercice retenu pour que la comparaison soit établie sur des données réelles.`,

    'reference.recalcul':
      `Conformément au GHG Protocol, l'inventaire de l'année de référence est recalculé en cas de `
      + `changement structurel significatif : acquisition ou cession d'entité, modification de la `
      + `méthode de calcul, ou correction d'une erreur matérielle. Le seuil de significativité `
      + `retenu est de 5 % de l'empreinte totale.`,

    'methodologie.approche':
      `Les émissions sont obtenues en multipliant une donnée d'activité par un facteur `
      + `d'émission : E (kgCO₂e) = Quantité × Facteur. Les données d'activité sont physiques `
      + `lorsqu'elles sont disponibles (litres, kilowattheures, tonnes) et monétaires à défaut, `
      + `selon une approche « spend-based » dont l'incertitude est plus élevée. La restitution se `
      + `fait en tonnes de CO₂ équivalent, tous gaz confondus.`,

    'methodologie.facteurs':
      `Les facteurs d'émission proviennent en premier lieu du référentiel interne, alimenté par la `
      + `base carbone de l'ADEME. Lorsqu'aucun facteur du référentiel ne correspond, un ratio `
      + `monétaire moyen de repli est appliqué et son origine est signalée à l'écran. Le facteur `
      + `de l'électricité du réseau tunisien retenu est de 0,420 kgCO₂e par kilowattheure.`,

    'qualite.incertitude':
      `L'incertitude varie selon la nature de la donnée. Les postes appuyés sur des relevés `
      + `physiques (électricité, combustibles, flotte) présentent une incertitude estimée `
      + `inférieure à 10 %. Les postes valorisés par ratio monétaire — achats, immobilisations, `
      + `services — présentent une incertitude pouvant atteindre 30 à 50 %.`,

    'qualite.controles':
      `Les contrôles portent sur la cohérence des unités, la détection des doublons entre sources, `
      + `le rapprochement des lignes ventilées avec la balance générale, et la vérification de `
      + `l'étanchéité du périmètre [société × exercice]. Toute ligne dont le facteur reste non `
      + `résolu est signalée à l'écran et pèse zéro tant qu'elle n'a pas été reprise.`,

    'verification.statut':
      `Aucune vérification par un tiers indépendant n'a été engagée à ce stade. Le présent `
      + `inventaire relève d'une déclaration interne et ne peut être présenté comme vérifié. `
      + `Actualisez ce paragraphe et le statut ci-dessus dès qu'une mission d'assurance est `
      + `diligentée.`,

    'objectifs.trajectoire':
      `La trajectoire de décarbonation s'appuie en priorité sur les postes les plus contributeurs `
      + `de l'exercice. Renseignez ci-dessus l'objectif de réduction et l'année cible pour que `
      + `l'écart à combler soit calculé à partir de l'empreinte constatée.`,

    'ratios.lecture':
      `Les ratios d'intensité rapportent l'empreinte à l'activité : ils permettent de distinguer `
      + `une baisse due à un effort de décarbonation d'une baisse due à un ralentissement de la `
      + `production. Ils ne se substituent pas à la valeur absolue, seule engageante au regard des `
      + `objectifs climatiques.`,

    'divulgations.compensation':
      `Aucun crédit carbone n'a été acquis ni retiré au titre de cet exercice. Les émissions `
      + `déclarées sont des émissions brutes : aucune compensation n'est déduite de l'empreinte `
      + `présentée, conformément au principe de séparation du GHG Protocol.`,

    'divulgations.initiatives':
      `Décrivez ici les actions engagées sur l'exercice — efficacité énergétique, électricité `
      + `renouvelable, optimisation du fret, économie circulaire sur les médias filtrants — ainsi `
      + `que leur effet estimé sur l'empreinte.`,

    'solutions.cadre':
      `Les solutions ci-dessous constituent le plan d'action retenu pour ${societe} au titre de `
      + `l'exercice ${exercice}. Elles sont arbitrées par la direction et ne se déduisent d'aucun `
      + `calcul : l'inventaire dit où l'entreprise en est, ce chapitre dit ce qu'elle engage. `
      + `Chacune précise sa portée et son échéance.`,

    'signature.declaration':
      `Le soussigné atteste que le présent inventaire a été établi conformément à la méthodologie `
      + `du GHG Protocol et que les données qu'il contient reflètent, à sa connaissance, les `
      + `émissions de ${societe} pour l'exercice ${exercice}.`
  };
}
