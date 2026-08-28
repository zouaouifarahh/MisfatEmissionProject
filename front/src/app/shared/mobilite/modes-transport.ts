import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle commun aux catégories 6 et 7 : modes de transport, pastilles et
 * facteurs de secours.
 *
 * <p>Fonctions pures, sans dépendance Angular : les composants, les imports et
 * les tests empruntent exactement le même chemin.</p>
 */

export type ModeTransport =
  | 'Avion' | 'Train' | 'Voiture' | 'Voiture de location' | 'Taxi'
  | 'Bus' | 'Motocyclette' | 'Bicyclette' | 'À pied' | 'Hôtel';

export interface DefinitionMode {
  cle: ModeTransport;
  emoji: string;
  /** Classe de pastille, définie dans `shared/styles/mobilite-badges.css`. */
  classeBadge: string;
  /**
   * Facteur de repli, en kgCO₂e par kilomètre.
   *
   * <p>Appliqué lorsque le référentiel MS SQL ne documente pas le mode. `null`
   * signifie qu'aucun repli crédible n'existe : l'aérien dépend du segment et
   * l'hôtel se compte à la nuitée, non au kilomètre.</p>
   */
  facteurSecours: number | null;
  /** Reconnaît le mode dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît le mode dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

/**
 * Facteurs de repli issus des bases ADEME et GHG Protocol.
 *
 * <p>Ils ne remplacent jamais un facteur documenté : ils évitent seulement
 * qu'un référentiel incomplet réduise à zéro des trajets bien réels. Toute
 * ligne ainsi valorisée est signalée comme reposant sur un repli.</p>
 */
export const MODES: DefinitionMode[] = [
  {
    cle: 'Avion', emoji: '✈️', classeBadge: 'mode-avion', facteurSecours: null,
    signature: /air|avion|flight|haul|plane|aircraft/i,
    alias: /avion|air|vol|plane|flight/i
  },
  {
    cle: 'Train', emoji: '🚆', classeBadge: 'mode-train', facteurSecours: 0.025,
    signature: /train|rail/i,
    // « Tain » figure tel quel dans le relevé des moyens de transport.
    alias: /train|tain|rail|ter|tgv|metro|tram/i
  },
  {
    cle: 'Voiture', emoji: '🚗', classeBadge: 'mode-voiture', facteurSecours: 0.192,
    signature: /car|voiture|gasoline|diesel|vehicle/i,
    alias: /voiture|car|auto|vehicule|personnelle/i
  },
  {
    cle: 'Voiture de location', emoji: '🚗', classeBadge: 'mode-voiture', facteurSecours: 0.192,
    signature: /rental|hire|location/i,
    alias: /location|rental|louee?/i
  },
  {
    cle: 'Taxi', emoji: '🚕', classeBadge: 'mode-voiture', facteurSecours: 0.192,
    signature: /taxi|cab/i,
    alias: /taxi|vtc|cab/i
  },
  {
    cle: 'Bus', emoji: '🚌', classeBadge: 'mode-bus', facteurSecours: 0.103,
    signature: /bus|coach|autocar/i,
    alias: /bus|autocar|coach|navette/i
  },
  {
    cle: 'Motocyclette', emoji: '🏍️', classeBadge: 'mode-moto', facteurSecours: 0.091,
    signature: /motorbike|motorcycle|scooter|moto/i,
    alias: /moto|scooter|cyclomoteur|deux roues/i
  },
  {
    cle: 'Bicyclette', emoji: '🚲', classeBadge: 'mode-doux', facteurSecours: 0,
    signature: /bicycle|bike|cycl/i,
    alias: /bicyclette|velo|bike|cycl/i
  },
  {
    cle: 'À pied', emoji: '🚶', classeBadge: 'mode-doux', facteurSecours: 0,
    signature: /walk|foot|pied/i,
    alias: /a pied|pied|marche|walk/i
  },
  {
    cle: 'Hôtel', emoji: '🏨', classeBadge: 'mode-hotel', facteurSecours: null,
    signature: /hotel|accommodation|nuitee/i,
    alias: /hotel|hebergement|nuitee/i
  }
];

/** Modes proposés à la saisie d'un voyage d'affaires, catégorie 6. */
export const MODES_VOYAGE: ModeTransport[] =
  ['Avion', 'Train', 'Voiture de location', 'Taxi', 'Hôtel'];

/** Modes proposés à la saisie d'un trajet domicile-travail, catégorie 7. */
export const MODES_DOMICILE_TRAVAIL: ModeTransport[] =
  ['Voiture', 'Bus', 'Train', 'Motocyclette', 'Bicyclette', 'À pied', 'Taxi'];

const PAR_CLE = new Map(MODES.map(m => [m.cle, m]));

export function definitionMode(mode: ModeTransport | string): DefinitionMode | null {
  return PAR_CLE.get(mode as ModeTransport) ?? null;
}

export function emojiMode(mode: ModeTransport | string): string {
  return definitionMode(mode)?.emoji ?? '•';
}

export function classeBadgeMode(mode: ModeTransport | string): string {
  return definitionMode(mode)?.classeBadge ?? 'mode-neutre';
}

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
export function normaliserTexte(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Reconnaît le mode décrit par une cellule de classeur ou une saisie libre.
 *
 * <p>Les modes composés sont éprouvés avant les modes simples : « voiture de
 * location » ne doit pas être ramené à « voiture », dont le facteur ne couvre
 * pas la même réalité comptable.</p>
 */
export function reconnaitreMode(texte: string, defaut: ModeTransport | null = null): ModeTransport | null {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  const ordre: ModeTransport[] = [
    'Voiture de location', 'Motocyclette', 'Bicyclette', 'À pied',
    'Taxi', 'Bus', 'Train', 'Avion', 'Hôtel', 'Voiture'
  ];

  for (const cle of ordre) {
    const definition = PAR_CLE.get(cle);
    if (definition && definition.alias.test(normalise)) return cle;
  }
  return defaut;
}

/** Origine du facteur retenu, restituée à l'utilisateur. */
export type OrigineFacteur = 'MS SQL' | 'Repli ADEME' | 'Aucun';

export interface FacteurRetenu {
  origine: OrigineFacteur;
  valeur: number | null;
  unite: string;
  libelle: string;
  reference: string;
  baseAppliquee: string;
  /** Identifiant du facteur MS SQL, absent pour un repli. */
  id: number | null;
}

const AUCUN_FACTEUR: FacteurRetenu = {
  origine: 'Aucun', valeur: null, unite: '', libelle: '', reference: '', baseAppliquee: '', id: null
};

/**
 * Facteurs du référentiel compatibles avec un mode, du mieux noté au moins bon.
 *
 * <p>La motorisation, quand elle est connue, départage deux facteurs d'un même
 * mode : un moteur diesel et un moteur essence ne s'équivalent pas.</p>
 */
export function classerFacteursMode(
  facteurs: FacteurDetaille[],
  mode: ModeTransport,
  motorisation?: string | null
): FacteurDetaille[] {

  const definition = definitionMode(mode);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  const motif = normaliserTexte(motorisation);

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === 'PHYSIQUE')
    .filter(f => definition.signature.test(f.typeName ?? ''))
    .map(facteur => {
      let note = 100;
      if (motif && normaliserTexte(facteur.typeName).includes(motif)) note += 40;
      note += Math.min(facteur.referenceYear ?? 0, 2100) / 10000;
      return { facteur, note };
    })
    .sort((a, b) => b.note - a.note)
    .map(n => n.facteur);
}

/**
 * Retient un facteur pour un mode : le référentiel d'abord, le repli ensuite.
 *
 * <p>Un référentiel incomplet ne doit pas réduire à zéro des trajets réels ;
 * mais l'origine du facteur est toujours restituée, pour qu'un repli ne se
 * confonde jamais avec une donnée documentée.</p>
 */
export function retenirFacteur(
  facteurs: FacteurDetaille[],
  mode: ModeTransport,
  motorisation?: string | null
): FacteurRetenu {

  const compatibles = classerFacteursMode(facteurs, mode, motorisation);
  const retenu = compatibles[0];

  if (retenu) {
    return {
      origine: 'MS SQL',
      valeur: retenu.factorValue,
      unite: retenu.unit,
      libelle: retenu.typeName,
      reference: retenu.referenceCode,
      baseAppliquee: retenu.databaseSource,
      id: retenu.id
    };
  }

  const definition = definitionMode(mode);
  if (definition && definition.facteurSecours !== null) {
    return {
      origine: 'Repli ADEME',
      valeur: definition.facteurSecours,
      unite: 'km',
      libelle: `${definition.cle} — valeur de repli`,
      reference: '',
      baseAppliquee: 'ADEME / GHG Protocol (repli)',
      id: null
    };
  }

  return { ...AUCUN_FACTEUR };
}

/**
 * Kilométrage annuel d'un trajet domicile-travail.
 *
 * <p>{@code (Distance aller × 2 × Jours travaillés) ÷ Covoiturage} : l'aller
 * compte le retour, et le covoiturage répartit les émissions du véhicule entre
 * ses occupants.</p>
 */
export function kilometrageAnnuel(
  distanceAllerKm: number | null,
  joursTravailles: number | null,
  covoiturage: number | null
): number | null {

  if (distanceAllerKm === null || !Number.isFinite(distanceAllerKm)) return null;

  const jours = joursTravailles && joursTravailles > 0 ? joursTravailles : 0;
  const occupants = covoiturage && covoiturage > 0 ? covoiturage : 1;
  if (!jours) return null;

  const total = (distanceAllerKm * 2 * jours) / occupants;
  return Number.isFinite(total) ? total : null;
}

/** Émissions d'un trajet : grandeur × facteur. */
export function calculerEmission(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/**
 * Jours travaillés retenus à défaut de donnée.
 *
 * <p>251 jours : l'année civile moins les week-ends, sans déduction des congés
 * ni des jours fériés. C'est la valeur arbitrée pour MISFAT, plus haute que les
 * 220 jours d'usage en France — elle majore donc le kilométrage domicile-travail
 * plutôt que de le sous-estimer, ce qui est le sens prudent pour un poste dont
 * la donnée est déclarative.</p>
 *
 * <p>Reste modifiable ligne à ligne : un temps partiel ou un site en trois-huit
 * ne se ramène à aucune valeur générale.</p>
 */
export const JOURS_TRAVAILLES_DEFAUT = 251;

/** Taux d'occupation retenu à défaut : un occupant par véhicule. */
export const COVOITURAGE_DEFAUT = 1;

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site principal';
