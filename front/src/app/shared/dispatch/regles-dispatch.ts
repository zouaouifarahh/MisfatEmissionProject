import { normaliserTexte } from './nombre-comptable';

/**
 * Ventilation des lignes comptables vers les écrans de saisie.
 *
 * <p>Fonctions pures, sans dépendance Angular : le parseur, le répartiteur et
 * les tests empruntent exactement le même chemin.</p>
 */

/** Écran de destination, tel qu'il est identifié dans le menu latéral. */
export type EcranDestination =
  | 'combustion-etablissements'
  | 'combustion-vehicules'
  | 'emissions-refrigerants'
  | 'electricite-achetee'
  | 'biens-services'
  | 'investissements'
  | 'transport-amont'
  | 'transport-aval'
  | 'voyages-affaires'
  | 'dechets';

export type CodeScope = 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';

export interface RegleDispatch {
  ecran: EcranDestination;
  scope: CodeScope;
  libelle: string;
  icone: string;
  /** Numéros de compte du plan comptable MISFAT rattachés d'office. */
  comptes: RegExp | null;
  /** Mots-clés éprouvés sur le libellé, la catégorie carbone et la référence. */
  motsCles: RegExp;
}

/**
 * Cellule sans information : erreur de formule, zéro de remplissage ou vide.
 *
 * <p>La balance générale MISFAT porte le nombre {@code 0} dans « Catégorie
 * Carbone » pour la majorité de ses postes : ce n'est pas une catégorie, c'est
 * une absence, et le libellé du compte doit alors faire foi.</p>
 */
