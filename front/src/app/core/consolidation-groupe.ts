/**
 * Consolidation Groupe et comparaison entre filiales.
 *
 * <p>Cinq sociétés, trois pays, trois devises. Additionner leurs empreintes
 * donne le total du Groupe ; les comparer entre elles demande davantage, car
 * une filiale de mille salariés émettra toujours plus qu'une filiale de cent
 * sans qu'on puisse en conclure quoi que ce soit sur sa performance.</p>
 *
 * <p>D'où les intensités : tonnes par salarié, tonnes par million de chiffre
 * d'affaires. Ce sont elles qui rendent les filiales comparables, et ce sont
 * elles que la CSRD et les référentiels sectoriels demandent.</p>
 *
 * <p>Une règle traverse tout ce module : un dénominateur absent ne vaut pas
 * zéro, et une intensité qu'on ne peut pas calculer ne se calcule pas. Une
 * filiale dont l'effectif n'est pas renseigné apparaît sans intensité, jamais
 * avec une intensité infinie ou nulle — l'une comme l'autre la classerait
 * faussement au palmarès.</p>
 */

/** Empreinte d'une filiale sur un exercice, en tonnes de CO₂ équivalent. */
export interface EmpreinteFiliale {
  entityId: number;
  libelle: string;
  pays: string;
  devise: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  /** Vrai lorsque le serveur a répondu ; faux si le bilan est purement local. */
  serveurJoignable?: boolean;
}

/** Dénominateurs extra-financiers d'une filiale, tels que l'annuaire les tient. */
export interface DenominateursFiliale {
  entityId: number;
  effectif: number | null;
  /** Chiffre d'affaires, en millions de la devise de la filiale. */
  chiffreAffairesM: number | null;
  production: number | null;
}

/** Ligne du tableau comparatif : l'empreinte, et ce qui la rend comparable. */
export interface LigneComparative {
  entityId: number;
  libelle: string;
  pays: string;
  devise: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  /** Part de l'empreinte Groupe, en pourcentage. */
  partGroupe: number;
  /** tCO₂e par salarié ; `null` sans effectif renseigné. */
  intensiteEffectif: number | null;
  /** tCO₂e par million de chiffre d'affaires ; `null` sans CA renseigné. */
  intensiteChiffreAffaires: number | null;
  /** kgCO₂e par unité produite ; `null` sans volume de production. */
  intensiteProduction: number | null;
  /** Dénominateurs manquants, nommés pour que l'écran sache quoi réclamer. */
  denominateursManquants: string[];
}

export interface LignePays {
  pays: string;
  filiales: number;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  partGroupe: number;
  /** Intensité par salarié du pays ; `null` si un effectif y manque. */
  intensiteEffectif: number | null;
  effectif: number | null;
}

export interface ConsolidationGroupe {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  /** Nombre de filiales entrant dans la consolidation. */
  filiales: number;
  /** Effectif consolidé ; `null` dès qu'une filiale n'est pas renseignée. */
  effectif: number | null;
  /** Intensité Groupe par salarié ; `null` si l'effectif consolidé l'est. */
  intensiteEffectif: number | null;
  lignes: LigneComparative[];
  pays: LignePays[];
  /** Vrai seulement si toutes les filiales ont été servies par le serveur. */
  serveurJoignable: boolean;
  /**
   * Filiales dont un dénominateur manque.
   *
   * <p>Nommées à part : c'est la liste que l'écran présente comme travail à
   * faire, plutôt que de laisser des cases vides sans explication.</p>
   */
  filialesIncompletes: string[];
}

/** Division qui refuse de rendre un nombre quand le dénominateur n'en est pas un. */
function rapport(numerateur: number, denominateur: number | null | undefined): number | null {
  if (typeof denominateur !== 'number') return null;
  if (!Number.isFinite(denominateur) || denominateur <= 0) return null;

  const valeur = numerateur / denominateur;
  return Number.isFinite(valeur) ? valeur : null;
}

/**
 * Consolide les filiales et les rend comparables entre elles.
 *
 * <p>Les intensités sont calculées filiale par filiale, jamais en divisant le
 * total Groupe par l'effectif Groupe pour le redistribuer : ce serait supposer
 * que toutes les filiales ont la même productivité carbone, c'est-à-dire
 * supposer précisément ce qu'on cherche à mesurer.</p>
 *
 * <p>Le chiffre d'affaires n'est pas converti entre devises. MISFAT Maroc
 * déclare en dirhams, SOLAUFIL France en euros : leurs intensités par million
 * ne sont donc pas directement comparables, et l'écran doit afficher la devise
 * à côté du ratio. Convertir ici, au cours du jour, ferait varier une
 * intensité d'exercice clos à chaque mouvement de change.</p>
 */
