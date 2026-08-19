/**
 * Trajectoire SBTi : ce qui est constaté, face à ce qui a été promis.
 *
 * <p>Une cible validée par la Science Based Targets initiative n'est pas un
 * objectif d'affichage : c'est un engagement daté, sur un périmètre nommé, avec
 * une année de base figée. Le graphique d'évolution du tableau de bord montre
 * l'histoire ; il ne montre pas l'écart à l'engagement, qui est la seule
 * question que pose un vérificateur.</p>
 *
 * <p>Ce module calcule cet écart, année par année, et prolonge la cible
 * jusqu'à l'échéance. Il ne prolonge <strong>pas</strong> le réel : une donnée
 * projetée présentée comme mesurée est exactement ce qu'un audit sanctionne.
 * Au-delà du dernier exercice collecté, seule la cible est tracée.</p>
 *
 * <p>Les valeurs sont en tonnes de CO₂ équivalent, comme le reste du tableau
 * de bord.</p>
 */

/** Exercice tel que le tableau de bord le détient, en tonnes. */
export interface ExerciceBilan {
  annee: number;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
}

/**
 * Périmètre sur lequel porte l'engagement.
 *
 * <p>La cible MISFAT validée le 10 novembre 2025 porte sur les scopes 1 et 3 ;
 * le scope 2 relève d'un engagement distinct — 100 % d'électricité renouvelable
 * — qui ne s'exprime pas en pourcentage de réduction. Les confondre reviendrait
 * à mesurer l'écart sur un périmètre que personne n'a engagé.</p>
 */
export type PerimetreCible = 'SCOPES_1_3' | 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3' | 'TOTAL';

export interface ParametresTrajectoire {
  /** Année de base de l'engagement ; à défaut, le premier exercice chiffré. */
  anneeBase?: number | null;
  /** Échéance de la cible. */
  anneeCible: number;
  /** Réduction visée à l'échéance, en pourcentage de l'année de base. */
  reductionPct: number;
  perimetre: PerimetreCible;
}

/** Point de la trajectoire : ce qui est mesuré, ce qui était attendu. */
export interface PointTrajectoire {
  annee: number;
  /** Émissions constatées, ou `null` si l'exercice n'est pas collecté. */
  reel: number | null;
  /** Émissions admissibles cette année-là au titre de la trajectoire. */
  cible: number;
  /** Réel − cible, en tonnes ; `null` sans exercice collecté. */
  ecart: number | null;
  /** Écart rapporté à la cible, en pourcentage. */
  ecartPct: number | null;
  /** L'exercice tient-il la trajectoire ? `null` s'il n'est pas collecté. */
  conforme: boolean | null;
  /** Vrai au-delà du dernier exercice collecté : seule la cible est tracée. */
  projete: boolean;
}

export interface Trajectoire {
  anneeBase: number;
  valeurBase: number;
  anneeCible: number;
  valeurCible: number;
  /** Réduction annuelle à tenir, en tonnes. */
  effortAnnuel: number;
  points: PointTrajectoire[];
  /** Dernier exercice réellement collecté. */
  dernierExercice: PointTrajectoire | null;
  perimetre: PerimetreCible;
}

/** Intitulé lisible du périmètre engagé. */
export function libellePerimetre(perimetre: PerimetreCible): string {
  switch (perimetre) {
    case 'SCOPES_1_3': return 'Scopes 1 + 3';
    case 'SCOPE_1': return 'Scope 1';
    case 'SCOPE_2': return 'Scope 2';
    case 'SCOPE_3': return 'Scope 3';
    default: return 'Tous scopes';
  }
}

/** Empreinte d'un exercice sur le périmètre engagé. */
export function valeurPerimetre(exercice: ExerciceBilan, perimetre: PerimetreCible): number {
  switch (perimetre) {
    case 'SCOPES_1_3': return (exercice.scope1 ?? 0) + (exercice.scope3 ?? 0);
    case 'SCOPE_1': return exercice.scope1 ?? 0;
    case 'SCOPE_2': return exercice.scope2 ?? 0;
    case 'SCOPE_3': return exercice.scope3 ?? 0;
    default: return exercice.total ?? 0;
  }
}

