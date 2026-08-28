/**
 * Départs et destinations des voyages d'affaires.
 *
 * <p>Un voyage se saisit en quelques secondes quand le départ est déjà connu et
 * la destination proposée ; il se saisit mal, ou pas du tout, quand il faut
 * ressaisir « Tunisie » à chaque ligne et retrouver une distance ailleurs.</p>
 *
 * <p>Les distances sont des <strong>ordres de grandeur</strong>, orthodromiques
 * de capitale à capitale, arrondis à la dizaine. Elles servent d'amorce à la
 * saisie, jamais de vérité : une mission Tunis–Francfort ne fait pas la même
 * distance qu'une mission Tunis–Munich, et le champ reste modifiable. C'est
 * pourquoi la ligne saisie garde sa provenance « Estimation » tant que
 * l'utilisateur n'a pas confirmé la distance réelle.</p>
 *
 * <p>Fonctions pures, sans dépendance Angular : la saisie, l'import et les
 * bancs de test empruntent le même chemin.</p>
 */

/** Pays de départ déduit de la société consultée, par pays d'implantation. */
export function paysDeDepart(paysFiliale: string | null | undefined): string {
  const pays = (paysFiliale ?? '').trim();
  return pays || '';
}

/**
 * Destinations proposées à la saisie.
 *
 * <p>Les pays où MISFAT a une implantation ou un courant d'affaires établi.
 * La liste est indicative : le champ reste libre, et une destination nouvelle
 * ne doit pas obliger à modifier le code.</p>
 */
export const DESTINATIONS_FREQUENTES: string[] = [
  'Tunisie', 'Maroc', 'Algérie', 'France', 'Allemagne', 'Italie', 'Espagne',
  'Portugal', 'Belgique', 'Pays-Bas', 'Royaume-Uni', 'Suisse', 'Turquie',
  'Égypte', 'Émirats arabes unis', 'Arabie saoudite', 'Chine', 'Inde',
  'États-Unis', 'Canada'
];

/**
 * Distances indicatives entre pays, en kilomètres.
 *
 * <p>Table symétrique : seule une moitié est écrite, {@link distanceIndicative}
 * essaie les deux sens. Y porter les deux inviterait à en corriger une et pas
 * l'autre.</p>
 */
const DISTANCES: Record<string, Record<string, number>> = {
  'Tunisie': {
    'Maroc': 1860, 'Algérie': 630, 'France': 1470, 'Allemagne': 1490,
    'Italie': 600, 'Espagne': 1290, 'Portugal': 1900, 'Belgique': 1700,
    'Pays-Bas': 1840, 'Royaume-Uni': 1900, 'Suisse': 1180, 'Turquie': 1650,
    'Égypte': 2160, 'Émirats arabes unis': 4400, 'Arabie saoudite': 3500,
    'Chine': 8600, 'Inde': 6100, 'États-Unis': 7400, 'Canada': 6800
  },
  'Maroc': {
    'Algérie': 1300, 'France': 1870, 'Allemagne': 2480, 'Italie': 2050,
    'Espagne': 850, 'Portugal': 660, 'Belgique': 2100, 'Pays-Bas': 2250,
    'Royaume-Uni': 2100, 'Suisse': 2100, 'Turquie': 3300, 'Égypte': 3700,
    'Émirats arabes unis': 5900, 'Arabie saoudite': 5000,
    'Chine': 10200, 'Inde': 7700, 'États-Unis': 5900, 'Canada': 5400
  },
  'France': {
    'Allemagne': 880, 'Italie': 1100, 'Espagne': 1050, 'Portugal': 1450,
    'Belgique': 260, 'Pays-Bas': 430, 'Royaume-Uni': 340, 'Suisse': 490,
    'Turquie': 2600, 'Égypte': 3200, 'Émirats arabes unis': 5250,
    'Arabie saoudite': 4600, 'Chine': 8200, 'Inde': 6600,
    'États-Unis': 6200, 'Canada': 5650
  }
};

/** Forme comparable d'un nom de pays : sans accents, en minuscules. */
function normaliser(pays: string | null | undefined): string {
  return String(pays ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Retrouve une clé de la table, quelle que soit la casse ou l'accentuation. */
function clef(table: Record<string, unknown>, pays: string): string | null {
  const cible = normaliser(pays);
  return Object.keys(table).find(k => normaliser(k) === cible) ?? null;
}

/**
 * Distance indicative d'un trajet, en kilomètres ; `null` si la table ne le
 * documente pas.
 *
 * <p>Rendre `null` plutôt qu'une valeur approchée est délibéré : une distance
 * inventée se retrouverait dans un bilan carbone sans que rien ne la
 * distingue d'une distance relevée.</p>
 */
export function distanceIndicative(
  depart: string | null | undefined,
  destination: string | null | undefined
): number | null {

  const de = normaliser(depart);
  const vers = normaliser(destination);
  if (!de || !vers) return null;

  // Un trajet vers son propre pays n'a pas de distance générale : il dépend
  // entièrement des villes, que l'écran ne demande pas.
  if (de === vers) return null;

  const depuisDepart = clef(DISTANCES, depart!);
  if (depuisDepart) {
    const arrivee = clef(DISTANCES[depuisDepart], destination!);
    if (arrivee) return DISTANCES[depuisDepart][arrivee];
  }

  // Sens inverse : la table n'écrit qu'une moitié des couples.
  const depuisDestination = clef(DISTANCES, destination!);
  if (depuisDestination) {
    const arrivee = clef(DISTANCES[depuisDestination], depart!);
    if (arrivee) return DISTANCES[depuisDestination][arrivee];
  }

  return null;
}
