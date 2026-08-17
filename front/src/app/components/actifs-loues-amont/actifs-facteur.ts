import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier des actifs loués en amont : types d'actifs, modes de saisie,
 * facteurs de secours et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

export type TypeActif = 'Bâtiment' | 'Véhicule Leasing' | 'Informatique' | 'Équipement Industriel';

export const TYPES_ACTIF: TypeActif[] =
  ['Bâtiment', 'Véhicule Leasing', 'Informatique', 'Équipement Industriel'];

/** Approche retenue pour valoriser l'actif. */
export type ModeSaisie = 'Consommation' | 'Surface' | 'Monétaire';

export const MODES_SAISIE: ModeSaisie[] = ['Consommation', 'Surface', 'Monétaire'];

/** Énergie desservant un bâtiment, quand la saisie porte sur des kWh. */
export type EnergieBatiment = 'Électricité' | 'Gaz';

/** Unités proposées, par mode de saisie. */
export const UNITES_PAR_MODE: Record<ModeSaisie, string[]> = {
  'Consommation': ['kWh', 'Litres', 'km'],
  'Surface': ['m²'],
  'Monétaire': ['TND', 'EUR']
};

/**
 * Intensité énergétique conventionnelle d'un bureau, en kWh par m² et par an.
 *
 * <p>Sert à convertir une surface louée en consommation, faute de relevé
 * dédié : un bailleur facture rarement l'électricité au preneur.</p>
 */
export const KWH_PAR_M2_AN = 120;

export interface DefinitionActif {
  cle: TypeActif;
  emoji: string;
  /** Classe de pastille, définie dans la feuille du composant. */
  classeBadge: string;
  /** Reconnaît le type dans le libellé d'un facteur du référentiel. */
  signature: RegExp;
  /** Reconnaît le type dans une cellule de classeur ou une saisie libre. */
  alias: RegExp;
}

export const ACTIFS: DefinitionActif[] = [
  {
    cle: 'Bâtiment', emoji: '🏢', classeBadge: 'actif-batiment',
    signature: /building|office|batiment|bureau|surface|electricit|gas|gaz/i,
    alias: /batiment|bureau|building|local|entrepot|immeuble|surface/i
  },
  {
    cle: 'Véhicule Leasing', emoji: '🚗', classeBadge: 'actif-vehicule',
    signature: /vehicle|car|leasing|voiture|fleet/i,
    alias: /vehicule|leasing|voiture|auto|flotte|camion/i
  },
  {
    cle: 'Informatique', emoji: '💻', classeBadge: 'actif-informatique',
    signature: /it|server|cloud|informatique|datacenter|hosting/i,
    alias: /informatique|serveur|cloud|it|ordinateur|datacenter|hebergement/i
  },
  {
    cle: 'Équipement Industriel', emoji: '⚙️', classeBadge: 'actif-equipement',
    signature: /equipment|machine|industrial|equipement|outillage/i,
    alias: /equipement|machine|industriel|outillage|engin|materiel/i
  }
];

const PAR_CLE = new Map(ACTIFS.map(a => [a.cle, a]));

export function definitionActif(type: TypeActif | string): DefinitionActif | null {
  return PAR_CLE.get(type as TypeActif) ?? null;
}

export function emojiActif(type: TypeActif | string): string {
  return definitionActif(type)?.emoji ?? '•';
}

