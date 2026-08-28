import { calculerEmission } from './transport-facteur';

/**
 * Reprise des lignes calculées avant la correction d'échelle massique.
 *
 * <p>La branche massique de {@link calculerEmission} multipliait un poids en
 * kilogrammes par un facteur publié à la tonne : le poste sortait mille fois
 * trop haut. La formule est corrigée, mais les lignes déjà enregistrées portent
 * leur émission telle qu'elle a été calculée à la saisie — le stockage ne se
 * recalcule pas tout seul.</p>
 *
 * <p>C'est ce qui laissait le bandeau d'invraisemblance allumé alors que la
 * cause était réparée : une ligne résiduelle suffisait à porter une filiale
 * au-dessus du million de tonnes.</p>
 *
 * <p>La reprise rejoue la formule sur chaque ligne, sans rien inventer : elle
 * relit le poids, la distance, le montant et le facteur que la ligne porte
 * déjà. Une ligne dont la valeur ne change pas est laissée telle quelle, y
 * compris son objet — le décompte doit dire ce qui a bougé, pas ce qui a été
 * parcouru.</p>
 */

/** Marqueur de reprise, versionné : l'incrémenter la fait rejouer partout. */
export const MARQUEUR_RECALCUL_ECHELLE = 'misfat_recalcul_echelle_transport_v1';

/** Ligne de transport telle que la reprise a besoin de la lire et de l'écrire. */
export interface LigneRecalculable {
  facteur: number | null;
  uniteFacteur: string;
  devise?: string;
  montant: number | null;
  poidsKg: number | null;
  distanceKm: number | null;
  emissionCalculee: number;
}

export interface BilanRecalcul<T> {
  lignes: T[];
  /** Nombre de lignes dont l'émission a changé. */
  reprises: number;
  /** Écart total, en kgCO₂e : négatif quand la reprise fait baisser le bilan. */
  ecartKg: number;
}

/**
 * Une ligne est-elle valorisée au montant plutôt qu'au poids ?
 *
 * <p>La ligne ne porte pas son type de donnée : il se déduit de l'égalité entre
 * l'unité du facteur et la devise, comme l'écran le fait déjà à la
 * réouverture.</p>
 */
function estMonetaire(ligne: LigneRecalculable): boolean {
  const unite = (ligne.uniteFacteur ?? '').trim().toUpperCase();
  const devise = (ligne.devise ?? '').trim().toUpperCase();
  return !!unite && unite === devise && ligne.montant !== null;
}

/**
 * Rejoue la formule sur des lignes déjà enregistrées.
 *
 * <p>Le seuil d'un dixième de kilogramme évite de compter comme « reprise » un
 * écart d'arrondi flottant : une ligne juste doit rester silencieuse.</p>
 */
export function recalculerEchelle<T extends LigneRecalculable>(
  lignes: readonly T[] | null | undefined
): BilanRecalcul<T> {

  if (!Array.isArray(lignes) || !lignes.length) {
    return { lignes: [], reprises: 0, ecartKg: 0 };
  }

  let reprises = 0;
  let ecartKg = 0;

  const reprisesLignes = lignes.map(ligne => {
    const attendue = calculerEmission({
      facteur: ligne.facteur,
      uniteFacteur: ligne.uniteFacteur,
      dataType: estMonetaire(ligne) ? 'MONETAIRE' : 'PHYSIQUE',
      poidsKg: ligne.poidsKg,
      distanceKm: ligne.distanceKm,
      montant: ligne.montant
    });

    const ecart = attendue - (ligne.emissionCalculee ?? 0);
    if (Math.abs(ecart) < 0.1) return ligne;

    reprises++;
    ecartKg += ecart;
    return { ...ligne, emissionCalculee: attendue };
  });

  return { lignes: reprisesLignes, reprises, ecartKg };
}

/** Message rendu à l'utilisateur après une reprise ayant corrigé des lignes. */
export function messageRecalcul(bilan: BilanRecalcul<unknown>): string {
  if (bilan.reprises <= 0) return '';

  const tonnes = Math.abs(bilan.ecartKg) / 1000;
  const sens = bilan.ecartKg < 0 ? 'retirée(s) du' : 'ajoutée(s) au';

  return `${bilan.reprises} ligne(s) recalculée(s) après correction de l'échelle des facteurs `
    + `massiques : ${tonnes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} tCO₂e `
    + `${sens} bilan.`;
}