export function consoliderGroupe(
  empreintes: readonly EmpreinteFiliale[] | null | undefined,
  denominateurs: readonly DenominateursFiliale[] | null | undefined
): ConsolidationGroupe {

  const filiales = Array.isArray(empreintes) ? empreintes : [];
  const parEntite = new Map<number, DenominateursFiliale>(
    (Array.isArray(denominateurs) ? denominateurs : []).map(d => [d.entityId, d])
  );

  const scope1 = filiales.reduce((s, f) => s + (f.scope1 || 0), 0);
  const scope2 = filiales.reduce((s, f) => s + (f.scope2 || 0), 0);
  const scope3 = filiales.reduce((s, f) => s + (f.scope3 || 0), 0);
  const total = filiales.reduce((s, f) => s + (f.total || 0), 0);

  const lignes: LigneComparative[] = filiales.map(filiale => {
    const d = parEntite.get(filiale.entityId);
    const manquants: string[] = [];

    if (!d || typeof d.effectif !== 'number' || d.effectif <= 0) manquants.push('effectif');
    if (!d || typeof d.chiffreAffairesM !== 'number' || d.chiffreAffairesM <= 0) {
      manquants.push("chiffre d'affaires");
    }
    if (!d || typeof d.production !== 'number' || d.production <= 0) {
      manquants.push('production');
    }

    return {
      entityId: filiale.entityId,
      libelle: filiale.libelle,
      pays: filiale.pays,
      devise: filiale.devise,
      scope1: filiale.scope1 || 0,
      scope2: filiale.scope2 || 0,
      scope3: filiale.scope3 || 0,
      total: filiale.total || 0,
      partGroupe: total > 0 ? ((filiale.total || 0) / total) * 100 : 0,
      intensiteEffectif: rapport(filiale.total || 0, d?.effectif),
      intensiteChiffreAffaires: rapport(filiale.total || 0, d?.chiffreAffairesM),
      // Par unité produite, le ratio se lit en kilogrammes : une pièce de
      // filtration pèse quelques centaines de grammes de CO₂, et l'exprimer en
      // tonnes ne donnerait que des zéros.
      intensiteProduction: rapport((filiale.total || 0) * 1_000, d?.production),
      denominateursManquants: manquants
    };
  });

  // L'effectif consolidé n'a de sens que si toutes les filiales sont
  // renseignées : sommer les effectifs connus donnerait une intensité Groupe
  // flatteuse, calculée sur un dénominateur amputé.
  const effectifs = filiales.map(f => parEntite.get(f.entityId)?.effectif ?? null);
  const effectifGroupe = effectifs.every(e => typeof e === 'number' && e > 0)
    ? effectifs.reduce((s, e) => s! + e!, 0)
    : null;

  return {
    scope1, scope2, scope3, total,
    filiales: filiales.length,
    effectif: effectifGroupe,
    intensiteEffectif: rapport(total, effectifGroupe),
    lignes: [...lignes].sort((a, b) => b.total - a.total),
    pays: consoliderParPays(lignes, parEntite, total),
    serveurJoignable: filiales.length > 0
      && filiales.every(f => f.serveurJoignable !== false),
    filialesIncompletes: lignes
      .filter(l => l.denominateursManquants.length)
      .map(l => l.libelle)
  };
}

/**
 * Regroupe les filiales par pays d'implantation.
 *
 * <p>Un pays réunit parfois plusieurs sociétés — la Tunisie en compte trois —
 * et c'est à cette maille que se lisent les enjeux de mix électrique et de
 * réglementation.</p>
 */
function consoliderParPays(
  lignes: readonly LigneComparative[],
  denominateurs: Map<number, DenominateursFiliale>,
  totalGroupe: number
): LignePays[] {

  const parPays = new Map<string, LigneComparative[]>();
  for (const ligne of lignes) {
    const pays = (ligne.pays || '').trim() || 'Non renseigné';
    parPays.set(pays, [...(parPays.get(pays) ?? []), ligne]);
  }

  return [...parPays.entries()]
    .map(([pays, membres]) => {
      const total = membres.reduce((s, m) => s + m.total, 0);

      const effectifs = membres.map(m => denominateurs.get(m.entityId)?.effectif ?? null);
      const effectif = effectifs.every(e => typeof e === 'number' && e > 0)
        ? effectifs.reduce((s, e) => s! + e!, 0)
        : null;

      return {
        pays,
        filiales: membres.length,
        scope1: membres.reduce((s, m) => s + m.scope1, 0),
        scope2: membres.reduce((s, m) => s + m.scope2, 0),
        scope3: membres.reduce((s, m) => s + m.scope3, 0),
        total,
        partGroupe: totalGroupe > 0 ? (total / totalGroupe) * 100 : 0,
        effectif,
        intensiteEffectif: rapport(total, effectif)
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Écart d'une filiale à la médiane du Groupe, sur une intensité donnée.
 *
 * <p>La médiane plutôt que la moyenne : sur cinq filiales dont une pèse quatre
 * cinquièmes du Groupe, la moyenne ne décrit aucune d'entre elles.</p>
 *
 * @returns l'écart en pourcentage de la médiane, `null` faute de comparables.
 */
export function ecartMediane(
  valeur: number | null,
  comparables: readonly (number | null)[]
): number | null {

  if (typeof valeur !== 'number') return null;

  const chiffres = comparables
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);

  if (chiffres.length < 2) return null;

  const milieu = Math.floor(chiffres.length / 2);
  const mediane = chiffres.length % 2
    ? chiffres[milieu]
    : (chiffres[milieu - 1] + chiffres[milieu]) / 2;

  if (mediane <= 0) return null;
  return ((valeur - mediane) / mediane) * 100;
}