export function classeBadgeActif(type: TypeActif | string): string {
  return definitionActif(type)?.classeBadge ?? 'actif-neutre';
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
export function reconnaitreTypeActif(texte: string, defaut: TypeActif | null = null): TypeActif | null {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of ACTIFS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
  return defaut;
}

/** Reconnaît le mode de saisie décrit par une cellule. */
export function reconnaitreModeSaisie(texte: string, defaut: ModeSaisie = 'Consommation'): ModeSaisie {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  if (/surface|m2|metre carre/.test(normalise)) return 'Surface';
  if (/monetaire|montant|cout|financier|depense/.test(normalise)) return 'Monétaire';
  if (/consommation|energie|physique|direct/.test(normalise)) return 'Consommation';
  return defaut;
}

/**
 * Forme comparable d'une unité.
 *
 * <p>Les exposants ne sont ni lettres ni chiffres : sans conversion préalable,
 * « m² » se réduirait à « m » et ne serait plus reconnu comme une surface.</p>
 */
function normaliserPourUnite(valeur: string): string {
  return normaliserTexte(String(valeur ?? '').replace(/²/g, '2').replace(/³/g, '3'));
}

/** Déduit le mode de saisie de la seule unité, quand le fichier est muet. */
export function modeDepuisUnite(unite: string, defaut: ModeSaisie = 'Consommation'): ModeSaisie {
  const normalise = normaliserPourUnite(unite);
  if (/^m ?2$/.test(normalise)) return 'Surface';
  if (/^(tnd|dt|eur|usd|mad)$/.test(normalise)) return 'Monétaire';
  if (/^(kwh|litres?|l|km)$/.test(normalise)) return 'Consommation';
  return defaut;
}

/** Forme canonique d'une unité. */
export function normaliserUnite(brute: string): string {
  const unite = normaliserPourUnite(brute);
  if (/^kwh$/.test(unite)) return 'kWh';
  if (/^(l|litre|litres)$/.test(unite)) return 'Litres';
  if (/^km$/.test(unite)) return 'km';
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

const AUCUN: FacteurRetenu = {
  origine: 'Aucun', valeur: null, unite: '', libelle: '',
  reference: '', baseAppliquee: '', id: null
};

/**
 * Facteurs de secours, appliqués tant que le référentiel MS SQL ne documente
 * pas la catégorie 8.
 *
 * <p>Ils ne remplacent jamais un facteur documenté : ils évitent seulement
 * qu'un référentiel incomplet réduise à zéro des locations bien réelles.
 * Toute ligne ainsi valorisée porte l'origine « ADEME ».</p>
 */
interface Repli {
  type: TypeActif;
  unite: string;
  energie?: EnergieBatiment;
  valeur: number;
  libelle: string;
}

const REPLIS: Repli[] = [
  { type: 'Bâtiment', unite: 'kWh', energie: 'Électricité', valeur: 0.420,
    libelle: 'Électricité bâtiment loué' },
  { type: 'Bâtiment', unite: 'kWh', energie: 'Gaz', valeur: 0.227,
    libelle: 'Gaz bâtiment loué' },
  // Une surface se valorise par sa consommation implicite : le facteur porte
  // sur les kWh estimés, jamais sur les mètres carrés eux-mêmes.
  { type: 'Bâtiment', unite: 'm²', energie: 'Électricité', valeur: 0.420,
    libelle: `Surface bureau — ${KWH_PAR_M2_AN} kWh/m²/an` },
  { type: 'Bâtiment', unite: 'm²', energie: 'Gaz', valeur: 0.227,
    libelle: `Surface bureau, gaz — ${KWH_PAR_M2_AN} kWh/m²/an` },
  { type: 'Véhicule Leasing', unite: 'km', valeur: 0.192,
    libelle: 'Véhicule en leasing, essence ou diesel' },
  { type: 'Informatique', unite: 'TND', valeur: 0.250, libelle: 'Informatique / serveur cloud' },
  { type: 'Informatique', unite: 'EUR', valeur: 0.250, libelle: 'Informatique / serveur cloud' },
  { type: 'Équipement Industriel', unite: 'TND', valeur: 0.310, libelle: 'Machine ou équipement loué' },
  { type: 'Équipement Industriel', unite: 'EUR', valeur: 0.310, libelle: 'Machine ou équipement loué' }
];

/** Émissions annuelles par mètre carré de bureau, à titre indicatif. */
export const KGCO2E_PAR_M2_AN = KWH_PAR_M2_AN * 0.420;

/**
 * Repli monétaire général, en kgCO₂e par unité de devise.
 *
 * <p>Appliqué à toute dépense de location qu'aucun repli spécifique ne couvre —
 * un bâtiment ou un véhicule facturés au forfait, par exemple. Il vaut mieux un
 * ordre de grandeur signalé qu'une dépense comptée pour rien.</p>
 */
export const REPLI_MONETAIRE_GENERAL = 0.250;

/** Devises reconnues pour la valorisation monétaire. */
const DEVISES = /^(tnd|dt|eur|usd|mad)$/;

export interface CritereFacteur {
  type: TypeActif;
  unite: string;
  energie?: EnergieBatiment;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursActif(
  facteurs: FacteurDetaille[],
  critere: CritereFacteur
): FacteurDetaille[] {

  const definition = definitionActif(critere.type);
  if (!definition || !Array.isArray(facteurs) || !facteurs.length) return [];

  // Une surface se valorise en kWh : le facteur recherché porte l'énergie.
  const uniteNormalisee = normaliserUnite(critere.unite);
  const uniteCible = normaliserTexte(uniteNormalisee === 'm²' ? 'kWh' : uniteNormalisee);
  const motifEnergie = critere.energie ? normaliserTexte(critere.energie) : '';

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() !== 'MONETAIRE'
              || /^(tnd|eur|usd|mad)$/.test(normaliserTexte(critere.unite)))
    .filter(f => !uniteCible || normaliserTexte(f.unit) === uniteCible)
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
export function retenirFacteurActif(
  facteurs: FacteurDetaille[],
  critere: CritereFacteur
): FacteurRetenu {

  const retenu = classerFacteursActif(facteurs, critere)[0];
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

  const unite = normaliserUnite(critere.unite);
  const energie = critere.energie ?? 'Électricité';
  const repli = REPLIS.find(r => r.type === critere.type
                              && r.unite === unite
                              && (!r.energie || r.energie === energie));

  if (repli) {
    return {
      origine: 'ADEME',
      valeur: repli.valeur,
      // Une surface est convertie en kWh avant valorisation.
      unite: unite === 'm²' ? 'kWh' : unite,
      libelle: repli.libelle,
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  // Repli monétaire général : toute dépense de location reste valorisable.
  if (DEVISES.test(normaliserTexte(unite))) {
    return {
      origine: 'ADEME',
      valeur: REPLI_MONETAIRE_GENERAL,
      unite,
      libelle: 'Dépense de location — repli monétaire général',
      reference: '',
      baseAppliquee: 'ADEME (repli)',
      id: null
    };
  }

  return { ...AUCUN };
}

export interface DonneesCalcul {
  mode: ModeSaisie;
  quantite: number | null;
  /** Part réellement louée ou occupée, en pourcentage. */
  ratioOccupation: number | null;
}

/**
 * Quantité effectivement imputable à l'entreprise.
 *
 * <p>Une surface est d'abord convertie en consommation annuelle ; dans tous les
 * cas, seule la part louée ou occupée est retenue.</p>
 */
export function quantiteAjustee(source: DonneesCalcul): number | null {
  if (source.quantite === null || !Number.isFinite(source.quantite)) return null;

  const ratio = source.ratioOccupation === null || !Number.isFinite(source.ratioOccupation)
    ? 100
    : source.ratioOccupation;

  const base = source.mode === 'Surface'
    ? source.quantite * KWH_PAR_M2_AN
    : source.quantite;

  const ajustee = base * (ratio / 100);
  return Number.isFinite(ajustee) ? ajustee : null;
}

/** Unité de la quantité ajustée : une surface devient des kWh. */
export function uniteAjustee(mode: ModeSaisie, unite: string): string {
  return mode === 'Surface' ? 'kWh' : normaliserUnite(unite);
}

/** Émissions : quantité ajustée × facteur. */
export function calculerEmissionActif(quantite: number | null, facteur: number | null): number {
  if (quantite === null || facteur === null) return 0;
  const emission = quantite * facteur;
  return Number.isFinite(emission) ? emission : 0;
}

/** Ratio d'occupation retenu à défaut : l'actif est imputé en totalité. */
export const RATIO_OCCUPATION_DEFAUT = 100;

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site principal';
