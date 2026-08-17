import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier de l'utilisation des produits vendus : gammes de filtres,
 * facteurs de secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type GammeProduit =
  | 'Filtre à Air'
  | 'Filtre Carburant'
  | 'Filtre à Huile'
  | 'Filtre Habitacle';

export const GAMMES: GammeProduit[] =
  ['Filtre à Air', 'Filtre Carburant', 'Filtre à Huile', 'Filtre Habitacle'];

/** Approche retenue pour valoriser la phase d'utilisation. */
export type TypeSaisie = 'Kilométrage' | 'Consommation' | 'Monétaire';

export const TYPES_SAISIE: TypeSaisie[] = ['Kilométrage', 'Consommation', 'Monétaire'];

/**
 * Durée de vie moyenne d'un consommable automobile, en kilomètres.
 *
 * <p>Un filtre est remplacé à intervalle kilométrique : c'est cette distance,
 * et non la durée calendaire, qui détermine son impact d'usage.</p>
 */
export const DUREE_VIE_DEFAUT_KM = 15000;

export interface DefinitionGamme {
  cle: GammeProduit;
  emoji: string;
  /** Classe de pastille, définie dans la feuille du composant. */
  classeBadge: string;
  /**
   * Facteur de repli, en kgCO₂e par kilomètre et par unité vendue.
   *
   * <p>Il traduit la surconsommation induite par le consommable sur la durée de
   * son service, non les émissions de sa fabrication.</p>
   */
  facteurParKmUnite: number;
  libelleSecours: string;
  /** Reconnaît la gamme dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît la gamme dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

export const DEFINITIONS: DefinitionGamme[] = [
  {
    cle: 'Filtre Habitacle', emoji: '⚡', classeBadge: 'gamme-habitacle',
    facteurParKmUnite: 0.0002,
    libelleSecours: 'Filtre habitacle — impact indirect d\'usage',
    signature: /cabin|habitacle|pollen|interior/i,
    alias: /habitacle|cabine|pollen|climatisation|electrique/i
  },
  {
    cle: 'Filtre Carburant', emoji: '⛽', classeBadge: 'gamme-carburant',
    facteurParKmUnite: 0.0012,
    libelleSecours: 'Filtre carburant — impact indirect d\'usage',
    signature: /fuel|carburant|diesel|petrol|gasoil/i,
    alias: /carburant|fuel|diesel|essence|gasoil|gazole/i
  },
  {
    cle: 'Filtre à Huile', emoji: '🛢️', classeBadge: 'gamme-huile',
    facteurParKmUnite: 0.0005,
    libelleSecours: 'Filtre à huile — impact indirect d\'usage',
    signature: /oil|huile|lubricant/i,
    alias: /huile|oil|lubrifiant/i
  },
  {
    cle: 'Filtre à Air', emoji: '💨', classeBadge: 'gamme-air',
    facteurParKmUnite: 0.0008,
    libelleSecours: 'Filtre à air — impact indirect d\'usage',
    signature: /air filter|air|admission/i,
    alias: /air|admission/i
  }
];

/** Repli monétaire, en kgCO₂e par unité de devise vendue. */
export const REPLI_MONETAIRE = 0.220;

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionGamme(gamme: GammeProduit | string): DefinitionGamme | null {
  return PAR_CLE.get(gamme as GammeProduit) ?? null;
}

export function emojiGamme(gamme: GammeProduit | string): string {
  return definitionGamme(gamme)?.emoji ?? '•';
}

export function classeBadgeGamme(gamme: GammeProduit | string): string {
  return definitionGamme(gamme)?.classeBadge ?? 'gamme-neutre';
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
 * Reconnaît la gamme décrite par une cellule ou une saisie libre.
 *
 * <p>Les gammes composées sont éprouvées avant « air » : « filtre à air
 * habitacle » désigne un filtre d'habitacle, dont l'impact d'usage est quatre
 * fois moindre.</p>
 */
export function reconnaitreGamme(texte: string, defaut: GammeProduit | null = null): GammeProduit | null {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of DEFINITIONS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return defaut;
}

/** Reconnaît l'approche de valorisation décrite par une cellule. */
export function reconnaitreTypeSaisie(texte: string, defaut: TypeSaisie = 'Kilométrage'): TypeSaisie {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  if (/monetaire|montant|ca|vente|chiffre/.test(normalise)) return 'Monétaire';
  if (/consommation|directe|energie/.test(normalise)) return 'Consommation';
  if (/kilometrage|km|duree de vie|duree/.test(normalise)) return 'Kilométrage';
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

export interface CritereFacteurGamme {
  gamme: GammeProduit;
  monetaire?: boolean;
  devise?: string | null;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursGamme(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurGamme
): FacteurDetaille[] {

  const definition = definitionGamme(critere.gamme);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.monetaire ? 'MONETAIRE' : 'PHYSIQUE';

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu)
    .filter(f => definition.signature.test(f.typeName ?? ''))
    .map(facteur => ({
      facteur,
      note: 100 + Math.min(facteur.referenceYear ?? 0, 2100) / 10000
    }))
    .sort((a, b) => b.note - a.note)
    .map(n => n.facteur);
}

/**
 * Retient un facteur : le référentiel MS SQL d'abord, le repli ADEME ensuite.
 *
 * <p>L'origine est toujours restituée, pour qu'un repli ne se confonde jamais
 * avec une donnée documentée.</p>
 */
export function retenirFacteurGamme(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurGamme
): FacteurRetenu {

  const retenu = classerFacteursGamme(facteurs, critere)[0];
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
      libelle: 'Approche monétaire — utilisation des produits vendus',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  const definition = definitionGamme(critere.gamme);
  if (definition) {
    return {
      origine: 'ADEME',
      valeur: definition.facteurParKmUnite,
      unite: 'km·unité',
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

export interface DonneesCalcul {
  typeSaisie: TypeSaisie;
  quantiteVendue: number | null;
  dureeVieKm: number | null;
  montant: number | null;
}

/**
 * Grandeur effectivement valorisée.
 *
 * <p>En approche kilométrique, le produit du volume vendu par la durée de vie
 * donne le kilométrage total couvert par les produits mis sur le marché ; c'est
 * lui que le facteur d'usage valorise.</p>
 */
export function grandeurValorisee(source: DonneesCalcul): number | null {
  if (source.typeSaisie === 'Monétaire') {
    return source.montant !== null && Number.isFinite(source.montant) ? source.montant : null;
  }

  const quantite = source.quantiteVendue;
  if (quantite === null || !Number.isFinite(quantite)) return null;

  if (source.typeSaisie === 'Consommation') return quantite;

  const duree = source.dureeVieKm ?? DUREE_VIE_DEFAUT_KM;
  if (!Number.isFinite(duree) || duree <= 0) return null;

  const total = quantite * duree;
  return Number.isFinite(total) ? total : null;
}

/** Unité de la grandeur valorisée. */
export function uniteValorisee(typeSaisie: TypeSaisie, devise = 'TND'): string {
  if (typeSaisie === 'Monétaire') return devise;
  if (typeSaisie === 'Consommation') return 'unités';
  return 'km·unité';
}

/** Émissions : grandeur valorisée × facteur. */
export function calculerEmissionUsage(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site Principal';
