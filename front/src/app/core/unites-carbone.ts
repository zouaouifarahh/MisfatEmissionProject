/**
 * Conversions d'unités de la comptabilité carbone.
 *
 * <p>Règle unique du projet : les calculs se font en <strong>kgCO₂e</strong>,
 * l'unité dans laquelle les facteurs de la base sont exprimés
 * ({@code EmissionFactor.factorValue}). La conversion en tonnes n'a lieu qu'à la
 * frontière d'affichage, ou à l'entrée d'un agrégat qui les tient déjà.</p>
 *
 * <p>Mélanger les deux unités dans un même accumulateur coûte un facteur 1 000
 * par apport. C'est précisément ce qui portait le tableau de bord à 3,78
 * milliards de tonnes : les agrégats du serveur arrivent en tCO₂e, les saisies
 * du navigateur en kgCO₂e, et les deux étaient additionnés tels quels.</p>
 */

/** Facteur de passage des kilogrammes aux tonnes. */
export const KG_VERS_TONNE = 1_000;

/**
 * Équivalences entre unités commensurables.
 *
 * <p>La clé extérieure est l'unité de saisie, la clé intérieure celle du
 * dénominateur du facteur, et la valeur le multiplicateur à appliquer à la
 * quantité. Le tableau est confronté à {@code EmissionFactor.unit} plutôt que
 * supposé : la base porte des facteurs en kgCO₂e/kWh comme en kgCO₂e/MWh, et
 * deviner l'un pour l'autre fausse le résultat de trois ordres de grandeur.</p>
 */
const EQUIVALENCES: Record<string, Record<string, number>> = {
  KWH: { KWH: 1, MWH: 1 / 1_000, GWH: 1 / 1_000_000 },
  MWH: { KWH: 1_000, MWH: 1, GWH: 1 / 1_000 },
  GWH: { KWH: 1_000_000, MWH: 1_000, GWH: 1 },

  KG: { KG: 1, T: 1 / 1_000, TONNE: 1 / 1_000, TONNES: 1 / 1_000 },
  T: { KG: 1_000, T: 1, TONNE: 1, TONNES: 1 },
  TONNE: { KG: 1_000, T: 1, TONNE: 1, TONNES: 1 },
  TONNES: { KG: 1_000, T: 1, TONNE: 1, TONNES: 1 },

  L: { L: 1, M3: 1 / 1_000 },
  M3: { L: 1_000, M3: 1 }
};

/**
 * Forme comparable d'une unité.
 *
 * <p>« kWh », « KWh » et « k W h » désignent la même unité : ni la casse ni les
 * espaces ne doivent faire échouer une conversion.</p>
 */
export function normaliserUnite(unite: string | null | undefined): string {
  return String(unite ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Quantité convertie de son unité de saisie vers celle du facteur.
 *
 * <p>Deux unités identiques, ou l'absence de l'une des deux, laissent la
 * quantité inchangée : la mesure est alors réputée déjà libellée dans l'unité
 * du facteur.</p>
 *
 * @throws Error si les unités ne sont pas commensurables. Un échec explicite
 *   vaut mieux qu'un total faux de trois ordres de grandeur passé inaperçu.
 */
export function quantiteVersUniteFacteur(
  quantite: number,
  uniteSaisie: string | null | undefined,
  uniteFacteur: string | null | undefined
): number {
  const source = normaliserUnite(uniteSaisie);
  const cible = normaliserUnite(uniteFacteur);

  if (!source || !cible || source === cible) return quantite;

  const coefficient = EQUIVALENCES[source]?.[cible];
  if (coefficient === undefined) {
    throw new Error(
      `[unites-carbone] Conversion impossible de « ${source} » vers « ${cible} ». `
      + `Vérifiez l'unité de la mesure et celle du facteur (EmissionFactor.unit).`
    );
  }

  return quantite * coefficient;
}

/**
 * Émissions d'une ligne de mesure, en kgCO₂e.
 *
 * <p>Formule unique de calcul d'émission du projet :
 * {@code quantité ramenée à l'unité du facteur × valeur du facteur}. Le facteur
 * reste celui de la base, sans retouche.</p>
 */
export function emissionKg(
  quantite: number,
  uniteSaisie: string | null | undefined,
  facteurValeur: number,
  uniteFacteur: string | null | undefined
): number {
  return quantiteVersUniteFacteur(quantite, uniteSaisie, uniteFacteur) * facteurValeur;
}

/**
 * kgCO₂e → tCO₂e.
 *
 * <p>À n'appeler qu'à la frontière d'affichage, ou à l'entrée d'un agrégat tenu
 * en tonnes — jamais au milieu d'une chaîne de calcul.</p>
 */
export function kgVersTonnes(kg: number): number {
  return kg / KG_VERS_TONNE;
}

/** tCO₂e → kgCO₂e, pour les ratios qui s'expriment au kilogramme. */
export function tonnesVersKg(tonnes: number): number {
  return tonnes * KG_VERS_TONNE;
}
