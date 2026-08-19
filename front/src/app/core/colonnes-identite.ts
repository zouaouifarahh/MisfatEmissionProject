/**
 * Colonnes d'identité carbone, communes à tous les classeurs importés.
 *
 * <p>Chaque écran a son parseur, écrit pour la forme du classeur qu'il reçoit.
 * Mais deux colonnes leur sont désormais communes — la référence du référentiel
 * et le code article de l'ERP — et rien ne justifie que chacun invente ses
 * propres orthographes acceptées : un utilisateur qui écrit « Réf. Carbone »
 * dans un classeur de déchets doit être compris comme dans un classeur
 * d'achats.</p>
 *
 * <p>Les intitulés sont donc réunis ici, et les modèles téléchargeables les
 * emploient à la lettre : l'importateur et le modèle ne peuvent plus diverger
 * sans que ce fichier le montre.</p>
 */

/** Intitulé retenu pour la référence carbone dans les modèles produits. */
export const ENTETE_REFERENCE = 'Référence Carbone';

/** Intitulé retenu pour le code article ERP dans les modèles produits. */
export const ENTETE_CODE_ARTICLE = 'Code Article ERP';

/**
 * Orthographes acceptées à la lecture, forme normalisée.
 *
 * <p>Sans accents, sans ponctuation, en minuscules : c'est sous cette forme que
 * les entêtes sont comparés, faute de quoi « Réf. Carbone » et « Ref Carbone »
 * seraient deux colonnes différentes.</p>
 */
export const ALIAS_REFERENCE = [
  'reference carbone', 'ref carbone', 'reference', 'ref',
  'code carbone', 'code reference', 'carbon reference', 'reference code'
];

export const ALIAS_CODE_ARTICLE = [
  'code article erp', 'code article', 'code erp', 'article',
  'reference article', 'ref article', 'code produit', 'item code'
];

/** Forme comparable d'un entête : sans accents, sans ponctuation, en minuscules. */
export function normaliserEntete(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Valeur d'une ligne pour l'un des alias donnés.
 *
 * <p>Destinée aux parseurs qui lisent le classeur en objets — {@code
 * sheet_to_json} sans option {@code header} — où les clés sont les entêtes
 * eux-mêmes.</p>
 *
 * <p>L'égalité exacte est essayée avant le préfixe : « code article » ne doit
 * pas capturer « code article fournisseur » tant qu'une colonne porte
 * exactement le nom cherché.</p>
 */
export function valeurPourAlias(
  ligne: Record<string, unknown> | null | undefined,
  alias: readonly string[]
): string {
  if (!ligne) return '';

  const entrees = Object.entries(ligne)
    .map(([cle, valeur]) => ({ normalise: normaliserEntete(cle), valeur }));

  for (const cible of alias) {
    const exacte = entrees.find(e => e.normalise === cible);
    if (exacte && String(exacte.valeur ?? '').trim()) {
      return String(exacte.valeur).trim();
    }
  }

  for (const cible of alias) {
    const prefixe = entrees.find(e => e.normalise.startsWith(cible));
    if (prefixe && String(prefixe.valeur ?? '').trim()) {
      return String(prefixe.valeur).trim();
    }
  }

  return '';
}

/** Référence carbone portée par une ligne de classeur, si elle en porte une. */
export function lireReferenceCarbone(ligne: Record<string, unknown> | null | undefined): string {
  return valeurPourAlias(ligne, ALIAS_REFERENCE);
}

/** Code article ERP porté par une ligne de classeur, si elle en porte un. */
export function lireCodeArticle(ligne: Record<string, unknown> | null | undefined): string {
  return valeurPourAlias(ligne, ALIAS_CODE_ARTICLE);
}

/**
 * Les deux colonnes d'identité, telles qu'un modèle téléchargeable les propose.
 *
 * <p>Rendues sous forme d'objet à étaler en tête de l'exemple : les colonnes
 * d'identification précèdent les grandeurs, comme dans les extractions ERP.</p>
 */
export function colonnesIdentite(reference = '', codeArticle = ''): Record<string, string> {
  return {
    [ENTETE_REFERENCE]: reference,
    [ENTETE_CODE_ARTICLE]: codeArticle
  };
}