export function estCategorieAbsente(valeur: unknown): boolean {
  const brut = String(valeur ?? '').trim();
  if (!brut) return true;
  if (brut === '0') return true;
  if (/^#\s*(n\s*\/?\s*a|na|value|valeur|ref|nom|div\/0)\s*!?$/i.test(brut)) return true;
  return /^(n\s*\/\s*a|na|nd|null|undefined|-{1,3})$/i.test(brut);
}

/**
 * Règles de ventilation, de la plus spécifique à la plus générale.
 *
 * <p>L'ordre commande le routage : « Frêt et transport sur ventes » doit
 * atteindre l'aval avant que la règle générique du transport ne le capte, et
 * les combustibles doivent primer sur les achats, dont ils portent le
 * vocabulaire.</p>
 */
export const REGLES: RegleDispatch[] = [
  {
    ecran: 'emissions-refrigerants', scope: 'SCOPE_1',
    libelle: 'Émissions de réfrigérants', icone: '❄️',
    comptes: null,
    motsCles: /\br(?:134a|404a|410a|407c|22)\b|fluide frigo|frigorigene|refrigerant|climatisation usine|recharge clim/
  },
  {
    ecran: 'combustion-vehicules', scope: 'SCOPE_1',
    libelle: 'Combustion des véhicules', icone: '🚗',
    comptes: null,
    motsCles: /carte carburant|gasoil vehicule|carburant vehicule|essence|flotte|parc roulant|vehicule carburant/
  },
  {
    ecran: 'combustion-etablissements', scope: 'SCOPE_1',
    libelle: 'Combustion dans les usines', icone: '🏭',
    // 602100/602120/602130 combustibles, 606100 combustibles non stockables.
    comptes: /^(602100|602120|602130|606100)/,
    motsCles: /gasoil usine|gaz naturel|fioul|chaudiere|combustible|matieres combust|carburant usine/
  },
  {
    ecran: 'electricite-achetee', scope: 'SCOPE_2',
    libelle: 'Électricité achetée', icone: '💡',
    comptes: /^(606500)/,
    motsCles: /\bsteg\b|electricite|electrique|\bkwh\b|energie electrique/
  },
  {
    ecran: 'transport-aval', scope: 'SCOPE_3',
    libelle: 'Transport en aval', icone: '🚛',
    // 624000 : frêt et transport sur ventes.
    comptes: /^(624000)/,
    motsCles: /sur ventes|expedition|livraison client|distribution aval|transport aval/
  },
  {
    ecran: 'transport-amont', scope: 'SCOPE_3',
    libelle: 'Transport en amont', icone: '🚚',
    // 601110 frais sur achats (MCM), 624100/624200 frais divers de transport.
    comptes: /^(601110|624100|624200)/,
    motsCles: /\bmcm\b|frais sur achats|freight|\bfret\b|transport|livraison|courier|trucking/
  },
  {
    ecran: 'investissements', scope: 'SCOPE_3',
    libelle: 'Investissements & CAPEX', icone: '💼',
    // Classe 2 du plan comptable : les immobilisations.
    comptes: /^2\d{5}/,
    motsCles: /immobilisation|\bmoule\b|equipement|climatiseur|acquisition|capex|outillage|agencement/
  },
  {
    ecran: 'voyages-affaires', scope: 'SCOPE_3',
    libelle: 'Voyages d\'affaires', icone: '✈️',
    comptes: /^(625000|625100|625600)/,
    motsCles: /voyages|deplacement|mission|reception|travel arrangement|hotel/
  },
  {
    ecran: 'dechets', scope: 'SCOPE_3',
    libelle: 'Déchets', icone: '🗑️',
    comptes: null,
    motsCles: /dechet|collecte des dechets|recyclage|enlevement ordures|waste/
  },
  {
    ecran: 'biens-services', scope: 'SCOPE_3',
    libelle: 'Biens et services achetés', icone: '📦',
    // 601/602/606 : achats de matières, fournitures et emballages.
    // 604/611/613/615/616/617/621/622/623/626/627 : services extérieurs.
    comptes: /^(601|602|604|606|611|613|615|616|617|621|622|623|626|627)/,
    motsCles: /achats matieres|achats mati|fourniture|non stock|\bpdr\b|emballage|produits d entretien|sous traitance|entretien|prestat|assurance|publicite|honoraire|documentation|services/
  }
];

export interface ExclusionComptable {
  comptes: RegExp;
  motif: string;
}

/**
 * Postes tenus hors du bilan carbone, à dessein.
 *
 * <p>Les distinguer des lignes non reconnues est capital : une charge de
 * personnel ou une dotation aux amortissements n'est pas un oubli de
 * ventilation. Compter les dotations reviendrait d'ailleurs à doubler la
 * catégorie 15, l'immobilisation ayant déjà été valorisée à son acquisition.</p>
 */
export const EXCLUSIONS: ExclusionComptable[] = [
  { comptes: /^603/, motif: 'Variation de stocks : ce n\'est pas un achat de l\'exercice.' },
  { comptes: /^609/, motif: 'Rabais, remises et ristournes obtenus : contrepartie d\'achats déjà comptés.' },
  { comptes: /^63/, motif: 'Charges diverses ordinaires : sans contrepartie physique.' },
  { comptes: /^64/, motif: 'Charges de personnel : hors périmètre des achats de biens et services.' },
  { comptes: /^65/, motif: 'Charges financières et pertes de change : sans contrepartie physique.' },
  { comptes: /^66/, motif: 'Impôts et taxes : hors périmètre du GHG Protocol.' },
  { comptes: /^68/, motif: 'Dotations aux amortissements et provisions : l\'immobilisation est déjà comptée en catégorie 15.' }
];

/** Motif d'exclusion d'un compte, ou chaîne vide s'il reste à ventiler. */
export function motifExclusion(compte: string): string {
  const propre = String(compte ?? '').trim();
  if (!propre) return '';
  return EXCLUSIONS.find(e => e.comptes.test(propre))?.motif ?? '';
}

const PAR_ECRAN = new Map(REGLES.map(r => [r.ecran, r]));

export function regleDe(ecran: EcranDestination | string): RegleDispatch | null {
  return PAR_ECRAN.get(ecran as EcranDestination) ?? null;
}

export function libelleEcran(ecran: EcranDestination | string): string {
  return regleDe(ecran)?.libelle ?? String(ecran ?? '');
}

export function iconeEcran(ecran: EcranDestination | string): string {
  return regleDe(ecran)?.icone ?? '•';
}

/** Ligne comptable soumise à la ventilation. */
export interface SourceDispatch {
  mainAccount?: unknown;
  nom?: unknown;
  categorieCarbone?: unknown;
  reference?: unknown;
  type?: unknown;
}

export interface ResultatDispatch {
  ecran: EcranDestination | null;
  scope: CodeScope | null;
  /** Ce qui a emporté la décision, restitué à l'utilisateur. */
  motif: string;
  /** Champ qui a déclenché la règle. */
  origine: 'compte' | 'categorie' | 'libelle' | 'document' | 'exclusion' | 'aucune';
  motCle: string;
  /** Poste écarté du bilan à dessein, et non faute de règle. */
  exclu: boolean;
}

const SANS_DESTINATION: ResultatDispatch = {
  ecran: null, scope: null, origine: 'aucune', motCle: '', exclu: false,
  motif: 'Aucune règle de ventilation ne reconnaît cette ligne.'
};

/**
 * Nature du document, déduite de ses colonnes.
 *
 * <p>Une base d'immobilisations ventile ses lignes par nature : un climatiseur
 * qui y figure est un actif acquis, non une consommation d'électricité. Le
 * document prime alors sur le vocabulaire du libellé.</p>
 */
export type NatureDocument = 'immobilisations' | 'comptable' | 'inconnue';

export interface ContexteDispatch {
  nature?: NatureDocument;
}

/** Extrait le fragment de texte qui a satisfait un motif. */
function fragmentReconnu(motif: RegExp, texte: string): string {
  const trouve = texte.match(motif);
  return trouve ? trouve[0] : '';
}

/**
 * Achemine une ligne comptable vers son écran de saisie.
 *
 * <p>Le numéro de compte prime : c'est la seule donnée que la comptabilité
 * garantit. À défaut, la catégorie carbone est éprouvée — mais seulement
 * lorsqu'elle porte une information, le {@code 0} de la balance n'en étant
 * pas une —, puis le libellé du compte.</p>
 */
export function dispatcherLigne(
  source: SourceDispatch,
  contexte: ContexteDispatch = {}
): ResultatDispatch {

  const compte = String(source.mainAccount ?? '').trim();
  const nom = normaliserTexte(source.nom);
  const reference = normaliserTexte(source.reference);
  const type = normaliserTexte(source.type);

  const categorieBrute = source.categorieCarbone;
  const categorie = estCategorieAbsente(categorieBrute) ? '' : normaliserTexte(categorieBrute);

  // Le document l'emporte sur toute autre indication : une base
  // d'immobilisations ne porte que des acquisitions d'actifs.
  if (contexte.nature === 'immobilisations') {
    const regle = PAR_ECRAN.get('investissements')!;
    return {
      ecran: regle.ecran, scope: regle.scope, origine: 'document',
      motCle: 'base d\'immobilisations', exclu: false,
      motif: 'Ligne d\'une base d\'immobilisations : rattachée aux investissements (CAPEX).'
    };
  }

  if (compte) {
    const exclusion = motifExclusion(compte);
    if (exclusion) {
      return {
        ecran: null, scope: null, origine: 'exclusion', motCle: compte, exclu: true,
        motif: `Compte ${compte} écarté du bilan : ${exclusion}`
      };
    }

    for (const regle of REGLES) {
      if (regle.comptes && regle.comptes.test(compte)) {
        return {
          ecran: regle.ecran, scope: regle.scope, origine: 'compte', motCle: compte, exclu: false,
          motif: `Compte ${compte} rattaché à « ${regle.libelle} ».`
        };
      }
    }
  }

  if (categorie) {
    for (const regle of REGLES) {
      const fragment = fragmentReconnu(regle.motsCles, categorie);
      if (fragment) {
        return {
          ecran: regle.ecran, scope: regle.scope, origine: 'categorie', motCle: fragment, exclu: false,
          motif: `Catégorie carbone « ${String(categorieBrute).trim()} » reconnue sur « ${fragment} ».`
        };
      }
    }
  }

  // Déduction de dernier ressort : le libellé du compte, sa référence, son type.
  const corpus = [nom, reference, type].filter(Boolean).join(' ');
  if (corpus) {
    for (const regle of REGLES) {
      const fragment = fragmentReconnu(regle.motsCles, corpus);
      if (fragment) {
        return {
          ecran: regle.ecran, scope: regle.scope, origine: 'libelle', motCle: fragment, exclu: false,
          motif: `Libellé « ${String(source.nom ?? '').trim()} » reconnu sur « ${fragment} ».`
        };
      }
    }
  }

  return { ...SANS_DESTINATION };
}
