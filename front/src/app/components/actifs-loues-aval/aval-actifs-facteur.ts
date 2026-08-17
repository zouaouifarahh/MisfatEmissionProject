import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier des actifs loués en aval : types d'actifs, facteurs de secours
 * et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type TypeActifAval =
  | 'Entrepôt / Logistique'
  | 'Bâtiment Commercial'
  | 'Véhicules / Équipements';

export const TYPES_ACTIF: TypeActifAval[] =
  ['Entrepôt / Logistique', 'Bâtiment Commercial', 'Véhicules / Équipements'];

/** Approche retenue pour valoriser l'actif loué. */
export type ModeSaisie = 'Consommation' | 'Surface' | 'Monétaire';

export const MODES_SAISIE: ModeSaisie[] = ['Consommation', 'Surface', 'Monétaire'];

/** Énergie desservant l'actif, quand la saisie porte sur des kWh. */
export type EnergieActif = 'Électricité' | 'Gaz';

export const UNITES_PAR_MODE: Record<ModeSaisie, string[]> = {
  'Consommation': ['kWh'],
  'Surface': ['m²'],
  'Monétaire': ['TND', 'EUR']
};

/**
 * Intensité énergétique conventionnelle, en kWh par m² et par an.
 *
 * <p>Convertit une surface louée en consommation, faute de relevé dédié : un
 * bailleur ne dispose pas toujours des compteurs de son locataire.</p>
 */
export const KWH_PAR_M2_AN = 120;

export interface DefinitionActifAval {
  cle: TypeActifAval;
  emoji: string;
  classeBadge: string;
  signature: RegExp;
  alias: RegExp;
}

export const DEFINITIONS: DefinitionActifAval[] = [
  {
    cle: 'Entrepôt / Logistique', emoji: '🏢', classeBadge: 'aval-entrepot',
    signature: /warehouse|entrepot|logistic/i,
    alias: /entrepot|logistique|warehouse|stockage|plateforme/i
  },
  {
    cle: 'Véhicules / Équipements', emoji: '🚛', classeBadge: 'aval-vehicule',
    signature: /vehicle|equipment|fleet|vehicule|equipement/i,
    alias: /vehicule|equipement|camion|engin|flotte|materiel/i
  },
  {
    cle: 'Bâtiment Commercial', emoji: '🏬', classeBadge: 'aval-batiment',
    signature: /building|office|commercial|batiment|bureau/i,
    alias: /batiment|bureau|commercial|local|immeuble|surface/i
  }
];

/** Facteurs de repli, en kgCO₂e par kWh. */
export const REPLI_ELECTRICITE = 0.420;
export const REPLI_GAZ = 0.227;
/** Repli monétaire sur les revenus de location, en kgCO₂e par unité de devise. */
export const REPLI_MONETAIRE = 0.180;

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionActifAval(type: TypeActifAval | string): DefinitionActifAval | null {
  return PAR_CLE.get(type as TypeActifAval) ?? null;
}

export function emojiActifAval(type: TypeActifAval | string): string {
  return definitionActifAval(type)?.emoji ?? '•';
}

