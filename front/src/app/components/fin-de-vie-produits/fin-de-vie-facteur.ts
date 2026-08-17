import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier de la fin de vie des produits vendus : filières de traitement,
 * facteurs de secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type FiliereTraitement =
  | 'Recyclage'
  | 'Incinération'
  | 'Enfouissement'
  | 'Déchets Dangereux';

export const FILIERES: FiliereTraitement[] =
  ['Recyclage', 'Incinération', 'Enfouissement', 'Déchets Dangereux'];

/** Approche retenue pour valoriser la fin de vie. */
export type TypeSaisie = 'Masse' | 'Monétaire';

export const TYPES_SAISIE: TypeSaisie[] = ['Masse', 'Monétaire'];

/** Unités proposées, par approche. */
export const UNITES_PAR_SAISIE: Record<TypeSaisie, string[]> = {
  'Masse': ['Tonnes', 'kg'],
  'Monétaire': ['TND', 'EUR']
};

export interface DefinitionFiliere {
  cle: FiliereTraitement;
  /** Libellé complet, tel qu'il figure dans le tableau. */
  libelle: string;
  emoji: string;
  /** Classe de pastille, définie dans la feuille du composant. */
  classeBadge: string;
  /** Facteur de repli, en kgCO₂e par kilogramme traité. */
  facteurParKg: number;
  libelleSecours: string;
  /** Reconnaît la filière dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît la filière dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

export const DEFINITIONS: DefinitionFiliere[] = [
  {
    cle: 'Déchets Dangereux', libelle: 'Traitement déchets dangereux',
    emoji: '⚙️', classeBadge: 'filiere-dangereux',
    facteurParKg: 0.310,
    libelleSecours: 'Traitement de déchets dangereux — huiles et métaux',
    signature: /hazardous|dangereux|oil|huile|special/i,
    alias: /dangereux|hazardous|huile|special|toxique/i
  },
  {
    cle: 'Recyclage', libelle: 'Recyclage / Valorisation matière',
    emoji: '♻️', classeBadge: 'filiere-recyclage',
    facteurParKg: 0.021,
    libelleSecours: 'Recyclage métal et plastique — valorisation matière',
    signature: /recycl|material recovery|valorisation matiere/i,
    alias: /recycl|valorisation matiere|matiere/i
  },
  {
    cle: 'Incinération', libelle: 'Incinération avec valorisation énergétique',
    emoji: '🔥', classeBadge: 'filiere-incineration',
    facteurParKg: 0.410,
    libelleSecours: 'Incinération avec valorisation énergétique',
    signature: /incinerat|energy recovery|combustion/i,
    alias: /incinerat|brulage|combustion|valorisation energetique/i
  },
  {
    cle: 'Enfouissement', libelle: 'Enfouissement / Décharge',
    emoji: '🗑️', classeBadge: 'filiere-enfouissement',
    facteurParKg: 0.580,
    libelleSecours: 'Enfouissement en décharge sanitaire',
    signature: /landfill|enfouiss|decharge|disposal/i,
    alias: /enfouiss|decharge|landfill|mise en decharge/i
  }
];

/** Repli monétaire, en kgCO₂e par unité de devise. */
export const REPLI_MONETAIRE = 0.150;

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionFiliere(filiere: FiliereTraitement | string): DefinitionFiliere | null {
  return PAR_CLE.get(filiere as FiliereTraitement) ?? null;
}

export function emojiFiliere(filiere: FiliereTraitement | string): string {
  return definitionFiliere(filiere)?.emoji ?? '•';
}

export function classeBadgeFiliere(filiere: FiliereTraitement | string): string {
  return definitionFiliere(filiere)?.classeBadge ?? 'filiere-neutre';
}

export function libelleFiliere(filiere: FiliereTraitement | string): string {
  return definitionFiliere(filiere)?.libelle ?? String(filiere ?? '');
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
 * Reconnaît la filière décrite par une cellule ou une saisie libre.
 *
 * <p>Les déchets dangereux sont éprouvés en premier : « recyclage d'huiles
 * usagées » relève du traitement spécialisé, dont le facteur est quinze fois
 * supérieur à celui du recyclage matière.</p>
 */
export function reconnaitreFiliere(
  texte: string,
  defaut: FiliereTraitement | null = null
): FiliereTraitement | null {

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
  if (/masse|filiere|physique|tonne|kg/.test(normalise)) return 'Masse';
  return defaut;
}

/** Forme canonique d'une unité. */
export function normaliserUnite(brute: string): string {
  const unite = normaliserTexte(brute);
  if (/^(t|tonne|tonnes)$/.test(unite)) return 'Tonnes';
  if (/^kg$/.test(unite)) return 'kg';
  if (/^(tnd|dt)$/.test(unite)) return 'TND';
  if (/^eur$/.test(unite)) return 'EUR';
  return brute.trim();
}

/**
 * Ramène une masse en kilogrammes.
 *
 * <p>Les facteurs de filière s'expriment au kilogramme : confondre tonnes et
 * kilogrammes fausserait d'un facteur mille.</p>
 */
export function enKilogrammes(masse: number | null, unite: string): number | null {
  if (masse === null || !Number.isFinite(masse)) return null;

  switch (normaliserUnite(unite)) {
    case 'Tonnes': return masse * 1000;
    case 'kg': return masse;
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

export interface CritereFacteurFiliere {
  filiere: FiliereTraitement;
  monetaire?: boolean;
  devise?: string | null;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursFiliere(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFiliere
): FacteurDetaille[] {

  const definition = definitionFiliere(critere.filiere);
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
export function retenirFacteurFiliere(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFiliere
): FacteurRetenu {

  const retenu = classerFacteursFiliere(facteurs, critere)[0];
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
      libelle: 'Approche monétaire — fin de vie',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  const definition = definitionFiliere(critere.filiere);
  if (definition) {
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

  return {
    origine: 'Aucun', valeur: null, unite: '', libelle: '',
    reference: '', baseAppliquee: '', id: null
  };
}

export interface DonneesCalcul {
  typeSaisie: TypeSaisie;
  masse: number | null;
  unite: string;
  montant: number | null;
}

/**
 * Grandeur effectivement valorisée.
 *
 * <p>Une masse est ramenée au kilogramme, unité des facteurs de filière ; un
 * montant est pris tel quel.</p>
 */
export function grandeurValorisee(source: DonneesCalcul): number | null {
  if (source.typeSaisie === 'Monétaire') {
    return source.montant !== null && Number.isFinite(source.montant) ? source.montant : null;
  }
  return enKilogrammes(source.masse, source.unite);
}

/** Unité de la grandeur valorisée. */
export function uniteValorisee(typeSaisie: TypeSaisie, unite: string): string {
  return typeSaisie === 'Monétaire' ? (normaliserUnite(unite) || 'TND') : 'kg';
}

/** Émissions : grandeur valorisée × facteur. */
export function calculerEmissionFinDeVie(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}
