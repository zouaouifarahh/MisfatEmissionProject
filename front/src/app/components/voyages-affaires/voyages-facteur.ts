import { FacteurDetaille } from '../../services/referential.service';
import { ModeTransport, definitionMode } from '../../shared/mobilite/modes-transport';

/**
 * Rapprochement d'une mission et d'un facteur du référentiel carbone.
 *
 * <p>Fonctions pures : la saisie manuelle et l'import empruntent exactement le
 * même chemin.</p>
 */

/**
 * Modes de déplacement couverts par la catégorie 6.
 *
 * <p>Les définitions viennent du socle mobilité, partagé avec la catégorie 7 :
 * une même pastille et une même signature désignent partout le même mode.</p>
 */
export type ModeVoyage = ModeTransport | 'Non précisé';

/** Segments aériens, au sens des bases DESNZ et ADEME. */
export type SegmentAerien = 'Court-courrier' | 'Moyen-courrier' | 'Long-courrier';

/**
 * Bornes des segments aériens, en kilomètres.
 *
 * <p>Un vol de moins de mille kilomètres relève du court-courrier ; au-delà de
 * trois mille sept cents, du long-courrier. Ces bornes conditionnent le facteur
 * retenu, l'intensité au passager-kilomètre variant fortement de l'un à
 * l'autre.</p>
 */
export const BORNE_COURT_MOYEN = 1000;
export const BORNE_MOYEN_LONG = 3700;

export function segmentAerien(distanceKm: number | null): SegmentAerien | null {
  if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (distanceKm < BORNE_COURT_MOYEN) return 'Court-courrier';
  if (distanceKm <= BORNE_MOYEN_LONG) return 'Moyen-courrier';
  return 'Long-courrier';
}

/** Signatures attendues pour chaque segment aérien. */
const SIGNATURES_SEGMENT: Record<SegmentAerien, RegExp> = {
  'Court-courrier': /short[\s-]*haul|domestic|court/i,
  'Moyen-courrier': /medium[\s-]*haul|moyen/i,
  'Long-courrier': /long[\s-]*haul|international|long/i
};

export interface CritereFacteurVoyage {
  mode: ModeVoyage;
  /** Distance du trajet, qui détermine le segment quand le mode est aérien. */
  distanceKm?: number | null;
  /** `true` pour valoriser un montant facturé plutôt qu'une distance. */
  monetaire?: boolean;
  devise?: string | null;
}

/**
 * Facteurs crédibles pour une mission, du mieux noté au moins bon.
 *
 * <p>Le mode prime, puis le segment aérien. Sans signature de mode, le facteur
 * ne correspond pas au déplacement décrit : mieux vaut une mission signalée
 * sans facteur qu'un facteur ferroviaire appliqué à un vol.</p>
 */
export function classerFacteursVoyage(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurVoyage
): FacteurDetaille[] {

  if (!Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.monetaire ? 'MONETAIRE' : 'PHYSIQUE';
  const candidats = facteurs.filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu);
  if (!candidats.length) return [];

  const signatureMode = definitionMode(critere.mode)?.signature;
  if (!signatureMode) return [];
  const segment = critere.mode === 'Avion' ? segmentAerien(critere.distanceKm ?? null) : null;
  const devise = critere.devise?.trim().toUpperCase();

  const notes = candidats.map(facteur => {
    const libelle = facteur.typeName ?? '';
    let note = 0;

    if (signatureMode.test(libelle)) note += 100;

    if (segment) {
      // Un facteur aérien mal segmenté fausserait l'intensité au passager-km.
      if (SIGNATURES_SEGMENT[segment].test(libelle)) note += 50;
      else if (Object.values(SIGNATURES_SEGMENT).some(s => s.test(libelle))) note -= 200;
    }

    if (critere.monetaire && devise && (facteur.currency ?? '').trim().toUpperCase() === devise) {
      note += 20;
    }

    note += Math.min(facteur.referenceYear ?? 0, 2100) / 10000;
    return { facteur, note };
  });

  return notes
    .filter(n => n.note >= 100)
    .sort((a, b) => b.note - a.note)
    .map(n => n.facteur);
}

export function choisirFacteurVoyage(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurVoyage
): FacteurDetaille | null {
  return classerFacteursVoyage(facteurs, critere)[0] ?? null;
}

/**
 * Trajets comptés pour une mission : l'aller et le retour.
 *
 * <p>La distance saisie est celle de l'aller — l'écran la propose de capitale à
 * capitale, d'un point de départ vers une destination. Une mission ramène son
 * voyageur : n'en compter que la moitié sous-évaluait le poste de moitié.</p>
 *
 * <p>Un aller simple se saisit en divisant la distance par deux, ou en passant
 * par la valorisation monétaire. Le cas est rare devant celui du voyage
 * d'affaires ordinaire, et c'est le cas ordinaire qui doit être juste sans
 * intervention.</p>
 */
export const TRAJETS_PAR_MISSION = 2;

/**
 * Émissions d'une mission : grandeur × facteur.
 *
 * <p>Un facteur au passager-kilomètre porte sur un voyageur : la distance est
 * donc multipliée par le nombre de participants, puis par l'aller-retour.</p>
 *
 * <p>La valorisation monétaire n'est pas doublée : un montant de mission couvre
 * déjà le billet entier.</p>
 */
export function calculerEmissionVoyage(source: {
  facteur: number | null;
  monetaire: boolean;
  distanceKm: number | null;
  montant: number | null;
  participants?: number | null;
}): number {
  const facteur = source.facteur ?? 0;
  if (!facteur) return 0;

  if (source.monetaire) return (source.montant ?? 0) * facteur;

  const participants = source.participants && source.participants > 0 ? source.participants : 1;
  const emission =
    (source.distanceKm ?? 0) * facteur * participants * TRAJETS_PAR_MISSION;
  return Number.isFinite(emission) ? emission : 0;
}
