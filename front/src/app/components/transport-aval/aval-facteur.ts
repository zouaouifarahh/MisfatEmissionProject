import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier du transport et de la distribution en aval : modes de fret,
 * facteurs de secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type ModeFret = 'Routier' | 'Maritime' | 'Aérien' | 'Ferroviaire' | 'Non précisé';

export const MODES_FRET: ModeFret[] = ['Routier', 'Maritime', 'Aérien', 'Ferroviaire'];

/** Approche retenue pour valoriser l'expédition. */
export type TypeSaisie = 'Tonne.km' | 'Physique' | 'Monétaire';

export const TYPES_SAISIE: TypeSaisie[] = ['Tonne.km', 'Physique', 'Monétaire'];

export interface DefinitionFret {
  cle: ModeFret;
  emoji: string;
  /** Classe de pastille, définie dans la feuille du composant. */
  classeBadge: string;
  /**
   * Facteur de repli, en kgCO₂e par tonne-kilomètre.
   *
   * <p>Issu des bases ADEME : il ne remplace jamais un facteur documenté, il
   * évite qu'un référentiel incomplet réduise à zéro des expéditions réelles.</p>
   */
  facteurSecours: number;
  /** Libellé du repli, restitué à l'utilisateur. */
  libelleSecours: string;
  /** Reconnaît le mode dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît le mode dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

export const FRETS: DefinitionFret[] = [
  {
    cle: 'Routier', emoji: '🚛', classeBadge: 'fret-routier',
    facteurSecours: 0.088, libelleSecours: 'Fret routier — camion semi-remorque',
    signature: /truck|road|routier|lorry|hgv|camion/i,
    alias: /routier|camion|truck|road|semi remorque/i
  },
  {
    cle: 'Maritime', emoji: '🚢', classeBadge: 'fret-maritime',
    facteurSecours: 0.016, libelleSecours: 'Fret maritime — porte-conteneurs',
    signature: /sea|ocean|maritime|ship|container|vessel/i,
    alias: /maritime|bateau|navire|ocean|sea|conteneur|porte conteneurs/i
  },
  {
    cle: 'Ferroviaire', emoji: '🚆', classeBadge: 'fret-ferroviaire',
    facteurSecours: 0.022, libelleSecours: 'Fret ferroviaire — train de marchandises',
    signature: /rail|train|freight rail/i,
    alias: /ferroviaire|train|rail/i
  },
  {
    // « air » est borné par des limites de mot : « ferroviaire » le contient
    // sans être un mode aérien, et l'aurait autrement emporté.
    cle: 'Aérien', emoji: '✈️', classeBadge: 'fret-aerien',
    facteurSecours: 1.090, libelleSecours: 'Fret aérien — cargo',
    signature: /\bair|aerien|cargo|plane|aircraft/i,
    alias: /aerien|avion|\bair\b|cargo/i
  }
];

/** Repli monétaire, en kgCO₂e par unité de devise. */
export const REPLI_MONETAIRE = 0.350;

const PAR_CLE = new Map(FRETS.map(f => [f.cle, f]));

export function definitionFret(mode: ModeFret | string): DefinitionFret | null {
  return PAR_CLE.get(mode as ModeFret) ?? null;
}

export function emojiFret(mode: ModeFret | string): string {
  return definitionFret(mode)?.emoji ?? '•';
}

export function classeBadgeFret(mode: ModeFret | string): string {
  return definitionFret(mode)?.classeBadge ?? 'fret-neutre';
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

/** Reconnaît le mode de fret décrit par une cellule ou une saisie libre. */
export function reconnaitreModeFret(texte: string, defaut: ModeFret | null = null): ModeFret | null {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of FRETS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return defaut;
}

/** Reconnaît l'approche de valorisation décrite par une cellule. */
export function reconnaitreTypeSaisie(texte: string, defaut: TypeSaisie = 'Tonne.km'): TypeSaisie {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  if (/monetaire|montant|cout|facture|financier/.test(normalise)) return 'Monétaire';
  if (/tonne\s*km|tkm|t km/.test(normalise)) return 'Tonne.km';
  if (/physique|direct|poids|distance/.test(normalise)) return 'Physique';
  return defaut;
}

export type OrigineFacteur = 'MS SQL BDD' | 'ADEME' | 'Aucun';

export interface FacteurRetenu {
  origine: OrigineFacteur;
  valeur: number | null;
  unite: string;
  libelle: string;
  reference: string;
  baseAppliquee: string;
  id: number | null;
}

export interface CritereFacteurFret {
  mode: ModeFret;
  monetaire: boolean;
  devise?: string | null;
}

/**
 * Facteurs du référentiel compatibles, du mieux noté au moins bon.
 *
 * <p>Sans signature de mode, le facteur ne correspond pas au fret décrit :
 * mieux vaut une expédition signalée qu'un facteur maritime sur un camion.</p>
 */
export function classerFacteursFret(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFret
): FacteurDetaille[] {

  const definition = definitionFret(critere.mode);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.monetaire ? 'MONETAIRE' : 'PHYSIQUE';
  const devise = critere.devise?.trim().toUpperCase();

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu)
    .filter(f => definition.signature.test(f.typeName ?? ''))
    .map(facteur => {
      let note = 100;
      if (critere.monetaire && devise && (facteur.currency ?? '').trim().toUpperCase() === devise) {
        note += 20;
      }
      // Un facteur physique de fret se documente en tonne-kilomètre.
      if (!critere.monetaire && /tonne\s*[.·]?\s*km|tkm/i.test(facteur.unit ?? '')) note += 20;
      note += Math.min(facteur.referenceYear ?? 0, 2100) / 10000;
      return { facteur, note };
    })
    .sort((a, b) => b.note - a.note)
    .map(n => n.facteur);
}

/**
 * Retient un facteur : le référentiel MS SQL d'abord, le repli ADEME ensuite.
 *
 * <p>L'origine est toujours restituée, pour qu'un repli ne se confonde jamais
 * avec une donnée documentée.</p>
 */
export function retenirFacteurFret(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFret
): FacteurRetenu {

  const retenu = classerFacteursFret(facteurs, critere)[0];
  if (retenu) {
    return {
      origine: 'MS SQL BDD',
      valeur: retenu.factorValue,
      unite: retenu.unit,
      libelle: retenu.typeName,
      reference: retenu.referenceCode,
      baseAppliquee: retenu.databaseSource,
      id: retenu.id
    };
  }

  if (critere.monetaire) {
    return {
      origine: 'ADEME',
      valeur: REPLI_MONETAIRE,
      unite: critere.devise?.trim().toUpperCase() || 'TND',
      libelle: 'Approche monétaire fret',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  const definition = definitionFret(critere.mode);
  if (definition) {
    return {
      origine: 'ADEME',
      valeur: definition.facteurSecours,
      unite: 'Tonne.km',
      libelle: definition.libelleSecours,
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  return {
    origine: 'Aucun', valeur: null, unite: '', libelle: '',
    reference: '', baseAppliquee: '', id: null
  };
}

/**
 * Tonnes-kilomètres d'une expédition.
 *
 * <p>{@code Poids (tonnes) × Distance (km)} : unité de référence du fret, qui
 * rapporte la masse transportée à la distance parcourue.</p>
 */
export function tonnesKilometres(
  poidsTonnes: number | null,
  distanceKm: number | null
): number | null {

  if (poidsTonnes === null || distanceKm === null) return null;
  if (!Number.isFinite(poidsTonnes) || !Number.isFinite(distanceKm)) return null;

  const tkm = poidsTonnes * distanceKm;
  return Number.isFinite(tkm) ? tkm : null;
}

/** Convertit un poids en tonnes, quelle que soit son unité d'origine. */
export function enTonnes(poids: number | null, unite: string): number | null {
  if (poids === null || !Number.isFinite(poids)) return null;

  const normalise = normaliserTexte(unite);
  if (/^(kg|kilo|kilos|kilogramme|kilogrammes)$/.test(normalise)) return poids / 1000;
  return poids;
}

/** Émissions d'une expédition : grandeur × facteur. */
export function calculerEmissionFret(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site principal';

/** Devise retenue quand le classeur n'en désigne aucune. */
export const DEVISE_DEFAUT = 'TND';
