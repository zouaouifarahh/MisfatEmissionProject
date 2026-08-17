import { FacteurDetaille } from '../../services/referential.service';

/**
 * Socle métier des franchises : approches de valorisation, facteurs de secours
 * et formules.
 *
 * <p>Fonctions pures, sans dépendance Angular : le composant, l'import et les
 * tests empruntent exactement le même chemin.</p>
 */

/** Approche retenue pour valoriser un réseau franchisé. */
export type TypeApproche = 'Énergétique' | 'Par site' | 'Monétaire';

export const APPROCHES: TypeApproche[] = ['Énergétique', 'Par site', 'Monétaire'];

export interface DefinitionApproche {
  cle: TypeApproche;
  libelle: string;
  emoji: string;
  classeBadge: string;
  /** Unité de la grandeur saisie. */
  unite: string;
  alias: RegExp;
}

export const DEFINITIONS: DefinitionApproche[] = [
  {
    cle: 'Énergétique', libelle: 'Saisie énergétique (consommation réelle)',
    emoji: '⚡', classeBadge: 'approche-energetique', unite: 'kWh',
    alias: /energetique|energie|kwh|consommation reelle|electricite/i
  },
  {
    cle: 'Monétaire', libelle: 'Approche monétaire (redevances, CA)',
    emoji: '💰', classeBadge: 'approche-monetaire', unite: 'TND',
    alias: /monetaire|redevance|ca|chiffre d affaires|montant/i
  },
  {
    cle: 'Par site', libelle: 'Saisie par site moyen',
    emoji: '🏬', classeBadge: 'approche-site', unite: 'sites',
    alias: /site|point de vente|centre auto|magasin|nombre/i
  }
];

/**
 * Émissions moyennes d'un site franchisé, en kgCO₂e par site et par an.
 *
 * <p>Ordre de grandeur d'un centre auto : il vaut mieux une estimation par
 * ratio qu'un réseau absent du bilan, à condition qu'elle soit signalée.</p>
 */
export const EMISSIONS_PAR_SITE_AN = 15000;

/** Repli énergétique, en kgCO₂e par kWh consommé par le réseau. */
export const REPLI_ENERGETIQUE = 0.420;

/** Repli monétaire sur les redevances, en kgCO₂e par unité de devise. */
export const REPLI_MONETAIRE = 0.210;

const PAR_CLE = new Map(DEFINITIONS.map(d => [d.cle, d]));

export function definitionApproche(approche: TypeApproche | string): DefinitionApproche | null {
  return PAR_CLE.get(approche as TypeApproche) ?? null;
}

export function emojiApproche(approche: TypeApproche | string): string {
  return definitionApproche(approche)?.emoji ?? '•';
}

export function classeBadgeApproche(approche: TypeApproche | string): string {
  return definitionApproche(approche)?.classeBadge ?? 'approche-neutre';
}

export function libelleApproche(approche: TypeApproche | string): string {
  return definitionApproche(approche)?.libelle ?? String(approche ?? '');
}

export function uniteApproche(approche: TypeApproche | string): string {
  return definitionApproche(approche)?.unite ?? '';
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
 * Reconnaît l'approche décrite par une cellule ou une saisie libre.
 *
 * <p>« Énergétique » et « Monétaire » sont éprouvées avant « Par site » :
 * « consommation des sites » désigne une saisie énergétique, non un comptage
 * d'établissements.</p>
 */
export function reconnaitreApproche(texte: string, defaut: TypeApproche = 'Par site'): TypeApproche {
  const normalise = normaliserTexte(texte);
  if (!normalise) return defaut;

  for (const definition of DEFINITIONS) {
    if (definition.alias.test(normalise)) return definition.cle;
  }
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

export interface CritereFacteurFranchise {
  approche: TypeApproche;
  devise?: string | null;
}

/** Facteurs du référentiel compatibles, du mieux noté au moins bon. */
export function classerFacteursFranchise(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFranchise
): FacteurDetaille[] {

  if (!Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.approche === 'Monétaire' ? 'MONETAIRE' : 'PHYSIQUE';

  return facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu)
    .filter(f => critere.approche !== 'Énergétique' || normaliserTexte(f.unit) === 'kwh')
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
export function retenirFacteurFranchise(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurFranchise
): FacteurRetenu {

  const retenu = classerFacteursFranchise(facteurs, critere)[0];
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

  switch (critere.approche) {
    case 'Monétaire':
      return {
        origine: 'ADEME', valeur: REPLI_MONETAIRE,
        unite: critere.devise?.trim().toUpperCase() || 'TND',
        libelle: 'Redevances de franchise — repli monétaire',
        reference: '', baseAppliquee: 'ADEME (repli)', id: null
      };

    case 'Énergétique':
      return {
        origine: 'ADEME', valeur: REPLI_ENERGETIQUE, unite: 'kWh',
        libelle: 'Électricité du réseau franchisé',
        reference: '', baseAppliquee: 'ADEME (repli)', id: null
      };

    default:
      return {
        origine: 'ADEME', valeur: EMISSIONS_PAR_SITE_AN, unite: 'site·an',
        libelle: 'Centre auto / franchise standard — ratio par site',
        reference: '', baseAppliquee: 'ADEME (repli)', id: null
      };
  }
}

export interface DonneesCalcul {
  approche: TypeApproche;
  /** Nombre de sites, kilowattheures ou montant, selon l'approche. */
  quantite: number | null;
}

/** Grandeur effectivement valorisée : elle suit l'approche retenue. */
export function grandeurValorisee(source: DonneesCalcul): number | null {
  if (source.quantite === null || !Number.isFinite(source.quantite)) return null;
  return source.quantite;
}

/** Émissions : grandeur valorisée × facteur. */
export function calculerEmissionFranchise(
  grandeur: number | null,
  facteur: number | null
): number {

  if (grandeur === null || facteur === null) return 0;
  const emission = grandeur * facteur;
  return Number.isFinite(emission) ? emission : 0;
}
