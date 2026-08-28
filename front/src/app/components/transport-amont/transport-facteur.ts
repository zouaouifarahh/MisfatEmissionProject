import { FacteurDetaille } from '../../services/referential.service';

/**
 * Rapprochement automatique d'une ligne de transport et d'un facteur du
 * référentiel carbone, puis calcul des émissions.
 *
 * <p>Fonctions pures, sans dépendance Angular : la saisie manuelle, l'import
 * Excel et les tests empruntent exactement le même chemin.</p>
 */

import { alignerSurFacteur } from '../../core/conversion-unites';

export type ModeTransport = 'Fret routier' | 'Fret maritime' | 'Fret aérien' | 'Non précisé';

export const MODES_TRANSPORT: ModeTransport[] = ['Fret routier', 'Fret maritime', 'Fret aérien'];

/** Formule de valorisation, dictée par l'unité du facteur. */
export type ModeCalcul = 'TONNE_KM' | 'KM' | 'MONETAIRE' | 'MASSE';

/** Signatures attendues dans le libellé du facteur, par mode de transport. */
const SIGNATURES: Partial<Record<ModeTransport, RegExp>> = {
  'Fret routier': /truck|road|routier|lorry|hgv|diesel|camion|van/i,
  'Fret maritime': /sea|ocean|maritime|ship|container|vessel|freight/i,
  'Fret aérien': /air|aerien|aircraft|plane|avion|flight/i
};

/** Unités reconnues, du plus précis au plus grossier. */
export function modeCalculDe(uniteFacteur: string, dataType: string): ModeCalcul {
  if ((dataType ?? '').toUpperCase() === 'MONETAIRE') return 'MONETAIRE';

  const unite = (uniteFacteur ?? '').trim().toLowerCase();
  if (/(tonne|t)\s*[.·*\/-]?\s*km/.test(unite)) return 'TONNE_KM';
  if (/^k?m$/.test(unite)) return 'KM';
  return 'MASSE';
}

/** Libellé lisible de la formule, affiché à la saisie pour lever l'ambiguïté. */
export function libelleFormule(mode: ModeCalcul): string {
  switch (mode) {
    case 'MONETAIRE': return 'Montant × Facteur';
    case 'TONNE_KM': return '(Poids ÷ 1000) × Distance × Facteur';
    case 'KM': return 'Distance × Facteur — facteur par kilomètre parcouru, indépendant de la charge';
    default: return 'Poids × Facteur';
  }
}

export interface CritereFacteur {
  mode: ModeTransport;
  /** `true` pour une valorisation au montant facturé. */
  monetaire: boolean;
  /** Devise attendue si la valorisation est monétaire. */
  devise?: string | null;
}

/**
 * Choisit le facteur le plus adapté à une ligne de transport.
 *
 * <p>Le tri croise trois critères, du plus contraignant au plus souple : le
 * mode de valorisation, la signature du mode de transport dans le libellé, puis
 * la cohérence de l'unité. Sans candidat crédible, la fonction rend
 * {@code null} : mieux vaut une ligne signalée sans facteur qu'un facteur
 * maritime appliqué à un camion.</p>
 */
export function choisirFacteur(
  facteurs: FacteurDetaille[],
  critere: CritereFacteur
): FacteurDetaille | null {
  return classerFacteurs(facteurs, critere)[0] ?? null;
}

/**
 * Facteurs crédibles pour un critère, du mieux noté au moins bon.
 *
 * <p>Alimente le sélecteur « Base appliquée » : l'utilisateur garde la main sur
 * la base documentaire sans pouvoir retenir un facteur étranger au mode.</p>
 */
export function classerFacteurs(
  facteurs: FacteurDetaille[],
  critere: CritereFacteur
): FacteurDetaille[] {

  if (!Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.monetaire ? 'MONETAIRE' : 'PHYSIQUE';
  const candidats = facteurs.filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu);
  if (!candidats.length) return [];

  const signature = SIGNATURES[critere.mode];
  const devise = critere.devise?.trim().toUpperCase();

  const notes = candidats.map(facteur => {
    let note = 0;

    // Le libellé désigne explicitement le mode : critère décisif. Un mode non
    // précisé — cas d'une ligne comptable — n'a pas de signature : aucun
    // facteur n'est alors privilégié à ce titre.
    if (signature?.test(facteur.typeName ?? '')) note += 100;

    const calcul = modeCalculDe(facteur.unit, facteur.dataType);
    if (!critere.monetaire) {
      // Un facteur maritime se documente en tonne.km, un facteur routier au km.
      if (critere.mode === 'Fret maritime' && calcul === 'TONNE_KM') note += 20;
      if (critere.mode === 'Fret routier' && calcul === 'KM') note += 20;
      if (critere.mode === 'Fret aérien' && calcul === 'TONNE_KM') note += 20;
    } else if (devise && (facteur.currency ?? '').trim().toUpperCase() === devise) {
      note += 20;
    }

    // À signature égale, le millésime le plus récent prime.
    note += Math.min(facteur.referenceYear ?? 0, 2100) / 10000;

    return { facteur, note };
  });

  // Sans signature de mode, le facteur ne correspond pas au transport décrit :
  // mieux vaut aucune proposition qu'un facteur maritime sur un camion.
  return notes
    .filter(n => n.note >= 100)
    .sort((a, b) => b.note - a.note)
    .map(n => n.facteur);
}

export interface DonneesCalcul {
  facteur: number | null;
  uniteFacteur: string;
  dataType: string;
  poidsKg: number | null;
  distanceKm: number | null;
  montant: number | null;
}

