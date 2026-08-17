import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier des investissements (CAPEX) : familles carbone, facteurs de
 * secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, le parseur et les
 * tests empruntent exactement le même chemin.</p>
 */

/** Famille carbone rattachée à une immobilisation. */
export type CategorieCarbone =
  | 'Alum / Aluminium'
  | 'Inox / Stainless Steel'
  | 'Air-Conditioning & Heating'
  | 'Metals / Metal Products'
  | 'Équipements Ind. (Fallback #N/A)';

/** Famille appliquée d'office aux lignes non appariées. */
export const CATEGORIE_REPLI: CategorieCarbone = 'Équipements Ind. (Fallback #N/A)';

export interface DefinitionCategorie {
  cle: CategorieCarbone;
  emoji: string;
  classeBadge: string;
  /** Facteur monétaire de repli, en kgCO₂e par dinar acquis. */
  repli: number;
  /** Motif éprouvé sur le libellé du référentiel MS SQL. */
  signature: RegExp;
  /** Motif éprouvé sur la cellule « Catégorie Carbone » du classeur. */
  alias: RegExp;
}

/**
 * Familles carbone, de la plus spécifique à la plus générique.
 *
 * <p>L'ordre commande la reconnaissance : « aluminium » et « inox » précèdent
 * « metals », faute de quoi une cellule « Aluminium metal products »
 * tomberait dans la famille générique et perdrait 10 % de son facteur.</p>
 */
export const DEFINITIONS: DefinitionCategorie[] = [
  {
    cle: 'Alum / Aluminium', emoji: '🧊', classeBadge: 'capex-alum', repli: 0.420,
    signature: /alum/i,
    alias: /alum/i
  },
  {
    cle: 'Inox / Stainless Steel', emoji: '🏢', classeBadge: 'capex-inox', repli: 0.390,
    signature: /inox|stainless/i,
    alias: /inox|stainless/i
  },
  {
    cle: 'Air-Conditioning & Heating', emoji: '❄️', classeBadge: 'capex-clim', repli: 0.310,
    signature: /air.?conditioning|heating|climatisation|chauffage|hvac/i,
    alias: /air.?conditioning|heating|climatisation|clim|chauffage|hvac|froid/i
  },
  {
    cle: 'Metals / Metal Products', emoji: '⚙️', classeBadge: 'capex-metal', repli: 0.380,
    signature: /metal|steel|acier|fonte/i,
    alias: /metal|metaux|steel|acier|fonte|fer/i
  },
  {
    cle: CATEGORIE_REPLI, emoji: '📦', classeBadge: 'capex-repli', repli: 0.250,
    signature: /equipment|machinery|equipement|industrial/i,
    alias: /equipement|equipment|industriel|machine|autre/i
  }
];

/** Familles proposées à la saisie manuelle. */
export const CATEGORIES: CategorieCarbone[] = DEFINITIONS.map(d => d.cle);

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionCategorie(categorie: CategorieCarbone | string): DefinitionCategorie | null {
  return PAR_CLE.get(categorie as CategorieCarbone) ?? null;
}

export function emojiCategorie(categorie: CategorieCarbone | string): string {
  return definitionCategorie(categorie)?.emoji ?? '•';
}

export function classeBadgeCategorie(categorie: CategorieCarbone | string): string {
  return definitionCategorie(categorie)?.classeBadge ?? 'capex-neutre';
}

