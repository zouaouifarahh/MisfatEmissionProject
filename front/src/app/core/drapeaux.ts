/**
 * Pavillons des pays où le groupe est implanté.
 *
 * <p>La table vivait dans le tableau de bord, et la consolidation Groupe en
 * aurait fait une seconde copie. Deux tables de correspondance finissent par
 * diverger : une implantation ajoutée d'un côté manque de l'autre, et le même
 * pays s'affiche avec son drapeau sur un écran et sans sur le suivant.</p>
 */
const PAVILLONS: { readonly [pays: string]: string } = {
  Tunisie: '🇹🇳',
  Maroc: '🇲🇦',
  France: '🇫🇷',
  Algérie: '🇩🇿',
  Italie: '🇮🇹',
  Espagne: '🇪🇸'
};

/**
 * Emoji drapeau d'un pays.
 *
 * <p>Pavillon neutre pour un pays non répertorié : un drapeau faux vaudrait
 * moins qu'aucun drapeau, et l'absence invite à compléter la table.</p>
 */
export function drapeauDuPays(pays: string | null | undefined): string {
  return PAVILLONS[(pays ?? '').trim()] ?? '🏳️';
}
