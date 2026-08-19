/**
 * Modification en masse d'un facteur d'émission.
 *
 * <p>Corriger un facteur ligne à ligne sur plusieurs centaines d'immobilisations
 * n'est pas seulement long : c'est une source d'écarts, puisque rien ne garantit
 * que la même valeur ait été saisie partout. L'appliquer d'un geste à toutes les
 * lignes d'une catégorie supprime cette dérive.</p>
 *
 * <p>Le module ne connaît ni Angular ni le stockage : il transforme une liste et
 * rend un compte rendu. C'est l'écran qui décide d'enregistrer.</p>
 */

/** Ce qu'une ligne doit offrir pour qu'un facteur lui soit appliqué. */
export interface LigneFacteur {
  /** Grandeur multipliée par le facteur : montant, quantité, distance. */
  grandeur: number;
  facteur: number;
  emissionCalculee: number;
}

export interface ResultatMasse<T> {
  lignes: T[];
  /** Lignes réellement modifiées : celles qui portaient déjà la valeur sont ignorées. */
  modifiees: number;
  /** Écart d'émission produit par la reprise, en kgCO₂e. */
  ecartKg: number;
  message: string;
}

/** Champs que l'écran expose pour la reprise. */
export interface ChampsMasse {
  /** Grandeur multipliée par le facteur — « montant », « quantite »… */
  grandeur: string;
  facteur: string;
  emission: string;
  /** Base documentaire, réécrite pour dire d'où vient la nouvelle valeur. */
  base?: string;
  /** Origine du facteur, si l'écran la distingue. */
  origine?: string;
}

/**
 * Un facteur saisi est-il exploitable ?
 *
 * <p>Zéro est refusé : il annulerait l'émission de toute une catégorie sans que
 * rien ne le signale, et l'utilisateur qui veut neutraliser un poste dispose de
 * la déclaration de non-applicabilité, qui laisse une trace.</p>
 */
export function facteurValide(valeur: unknown): boolean {
  const nombre = typeof valeur === 'number' ? valeur : Number(String(valeur ?? '').replace(',', '.'));
  return Number.isFinite(nombre) && nombre > 0;
}

/** Facteur saisi, ramené à un nombre — la virgule décimale est admise. */
export function facteurSaisi(valeur: unknown): number | null {
  const nombre = typeof valeur === 'number' ? valeur : Number(String(valeur ?? '').replace(',', '.'));
  return Number.isFinite(nombre) && nombre > 0 ? nombre : null;
}

/**
 * Applique un facteur à un ensemble de lignes.
 *
 * <p>Seules les lignes qui changent sont réécrites : réappliquer la même valeur
 * ne doit pas gonfler le compte rendu, ni faire croire à une reprise qui n'a
 * rien repris.</p>
 *
 * <p>L'émission est recalculée depuis la grandeur, non réajustée par
 * proportion : ici la nouvelle valeur est connue et fait autorité, là où une
 * migration d'appariement doit composer avec des formules qu'elle ignore.</p>
 */
export function appliquerFacteurEnMasse<T extends Record<string, any>>(
  lignes: readonly T[] | null | undefined,
  nouveauFacteur: number,
  champs: ChampsMasse,
  base = 'Saisie manuelle (reprise en masse)'
): ResultatMasse<T> {

  if (!Array.isArray(lignes) || !lignes.length || !facteurValide(nouveauFacteur)) {
    return { lignes: [...(lignes ?? [])], modifiees: 0, ecartKg: 0, message: '' };
  }

  let modifiees = 0;
  let ecartKg = 0;

  const reprises = lignes.map(ligne => {
    const ancien = Number(ligne[champs.facteur] ?? 0);
    if (Math.abs(ancien - nouveauFacteur) < 1e-9) return ligne;

    const grandeur = Number(ligne[champs.grandeur] ?? 0);
    const ancienneEmission = Number(ligne[champs.emission] ?? 0);
    const emission = Number.isFinite(grandeur) ? grandeur * nouveauFacteur : ancienneEmission;

    modifiees++;
    ecartKg += emission - ancienneEmission;

    const reprise: Record<string, any> = { ...ligne };
    reprise[champs.facteur] = nouveauFacteur;
    reprise[champs.emission] = parseFloat(emission.toFixed(4));
    if (champs.base) reprise[champs.base] = base;
    if (champs.origine) reprise[champs.origine] = 'ADEME Fallback';

    return reprise as T;
  });

  return {
    lignes: reprises,
    modifiees,
    ecartKg,
    message: messagePourMasse(modifiees, ecartKg, nouveauFacteur)
  };
}

/** Compte rendu rendu à l'utilisateur après une reprise. */
export function messagePourMasse(modifiees: number, ecartKg: number, facteur: number): string {
  if (modifiees <= 0) return 'Aucune ligne à reprendre : elles portent déjà ce facteur.';

  const sens = ecartKg >= 0 ? '+' : '−';
  const ecart = Math.abs(ecartKg).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const valeur = facteur.toLocaleString('fr-FR', { maximumFractionDigits: 6 });

  return `${modifiees} ligne(s) reprises au facteur ${valeur} — `
    + `${sens} ${ecart} kgCO₂e sur le périmètre filtré.`;
}