export function classeBadgeActifAval(type: TypeActifAval | string): string {
  return definitionActifAval(type)?.classeBadge ?? 'aval-neutre';
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

/** Reconnaît le type d'actif décrit par une cellule ou une saisie libre. */
export function reconnaitreTypeActif(
  texte: string,
  defaut: TypeActifAval | null = null
): TypeActifAval | null {

  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of DEFINITIONS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return defaut;
}

/** Reconnaît le mode de saisie décrit par une cellule. */
export function reconnaitreModeSaisie(texte: string, defaut: ModeSaisie = 'Consommation'): ModeSaisie {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  if (/surface|m2|metre carre/.test(normalise)) return 'Surface';
  if (/monetaire|montant|revenu|loyer|cout/.test(normalise)) return 'Monétaire';
  if (/consommation|kwh|energie/.test(normalise)) return 'Consommation';
  return defaut;
}

/**
 * Forme comparable d'une unité.
 *
 * <p>Les exposants ne sont ni lettres ni chiffres : sans conversion préalable,
 * « m² » se réduirait à « m » et ne serait plus reconnu comme une surface.</p>
 */
function normaliserPourUnite(valeur: string): string {
  return normaliserTexte(String(valeur ?? '').replace(/²/g, '2'));
}

/** Déduit le mode de saisie de la seule unité, quand le fichier est muet. */
export function modeDepuisUnite(unite: string, defaut: ModeSaisie = 'Consommation'): ModeSaisie {
  const normalise = normaliserPourUnite(unite);
  if (/^m ?2$/.test(normalise)) return 'Surface';
  if (/^(tnd|dt|eur|usd|mad)$/.test(normalise)) return 'Monétaire';
  return defaut;
}

/** Forme canonique d'une unité. */
export function normaliserUnite(brute: string): string {
  const unite = normaliserPourUnite(brute);
  if (/^kwh$/.test(unite)) return 'kWh';
  if (/^m ?2$/.test(unite)) return 'm²';
  if (/^(tnd|dt)$/.test(unite)) return 'TND';
  if (/^eur$/.test(unite)) return 'EUR';
  return brute.trim();
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

export interface CritereFacteurAval {
  type: TypeActifAval;
  mode: ModeSaisie;
  energie?: EnergieActif;
  devise?: string | null;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursAval(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurAval
): FacteurDetaille[] {

  const definition = definitionActifAval(critere.type);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  const monetaire = critere.mode === 'Monétaire';
  const typeAttendu = monetaire ? 'MONETAIRE' : 'PHYSIQUE';
  const motifEnergie = critere.energie ? normaliserTexte(critere.energie) : '';

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu)
    // Une surface se valorise en kWh : le facteur recherché porte l'énergie.
    .filter(f => monetaire || normaliserTexte(f.unit) === 'kwh')
    .filter(f => definition.signature.test(f.typeName ?? ''))
    .map(facteur => {
      let note = 100;
      if (motifEnergie && normaliserTexte(facteur.typeName).includes(motifEnergie)) note += 40;
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
export function retenirFacteurAval(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurAval
): FacteurRetenu {

  const retenu = classerFacteursAval(facteurs, critere)[0];
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

  if (critere.mode === 'Monétaire') {
    return {
      origine: 'ADEME',
      valeur: REPLI_MONETAIRE,
      unite: critere.devise?.trim().toUpperCase() || 'TND',
      libelle: 'Revenus de location — repli monétaire',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  const gaz = critere.energie === 'Gaz';
  return {
    origine: 'ADEME',
    valeur: gaz ? REPLI_GAZ : REPLI_ELECTRICITE,
    unite: 'kWh',
    libelle: gaz
      ? 'Chauffage au gaz — bâtiment loué'
      : 'Électricité — bâtiment loué',
    reference: '',
    baseAppliquee: 'ADEME (repli)',
    id: null
  };
}

export interface DonneesCalcul {
  mode: ModeSaisie;
  quantite: number | null;
}

/**
 * Consommation imputable à l'actif.
 *
 * <p>Une surface est convertie en consommation annuelle ; une consommation et
 * un montant sont pris tels quels.</p>
 */
export function consommationValorisee(source: DonneesCalcul): number | null {
  if (source.quantite === null || !Number.isFinite(source.quantite)) return null;

  const valeur = source.mode === 'Surface'
    ? source.quantite * KWH_PAR_M2_AN
    : source.quantite;

  return Number.isFinite(valeur) ? valeur : null;
}

/** Unité de la grandeur valorisée : une surface devient des kWh. */
export function uniteValorisee(mode: ModeSaisie, unite: string): string {
  if (mode === 'Monétaire') return normaliserUnite(unite) || 'TND';
  return 'kWh';
}

/** Émissions : consommation valorisée × facteur. */
export function calculerEmissionAval(grandeur: number | null, facteur: number | null): number {
  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}