/** Facteur de repli ADEME de la famille, en kgCO₂e par dinar. */
export function repliCategorie(categorie: CategorieCarbone | string): number {
  return definitionCategorie(categorie)?.repli ?? DEFINITIONS[DEFINITIONS.length - 1].repli;
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
 * Cellule inexploitable : erreur de formule, tiret de remplissage ou vide.
 *
 * <p>Les extractions d'immobilisations charrient les erreurs de RECHERCHEV du
 * fichier source ; elles ne disent rien de l'actif et ne doivent pas écarter
 * la ligne.</p>
 */
export function estCelluleAbsente(texte: unknown): boolean {
  const brut = String(texte ?? '').trim();
  if (!brut) return true;
  if (/^#\s*(n\s*\/?\s*a|na|value|valeur|ref|nom|name|div\/0)\s*!?$/i.test(brut)) return true;
  return /^(n\s*\/\s*a|na|nd|n\.d\.|-{1,3}|\.{1,3}|null|undefined)$/i.test(brut);
}

/**
 * Reconnaît la famille carbone décrite par une cellule.
 *
 * <p>Une cellule absente ou non reconnue n'est jamais une erreur : elle bascule
 * sur la famille de repli, dûment signalée.</p>
 */
export function reconnaitreCategorie(texte: string): CategorieCarbone {
  if (estCelluleAbsente(texte)) return CATEGORIE_REPLI;

  const normalise = normaliserTexte(texte);
  for (const definition of DEFINITIONS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return CATEGORIE_REPLI;
}

/** La ligne a-t-elle été appariée à une famille documentée ? */
export function categorieAppariee(categorie: CategorieCarbone | string): boolean {
  return categorie !== CATEGORIE_REPLI;
}

export type OrigineFacteur = 'MS SQL BDD' | 'ADEME Fallback';

export interface FacteurRetenu {
  origine: OrigineFacteur;
  valeur: number;
  unite: string;
  libelle: string;
  reference: string;
  baseAppliquee: string;
  id: number | null;
}

export interface CritereFacteurCapex {
  categorie: CategorieCarbone;
  devise?: string | null;
  /**
   * Référence carbone lue au classeur — « MS3C2ACW ».
   *
   * <p>Elle désigne un facteur précis, là où la catégorie n'oriente que vers une
   * famille : elle est donc essayée d'abord.</p>
   */
  referenceCarbone?: string;
  /** Code article de l'ERP, essayé après la référence carbone. */
  codeArticle?: string;
}

/** Facteurs monétaires du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursCapex(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurCapex
): FacteurDetaille[] {

  const definition = definitionCategorie(critere.categorie);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === 'MONETAIRE')
    .filter(f => definition.signature.test(f.typeName ?? ''))
    .map(facteur => {
      let note = 100;
      // Une acquisition libellée en dinars se valorise par un facteur en dinars.
      if (critere.devise && normaliserTexte(facteur.currency) === normaliserTexte(critere.devise)) {
        note += 30;
      }
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
export function retenirFacteurCapex(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurCapex
): FacteurRetenu {

  // Trois degrés de certitude, comme sur les autres écrans : la référence
  // carbone désigne le facteur, le code article le désigne parfois, la
  // catégorie ne fait que l'orienter. Une référence absente du référentiel
  // chargé n'est pas une erreur : elle appartient à une autre catégorie GHG, et
  // la recherche continue par famille.
  const parIdentifiant = (identifiant?: string): FacteurDetaille | undefined => {
    const cible = (identifiant ?? '').trim().toUpperCase();
    if (!cible || !Array.isArray(facteurs)) return undefined;
    return facteurs.find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
  };

  const exact = parIdentifiant(critere.referenceCarbone) ?? parIdentifiant(critere.codeArticle);
  if (exact) {
    return {
      origine: 'MS SQL BDD',
      valeur: exact.factorValue,
      unite: exact.currency?.trim() || exact.unit || 'TND',
      libelle: exact.typeName,
      reference: exact.referenceCode,
      baseAppliquee: exact.databaseSource || 'MS SQL BDD',
      id: exact.id
    };
  }

  const retenu = classerFacteursCapex(facteurs, critere)[0];
  if (retenu) {
    return {
      origine: 'MS SQL BDD',
      valeur: retenu.factorValue,
      unite: retenu.currency?.trim() || retenu.unit || 'TND',
      libelle: retenu.typeName,
      reference: retenu.referenceCode,
      baseAppliquee: retenu.databaseSource || 'MS SQL BDD',
      id: retenu.id
    };
  }

  return {
    origine: 'ADEME Fallback',
    valeur: repliCategorie(critere.categorie),
    unite: critere.devise?.trim().toUpperCase() || 'TND',
    libelle: `${critere.categorie} — repli monétaire`,
    reference: '',
    baseAppliquee: 'ADEME Fallback',
    id: null
  };
}

/** Montant lu dans un classeur, espaces et séparateurs décimaux compris. */
export function montantTolerant(brut: unknown): number | null {
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null;

  const texte = String(brut ?? '').trim();
  if (!texte || estCelluleAbsente(texte)) return null;

  // Les extractions comptables mêlent espaces fines, apostrophes et virgules.
  const nettoye = texte
    .replace(/[\s  ']/g, '')
    .replace(/(TND|DT|EUR)/gi, '')
    .replace(/,/g, '.');

  // Un séparateur de milliers en point ne laisse jamais trois décimales.
  const parts = nettoye.split('.');
  const recompose = parts.length > 2
    ? parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
    : nettoye;

  const valeur = Number(recompose);
  return Number.isFinite(valeur) ? valeur : null;
}

/** Émissions en kgCO₂e : montant acquis × facteur monétaire. */
export function calculerEmissionCapex(montant: number | null, facteur: number | null): number {
  if (montant === null || facteur === null) return 0;
  const emission = montant * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/** Conversion en tonnes, l'unité de restitution du bilan. */
export function enTonnes(kilogrammes: number): number {
  return Number.isFinite(kilogrammes) ? kilogrammes / 1000 : 0;
}

/** Part des lignes appariées à une famille documentée, en pourcentage. */
export function tauxCouverture(categories: Array<CategorieCarbone | string>): number {
  if (!Array.isArray(categories) || !categories.length) return 0;
  const appariees = categories.filter(categorieAppariee).length;
  return (appariees / categories.length) * 100;
}
