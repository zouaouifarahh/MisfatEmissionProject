/**
 * Nomenclature complète du bilan carbone, tous scopes confondus.
 *
 * <p>Elle sert de référence unique au panneau de configuration du reporting et
 * au rapprochement des agrégats : le serveur renvoie les intitulés du classeur
 * GHG (« Category 4: Upstream transportation »), les écrans de saisie leurs
 * identifiants techniques (« transport-amont ») et le tableau de bord ses
 * libellés français. Les trois formes désignent le même poste : les alias
 * ci-dessous les rassemblent, sans quoi un même poste compterait deux fois.</p>
 *
 * <p>Les postes sans écran de saisie — procédés industriels, vapeur, réseaux
 * de chaleur — figurent malgré tout à la nomenclature. Le GHG Protocol les
 * attend : les taire ferait passer une absence de collecte pour une émission
 * nulle. Ils ressortent à zéro et le panneau les laisse décochés.</p>
 */

export type CodeScope = 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';

export interface PosteNomenclature {
  /** Identifiant technique ; celui de l'écran de saisie quand il en existe un. */
  id: string;
  libelle: string;
  icone: string;
  /** Vrai lorsqu'un écran de saisie alimente le poste. */
  collecte: boolean;
  /** Numéro de catégorie GHG Protocol, pour le seul Scope 3. */
  numeroGhg?: number;
  /** Autres écritures du même poste, rencontrées en base ou à l'écran. */
  alias: string[];
}

export interface ScopeNomenclature {
  /** Identifiant court, aligné sur celui du menu latéral. */
  id: 'scope1' | 'scope2' | 'scope3';
  code: CodeScope;
  nom: string;
  soustitre: string;
  couleur: string;
  postes: PosteNomenclature[];
}

export const NOMENCLATURE_SCOPES: ScopeNomenclature[] = [
  {
    id: 'scope1',
    code: 'SCOPE_1',
    nom: 'Scope 1',
    soustitre: 'Émissions directes',
    couleur: '#16a34a',
    postes: [
      {
        id: 'combustion-etablissements',
        libelle: 'Combustibles fossiles — installations fixes',
        icone: '🏭',
        collecte: true,
        alias: ['Combustion dans les usines', 'Combustion dans les établissements',
                'Stationary combustion', 'Combustibles fossiles']
      },
      {
        id: 'combustion-vehicules',
        libelle: 'Flotte de véhicules',
        icone: '🚗',
        collecte: true,
        alias: ['Combustion des véhicules', 'Mobile combustion', 'Parc auto']
      },
      {
        id: 'emissions-refrigerants',
        libelle: 'Émissions fugitives — gaz réfrigérants',
        icone: '❄️',
        collecte: true,
        alias: ['Émissions de réfrigérants', 'Fugitive emissions', 'Réfrigérants']
      },
      {
        id: 'process-industriels',
        libelle: 'Procédés industriels',
        icone: '⚗️',
        collecte: false,
        alias: ['Process industriels', 'Industrial processes', 'Procédés']
      }
    ]
  },
  {
    id: 'scope2',
    code: 'SCOPE_2',
    nom: 'Scope 2',
    soustitre: 'Énergie indirecte',
    couleur: '#ea580c',
    postes: [
      {
        id: 'electricite-achetee',
        libelle: 'Électricité réseau achetée',
        icone: '💡',
        collecte: true,
        alias: ['Électricité achetée', 'Purchased electricity', 'Electricity', 'STEG']
      },
      {
        id: 'vapeur-achetee',
        libelle: 'Vapeur achetée',
        icone: '♨️',
        collecte: false,
        alias: ['Vapeur', 'Purchased steam', 'Steam']
      },
      {
        id: 'chaleur-froid-urbain',
        libelle: 'Chaleur et froid urbains',
        icone: '🌡️',
        collecte: false,
        alias: ['Chaleur urbaine', 'Froid urbain', 'District heating', 'District cooling']
      }
    ]
  },
  {
    id: 'scope3',
    code: 'SCOPE_3',
    nom: 'Scope 3',
    soustitre: 'Chaîne de valeur — 15 catégories GHG Protocol',
    couleur: '#0284c7',
    postes: [
      { id: 'biens-services', libelle: 'Biens et services achetés', icone: '📦', collecte: true, numeroGhg: 1,
        alias: ['Purchased goods and services', 'Achats'] },
      { id: 'biens-equipement', libelle: "Biens d'équipement", icone: '🏗️', collecte: true, numeroGhg: 2,
        alias: ['Capital goods', 'Immobilisations'] },
      { id: 'energie', libelle: "Activités liées à l'énergie", icone: '⛽', collecte: true, numeroGhg: 3,
        alias: ['Fuel and energy related activities', 'Amont énergétique', 'activites-energie'] },
      { id: 'transport-amont', libelle: 'Transport et distribution en amont', icone: '🚚', collecte: true, numeroGhg: 4,
        alias: ['Transport en amont', 'Upstream transportation and distribution', 'Fret entrant'] },
      { id: 'dechets', libelle: "Déchets générés par l'activité", icone: '🗑️', collecte: true, numeroGhg: 5,
        alias: ['Déchets', 'Waste generated in operations'] },
      { id: 'voyages-affaires', libelle: "Voyages d'affaires", icone: '✈️', collecte: true, numeroGhg: 6,
        alias: ['Business travel', 'Missions'] },
      { id: 'deplacements-employes', libelle: 'Déplacements domicile — travail', icone: '🚌', collecte: true, numeroGhg: 7,
        alias: ['Déplacements des employés', 'Employee commuting'] },
      { id: 'actifs-loues-amont', libelle: 'Actifs loués en amont', icone: '🏢', collecte: true, numeroGhg: 8,
        alias: ['Upstream leased assets'] },
      { id: 'transport-aval', libelle: 'Transport et distribution en aval', icone: '🚛', collecte: true, numeroGhg: 9,
        alias: ['Transport en aval', 'Downstream transportation and distribution', 'Fret sortant'] },
      { id: 'transformation-produits', libelle: 'Transformation des produits vendus', icone: '🏭', collecte: true, numeroGhg: 10,
        alias: ['Transformation des produits', 'Processing of sold products'] },
      { id: 'utilisation-produits', libelle: 'Utilisation des produits vendus', icone: '🛒', collecte: true, numeroGhg: 11,
        alias: ['Utilisation des produits', 'Use of sold products'] },
      { id: 'fin-de-vie-produits', libelle: 'Fin de vie des produits vendus', icone: '♻️', collecte: true, numeroGhg: 12,
        alias: ['Fin de vie des produits', 'End-of-life treatment of sold products'] },
      { id: 'actifs-loues-aval', libelle: 'Actifs loués en aval', icone: '🏬', collecte: true, numeroGhg: 13,
        alias: ['Downstream leased assets'] },
      { id: 'franchises', libelle: 'Franchises', icone: '🤝', collecte: true, numeroGhg: 14,
        alias: ['Franchises'] },
      { id: 'investissements', libelle: 'Investissements', icone: '💰', collecte: true, numeroGhg: 15,
        alias: ['Investments', 'Portefeuille participations'] }
    ]
  }
];