/**
 * Construit la trajectoire, de l'année de base à l'échéance.
 *
 * <p>La décroissance est linéaire : c'est la convention SBTi pour une cible de
 * court terme, et c'est aussi la seule interpolation qu'on puisse défendre sans
 * connaître le calendrier des investissements. Une exponentielle donnerait un
 * couloir plus indulgent les premières années, ce qui est précisément ce qu'un
 * pilotage ne doit pas faire.</p>
 *
 * <p>Un exercice non collecté n'est pas un exercice à zéro. Il reste sans réel,
 * et sans écart : afficher −100 % sur une année non saisie ferait passer un
 * défaut de collecte pour une performance.</p>
 *
 * @returns la trajectoire, ou `null` si aucun exercice chiffré ne permet de
 *   fixer l'année de base.
 */
export function construireTrajectoire(
  exercices: readonly ExerciceBilan[] | null | undefined,
  parametres: ParametresTrajectoire
): Trajectoire | null {

  if (!Array.isArray(exercices) || !exercices.length) return null;

  const perimetre = parametres.perimetre;

  const chiffres = exercices
    .map(e => ({ annee: e.annee, valeur: valeurPerimetre(e, perimetre) }))
    .filter(e => Number.isFinite(e.annee) && e.valeur > 0)
    .sort((a, b) => a.annee - b.annee);

  if (!chiffres.length) return null;

  // L'année de base demandée ne vaut que si elle est chiffrée : une base non
  // collectée rendrait toute la trajectoire arbitraire.
  const base = chiffres.find(e => e.annee === parametres.anneeBase) ?? chiffres[0];

  const anneeCible = parametres.anneeCible;
  if (!Number.isFinite(anneeCible) || anneeCible <= base.annee) return null;

  const reduction = Math.min(Math.max(parametres.reductionPct, 0), 100) / 100;
  const valeurCible = base.valeur * (1 - reduction);
  const duree = anneeCible - base.annee;
  const pente = (base.valeur - valeurCible) / duree;

  const dernierCollecte = chiffres[chiffres.length - 1].annee;
  const parAnnee = new Map(chiffres.map(e => [e.annee, e.valeur]));

  const points: PointTrajectoire[] = [];
  for (let annee = base.annee; annee <= anneeCible; annee++) {
    const cible = base.valeur - pente * (annee - base.annee);
    const reel = parAnnee.get(annee) ?? null;

    points.push({
      annee,
      reel,
      cible,
      ecart: reel === null ? null : reel - cible,
      ecartPct: reel === null || cible <= 0 ? null : ((reel - cible) / cible) * 100,
      conforme: reel === null ? null : reel <= cible,
      projete: annee > dernierCollecte
    });
  }

  const dernierExercice = [...points].reverse().find(p => p.reel !== null) ?? null;

  return {
    anneeBase: base.annee,
    valeurBase: base.valeur,
    anneeCible,
    valeurCible,
    effortAnnuel: pente,
    points,
    dernierExercice,
    perimetre
  };
}

/**
 * Effort annuel restant pour rejoindre la cible depuis le dernier exercice.
 *
 * <p>C'est le chiffre qui pilote : il dit combien de tonnes il faut retirer
 * chaque année à partir de maintenant, et non depuis une année de base déjà
 * dépassée. Quand le dernier exercice a dérivé au-dessus du couloir, cet
 * effort est mécaniquement supérieur à l'effort initial — c'est le coût du
 * retard, et il doit être visible.</p>
 *
 * @returns `null` si aucun exercice n'est collecté ou si l'échéance est passée.
 */
export function effortRestant(trajectoire: Trajectoire | null): number | null {
  const dernier = trajectoire?.dernierExercice;
  if (!trajectoire || !dernier || dernier.reel === null) return null;

  const annees = trajectoire.anneeCible - dernier.annee;
  if (annees <= 0) return null;

  return (dernier.reel - trajectoire.valeurCible) / annees;
}

/** Le dernier exercice collecté tient-il la trajectoire ? */
export function statutTrajectoire(trajectoire: Trajectoire | null):
  'CONFORME' | 'DERIVE' | 'INCONNU' {

  const dernier = trajectoire?.dernierExercice;
  if (!dernier || dernier.conforme === null) return 'INCONNU';
  return dernier.conforme ? 'CONFORME' : 'DERIVE';
}