/**
 * Poids total d'une expédition comptée en unités.
 *
 * <p>Un expéditeur de filtres ne pèse pas ses palettes : il compte les pièces
 * et connaît le poids moyen de la référence. Le poids total s'en déduit, et
 * c'est lui que la formule tonne-kilomètre attend.</p>
 *
 * <p>Rend {@code null} tant que l'un des deux manque : un poids déduit d'une
 * quantité inconnue serait une invention, et la saisie directe du poids reste
 * ouverte pour les expéditions qu'on pèse réellement.</p>
 */
export function poidsTotalDepuisQuantite(
  quantite: number | null | undefined,
  poidsMoyenKg: number | null | undefined
): number | null {

  if (quantite === null || quantite === undefined || !Number.isFinite(quantite)) return null;
  if (poidsMoyenKg === null || poidsMoyenKg === undefined || !Number.isFinite(poidsMoyenKg)) {
    return null;
  }
  if (quantite <= 0 || poidsMoyenKg <= 0) return null;

  const total = quantite * poidsMoyenKg;
  return Number.isFinite(total) ? total : null;
}

/**
 * Tonnes-kilomètres d'une expédition.
 *
 * <p>{@code t.km = Distance moyenne pondérée × Quantité × Poids moyen × 0,001}.
 * Le millième convertit les kilogrammes en tonnes : c'est la conversion que le
 * facteur attend, et celle dont l'oubli décale le poste d'un facteur mille.</p>
 *
 * <p>La distance est dite « moyenne pondérée » parce qu'une expédition groupée
 * dessert plusieurs pays : la distance retenue est la moyenne des distances
 * pondérée par la part de quantité livrée à chacun. Cette pondération se fait à
 * la saisie — l'écran reçoit la distance déjà pondérée, il ne la recalcule
 * pas.</p>
 */
export function tonnesKilometres(
  distanceMoyennePondereeKm: number | null,
  quantite: number | null,
  poidsMoyenKg: number | null
): number | null {

  const poidsTotalKg = poidsTotalDepuisQuantite(quantite, poidsMoyenKg);
  if (poidsTotalKg === null) return null;
  if (distanceMoyennePondereeKm === null || !Number.isFinite(distanceMoyennePondereeKm)) {
    return null;
  }

  const tkm = distanceMoyennePondereeKm * poidsTotalKg * 0.001;
  return Number.isFinite(tkm) ? tkm : null;
}

/**
 * Applique la formule dictée par l'unité du facteur retenu.
 *
 * <p>La branche massique alignait le poids sur le facteur sans regarder l'unité
 * de celui-ci : un facteur publié à la tonne — le référentiel en compte cinq,
 * dont un à 3 100 kgCO₂e — était multiplié par des kilogrammes, et le poste
 * sortait mille fois trop haut. C'est l'erreur que ce module annonce en
 * ouverture et que la formule commettait.</p>
 *
 * <p>La conversion passe par {@link alignerSurFacteur}, qui refuse de deviner :
 * une unité qu'elle ne reconnaît pas laisse la quantité inchangée plutôt que de
 * la corriger au jugé. Mieux vaut un poste juste dans son unité de saisie qu'un
 * poste faux dans une autre.</p>
 */
export function calculerEmission(source: DonneesCalcul): number {
  const facteur = source.facteur ?? 0;
  if (!facteur) return 0;

  const poids = source.poidsKg ?? 0;
  const distance = source.distanceKm ?? 0;

  switch (modeCalculDe(source.uniteFacteur, source.dataType)) {
    case 'MONETAIRE': return (source.montant ?? 0) * facteur;
    case 'TONNE_KM': return (poids / 1000) * distance * facteur;
    case 'KM': return distance * facteur;
    default: return poidsAlignéSurLeFacteur(poids, source.uniteFacteur) * facteur;
  }
}

/**
 * Poids exprimé dans l'unité que le facteur attend.
 *
 * <p>Les poids sont saisis en kilogrammes ; le facteur, lui, peut être publié
 * au kilogramme, à la tonne ou au gramme. Sans cet alignement, l'écart d'unité
 * se reporte tel quel sur l'émission.</p>
 */
function poidsAlignéSurLeFacteur(poidsKg: number, uniteFacteur: string): number {
  const aligne = alignerSurFacteur(poidsKg, 'kg', uniteFacteur);
  return aligne.statut === 'CONVERTI' || aligne.statut === 'IDENTIQUE'
    ? aligne.valeur
    : poidsKg;
}

/**
 * Déduit le mode de transport d'une ligne importée.
 *
 * <p>Le suivi export documente deux trajets : un acheminement terrestre vers le
 * port et la traversée maritime. Le trajet le plus long porte l'essentiel des
 * émissions et détermine le mode retenu.</p>
 */
export function deduireMode(
  distanceTerrestreKm: number | null,
  distanceMaritimeKm: number | null
): { mode: ModeTransport; distanceKm: number | null; legIgnore: boolean } {

  const terrestre = distanceTerrestreKm ?? 0;
  const maritime = distanceMaritimeKm ?? 0;

  if (maritime > terrestre) {
    return { mode: 'Fret maritime', distanceKm: maritime, legIgnore: terrestre > 0 };
  }
  if (terrestre > 0) {
    return { mode: 'Fret routier', distanceKm: terrestre, legIgnore: false };
  }
  return { mode: 'Fret routier', distanceKm: null, legIgnore: false };
}