/** Tous les postes, tous scopes confondus, dans l'ordre de la nomenclature. */
export const TOUS_LES_POSTES: { scope: ScopeNomenclature; poste: PosteNomenclature }[] =
  NOMENCLATURE_SCOPES.flatMap(scope => scope.postes.map(poste => ({ scope, poste })));

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
export function clefComparable(valeur: string | null | undefined): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

/** Index des clés comparables vers l'identifiant de poste, construit une fois. */
const INDEX_POSTES: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const { poste } of TOUS_LES_POSTES) {
    for (const forme of [poste.id, poste.libelle, ...poste.alias]) {
      const clef = clefComparable(forme);
      if (clef && !index.has(clef)) index.set(clef, poste.id);
    }
  }
  return index;
})();

/** Postes du Scope 3 rangés par numéro GHG, pour les intitulés « Category N ». */
const PAR_NUMERO_GHG: Map<number, string> = new Map(
  NOMENCLATURE_SCOPES
    .find(s => s.id === 'scope3')!
    .postes.map(poste => [poste.numeroGhg!, poste.id] as [number, string])
);

/**
 * Identifiant de poste correspondant à un intitulé quelconque.
 *
 * <p>Trois écritures cohabitent en base : l'identifiant d'écran, le libellé
 * français du tableau de bord et l'intitulé GHG anglais numéroté. Le numéro de
 * catégorie prime : c'est le seul repère univoque entre les nomenclatures.</p>
 *
 * @returns l'identifiant du poste, ou `null` si l'intitulé reste inconnu.
 */
export function posteDepuisIntitule(intitule: string | null | undefined): string | null {
  const brut = String(intitule ?? '').trim();
  if (!brut) return null;

  const numero = /^category\s*(\d{1,2})\b/i.exec(brut);
  if (numero) {
    const trouve = PAR_NUMERO_GHG.get(Number(numero[1]));
    if (trouve) return trouve;
  }

  return INDEX_POSTES.get(clefComparable(brut)) ?? null;
}

/** Poste de la nomenclature portant un identifiant donné. */
export function posteParId(id: string): PosteNomenclature | null {
  return TOUS_LES_POSTES.find(entree => entree.poste.id === id)?.poste ?? null;
}

/** Scope auquel un poste se rattache. */
export function scopeDuPoste(id: string): CodeScope | null {
  return TOUS_LES_POSTES.find(entree => entree.poste.id === id)?.scope.code ?? null;
}
