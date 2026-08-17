import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier de la transformation des produits vendus : procédés, facteurs de
 * secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type TypeProcede =
  | 'Assemblage Mécanique'
  | 'Traitement Thermique'
  | 'Usinage / Découpe'
  | 'Moulage / Extrusion'
  | 'Produit Fini Direct';

export const PROCEDES: TypeProcede[] = [
  'Assemblage Mécanique',
  'Usinage / Découpe',
  'Moulage / Extrusion',
  'Traitement Thermique',
  'Produit Fini Direct'
];

/** Approche retenue pour valoriser la transformation. */
export type TypeSaisie = 'Masse' | 'Énergétique' | 'Monétaire';

export const TYPES_SAISIE: TypeSaisie[] = ['Masse', 'Énergétique', 'Monétaire'];

/** Unités proposées, par approche. */
export const UNITES_PAR_SAISIE: Record<TypeSaisie, string[]> = {
  'Masse': ['Tonnes', 'kg', 'Unités'],
  'Énergétique': ['kWh'],
  'Monétaire': ['TND', 'EUR']
};

export interface DefinitionProcede {
  cle: TypeProcede;
  emoji: string;
  /** Classe de pastille, définie dans la feuille du composant. */
  classeBadge: string;
  /**
   * Facteur de repli, en kgCO₂e par kilogramme transformé.
   *
   * <p>`null` signifie qu'aucun repli crédible n'existe : le traitement
   * thermique varie trop d'un four et d'un alliage à l'autre pour qu'une valeur
   * unique soit défendable.</p>
   */
  facteurParKg: number | null;
  libelleSecours: string;
  /** Reconnaît le procédé dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît le procédé dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

export const DEFINITIONS: DefinitionProcede[] = [
  {
    cle: 'Produit Fini Direct', emoji: '📦', classeBadge: 'procede-fini',
    facteurParKg: 0,
    libelleSecours: 'Produit fini — aucune transformation ultérieure',
    signature: /finished|fini|no processing|sans transformation/i,
    alias: /produit fini|fini|aucune transformation|sans transformation|direct/i
  },
  {
    cle: 'Assemblage Mécanique', emoji: '⚙️', classeBadge: 'procede-assemblage',
    facteurParKg: 0.050,
    libelleSecours: 'Assemblage mécanique léger',
    signature: /assembl|montage/i,
    alias: /assemblage|assembl|montage|mecanique/i
  },
  {
    cle: 'Usinage / Découpe', emoji: '📐', classeBadge: 'procede-usinage',
    facteurParKg: 0.120,
    libelleSecours: 'Usinage et découpe métallique',
    signature: /machining|cutting|usinage|decoupe/i,
    alias: /usinage|decoupe|coupe|machining|cutting|tournage|fraisage/i
  },
  {
    cle: 'Moulage / Extrusion', emoji: '🧪', classeBadge: 'procede-moulage',
    facteurParKg: 0.250,
    libelleSecours: 'Extrusion et moulage plastique',
    signature: /moulding|molding|extrusion|injection|moulage/i,
    alias: /moulage|molding|extrusion|injection|plastique/i
  },
  {
    cle: 'Traitement Thermique', emoji: '🔥', classeBadge: 'procede-thermique',
    facteurParKg: 0.380,
    libelleSecours: 'Traitement thermique et fusion',
    signature: /thermal|heat treat|furnace|fusion|traitement thermique/i,
    alias: /thermique|fusion|four|trempe|recuit|heat/i
  }
];

/** Repli monétaire, en kgCO₂e par unité de devise. */
export const REPLI_MONETAIRE = 0.180;

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionProcede(procede: TypeProcede | string): DefinitionProcede | null {
  return PAR_CLE.get(procede as TypeProcede) ?? null;
}

export function emojiProcede(procede: TypeProcede | string): string {
  return definitionProcede(procede)?.emoji ?? '•';
}

export function classeBadgeProcede(procede: TypeProcede | string): string {
  return definitionProcede(procede)?.classeBadge ?? 'procede-neutre';
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
 * Reconnaît le procédé décrit par une cellule ou une saisie libre.
 *
 * <p>« Produit fini » est éprouvé en premier : sans quoi « produit fini
 * assemblé » serait ramené à un assemblage, alors qu'il ne subit précisément
 * plus aucune transformation.</p>
 */
export function reconnaitreProcede(texte: string, defaut: TypeProcede | null = null): TypeProcede | null {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of DEFINITIONS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return defaut;
}

/** Reconnaît l'approche de valorisation décrite par une cellule. */
export function reconnaitreTypeSaisie(texte: string, defaut: TypeSaisie = 'Masse'): TypeSaisie {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  if (/monetaire|montant|cout|financier/.test(normalise)) return 'Monétaire';
  if (/energetique|energie|kwh|electricite/.test(normalise)) return 'Énergétique';
  if (/masse|quantite|poids|tonne|unite/.test(normalise)) return 'Masse';
  return defaut;
}

/** Déduit l'approche de la seule unité, quand le fichier est muet. */
export function saisieDepuisUnite(unite: string, defaut: TypeSaisie = 'Masse'): TypeSaisie {
  const normalise = normaliserTexte(unite);
  if (/^(tnd|dt|eur|usd|mad)$/.test(normalise)) return 'Monétaire';
  if (/^kwh$/.test(normalise)) return 'Énergétique';
  if (/^(t|tonne|tonnes|kg|unite|unites|u|pcs?)$/.test(normalise)) return 'Masse';
  return defaut;
}

/** Forme canonique d'une unité. */
export function normaliserUnite(brute: string): string {
  const unite = normaliserTexte(brute);
  if (/^(t|tonne|tonnes)$/.test(unite)) return 'Tonnes';
  if (/^kg$/.test(unite)) return 'kg';
  if (/^(unite|unites|u|pc|pcs|piece|pieces)$/.test(unite)) return 'Unités';
  if (/^kwh$/.test(unite)) return 'kWh';
  if (/^(tnd|dt)$/.test(unite)) return 'TND';
  if (/^eur$/.test(unite)) return 'EUR';
  return brute.trim();
}

/**
 * Masse moyenne d'une pièce, en kilogrammes.
 *
 * <p>Les relevés de production comptent souvent en pièces alors que les
 * facteurs de procédé s'expriment au kilogramme. Cette masse conventionnelle
 * permet la conversion ; elle reste une hypothèse, à réviser dès qu'une masse
 * unitaire par référence est disponible.</p>
 */
export const MASSE_PAR_UNITE = 0.45;

/**
 * Ramène une quantité en kilogrammes.
 *
 * <p>Les facteurs de procédé s'expriment au kilogramme : confondre tonnes et
 * kilogrammes fausserait d'un facteur mille. Une quantité comptée en devise n'a
 * pas d'équivalent massique et rend {@code null}.</p>
 */
export function enKilogrammes(quantite: number | null, unite: string): number | null {
  if (quantite === null || !Number.isFinite(quantite)) return null;

  switch (normaliserUnite(unite)) {
    case 'Tonnes': return quantite * 1000;
    case 'kg': return quantite;
    case 'Unités': return quantite * MASSE_PAR_UNITE;
    default: return null;
  }
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

const AUCUN: FacteurRetenu = {
  origine: 'Aucun', valeur: null, unite: '', libelle: '',
  reference: '', baseAppliquee: '', id: null
};

export interface CritereFacteurProcede {
  procede: TypeProcede;
  unite: string;
  monetaire?: boolean;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursProcede(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurProcede
): FacteurDetaille[] {

  const definition = definitionProcede(critere.procede);
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
export function retenirFacteurProcede(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurProcede
): FacteurRetenu {

  const monetaire = critere.monetaire ?? false;
  const retenu = classerFacteursProcede(facteurs, critere)[0];

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

  if (monetaire) {
    return {
      origine: 'ADEME',
      valeur: REPLI_MONETAIRE,
      unite: normaliserUnite(critere.unite) || 'TND',
      libelle: 'Approche monétaire transformation',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  const definition = definitionProcede(critere.procede);
  if (!definition) return { ...AUCUN };

  // Un produit fini ne subit aucune transformation : sa contribution est nulle
  // quelle que soit l'unité dans laquelle il est compté.
  if (definition.cle === 'Produit Fini Direct') {
    return {
      origine: 'ADEME',
      valeur: 0,
      unite: normaliserUnite(critere.unite) || 'Unités',
      libelle: definition.libelleSecours,
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  // Les autres procédés se valorisent au kilogramme : sans équivalent massique,
  // aucun facteur ne s'applique.
  if (definition.facteurParKg !== null && enKilogrammes(1, critere.unite) !== null) {
    return {
      origine: 'ADEME',
      valeur: definition.facteurParKg,
      unite: 'kg',
      libelle: definition.libelleSecours,
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  return { ...AUCUN };
}

export interface DonneesCalcul {
  procede: TypeProcede;
  quantite: number | null;
  unite: string;
  monetaire?: boolean;
}

/**
 * Grandeur effectivement valorisée.
 *
 * <p>Une masse est ramenée au kilogramme, unité des facteurs de procédé ; un
 * montant et un produit fini sont pris tels quels.</p>
 */
export function grandeurValorisee(source: DonneesCalcul): number | null {
  if (source.quantite === null || !Number.isFinite(source.quantite)) return null;

  if (source.monetaire) return source.quantite;
  if (source.procede === 'Produit Fini Direct') return source.quantite;

  return enKilogrammes(source.quantite, source.unite);
}

/** Unité de la grandeur valorisée. */
export function uniteValorisee(source: DonneesCalcul): string {
  if (source.monetaire) return normaliserUnite(source.unite) || 'TND';
  if (source.procede === 'Produit Fini Direct') return normaliserUnite(source.unite) || 'Unités';
  return enKilogrammes(1, source.unite) !== null ? 'kg' : normaliserUnite(source.unite);
}

/** Émissions : grandeur valorisée × facteur. */
export function calculerEmissionProcede(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site principal';
