/**
 * Lecture des grandeurs comptables des classeurs MISFAT.
 *
 * <p>Fonctions pures, sans dépendance Angular : le parseur, le répartiteur et
 * les tests empruntent exactement le même chemin.</p>
 */

/**
 * Colonnes de valeur, de la plus significative à la moins significative.
 *
 * <p>« Débit » précède « Solde de fin - Devise de déclaration » : le premier
 * porte le flux de l'exercice en dinars, le second un solde converti dans la
 * devise de déclaration. Les confondre diviserait les montants par le taux de
 * change.</p>
 */
export const COLONNES_VALEUR = [
  'Quantité', 'Quantite', 'Consommation', 'Débit', 'Debit',
  'Solde de fin - Devise', 'Solde', 'Acquisitions', 'Montant'
];

/** Forme comparable d'un intitulé : sans accents, sans ponctuation, en minuscules. */
export function normaliserTexte(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Nettoyage strict d'un nombre comptable.
 *
 * <p>Les extractions livrent « 1 209 099,633 » : espaces fines, espaces
 * insécables et virgule décimale. Tout espace saute, la virgule devient un
 * point, et les points de milliers surnuméraires sont absorbés — sans quoi
 * « 17.822.675,43 » se réduirait à 17,82.</p>
 *
 * @returns le nombre lu, ou {@code null} si la cellule n'en porte aucun.
 */
export function nettoyerNombre(brut: unknown): number | null {
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null;
  if (brut === null || brut === undefined || brut instanceof Date) return null;

  let texte = String(brut).replace(/\s+/g, '');
  if (!texte) return null;

  // Une erreur de formule ne porte pas de valeur : elle n'en vaut pas zéro.
  if (/^#/.test(texte) || /^(n\/?a|nd|null|undefined|-{1,3})$/i.test(texte)) return null;

  // Le signe comptable entre parenthèses vaut moins.
  const negatifParenthese = /^\(.*\)$/.test(texte);
  if (negatifParenthese) texte = texte.slice(1, -1);

  texte = texte.replace(/[^0-9.,eE+-]/g, '');
  if (!texte) return null;

  const derniereVirgule = texte.lastIndexOf(',');
  const dernierPoint = texte.lastIndexOf('.');

  if (derniereVirgule >= 0 && dernierPoint >= 0) {
    // Le séparateur décimal est le dernier des deux ; l'autre marque les milliers.
    texte = derniereVirgule > dernierPoint
      ? texte.replace(/\./g, '').replace(',', '.')
      : texte.replace(/,/g, '');
  } else if (derniereVirgule >= 0) {
    texte = texte.replace(/,/g, '.');
  }

  // Après substitution, plusieurs points signalent des milliers, pas des décimales.
  const morceaux = texte.split('.');
  if (morceaux.length > 2) {
    texte = morceaux.slice(0, -1).join('') + '.' + morceaux[morceaux.length - 1];
  }

  const valeur = parseFloat(texte);
  if (!Number.isFinite(valeur)) return null;
  return negatifParenthese ? -valeur : valeur;
}

export interface ValeurRetenue {
  /** Valeur nettoyée ; {@code null} si aucune colonne n'en porte. */
  valeur: number | null;
  /** Intitulé de la colonne qui l'a fournie. */
  colonne: string;
  /** Colonnes éprouvées puis écartées, faute de valeur exploitable. */
  colonnesEcartees: string[];
}

/**
 * Retient la première grandeur exploitable d'une ligne.
 *
 * <p>Une colonne vide, illisible ou à zéro fait passer à la suivante : un
 * poste de charge nul dans la colonne « Quantité » n'interdit pas d'en lire le
 * montant en « Débit ». La valeur nulle n'est retenue qu'en dernier ressort,
 * quand toutes les colonnes candidates s'accordent dessus.</p>
 */
export function valeurPrioritaire(
  ligne: Record<string, unknown>,
  ordre: string[] = COLONNES_VALEUR
): ValeurRetenue {

  const index = new Map<string, string>();
  for (const cle of Object.keys(ligne)) index.set(normaliserTexte(cle), cle);

  const colonnesEcartees: string[] = [];
  // « Quantité » et « Quantite » désignent la même colonne : elle ne doit être
  // éprouvée — ni rapportée — qu'une fois.
  const dejaEprouvees = new Set<string>();
  let premierZero: string | null = null;

  for (const candidate of ordre) {
    const attendu = normaliserTexte(candidate);

    // Correspondance exacte d'abord, puis par préfixe : « Solde de fin -
    // Devise de déclaration » doit répondre à « Solde de fin - Devise ».
    let cleReelle = index.get(attendu);
    if (!cleReelle) {
      for (const [normalisee, brute] of index) {
        if (normalisee.startsWith(attendu)) { cleReelle = brute; break; }
      }
    }
    if (!cleReelle || dejaEprouvees.has(cleReelle)) continue;
    dejaEprouvees.add(cleReelle);

    const valeur = nettoyerNombre(ligne[cleReelle]);

    if (valeur === null) { colonnesEcartees.push(cleReelle); continue; }
    if (valeur === 0) {
      if (premierZero === null) premierZero = cleReelle;
      colonnesEcartees.push(cleReelle);
      continue;
    }

    return { valeur, colonne: cleReelle, colonnesEcartees };
  }

  // Toutes les colonnes s'accordent sur zéro : c'est alors une vraie valeur.
  if (premierZero !== null) {
    return {
      valeur: 0,
      colonne: premierZero,
      colonnesEcartees: colonnesEcartees.filter(c => c !== premierZero)
    };
  }

  return { valeur: null, colonne: '', colonnesEcartees };
}
