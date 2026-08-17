import * as XLSX from 'xlsx';

import {
  COLONNES_VALEUR, nettoyerNombre, normaliserTexte, valeurPrioritaire
} from './nombre-comptable';

import {
  EcranDestination, CodeScope, NatureDocument, dispatcherLigne, estCategorieAbsente
} from './regles-dispatch';

/**
 * Lecture globale des classeurs comptables MISFAT.
 *
 * <p>Le parseur ne refuse jamais un classeur : une feuille inexploitable est
 * rapportée dans le diagnostic, jamais opposée à l'utilisateur sous la forme
 * d'un « fichier illisible ». Fonctions pures, exécutables sur un classeur
 * depuis un test.</p>
 */

/** Ligne comptable lue, nettoyée et ventilée. */
export interface LigneDispatchee {
  /** Identifiant stable, reconstruit à chaque import. */
  cle: string;
  feuille: string;
  ligneSource: number;
  mainAccount: string;
  nom: string;
  categorieCarboneTexte: string;
  /** La catégorie carbone du classeur était absente, nulle ou en erreur. */
  categorieAbsente: boolean;
  reference: string;
  quantite: number;
  /** Intitulé de la colonne dont la valeur a été retenue. */
  colonneValeur: string;
  colonnesEcartees: string[];
  ecran: EcranDestination | null;
  scope: CodeScope | null;
  motif: string;
  origineRoutage: 'compte' | 'categorie' | 'libelle' | 'document' | 'exclusion' | 'aucune';
  motCle: string;
  /** Poste écarté du bilan à dessein, et non faute de règle. */
  exclu: boolean;
}

export interface DiagnosticFeuille {
  feuille: string;
  nature: NatureDocument;
  ligneEnTete: number;
  colonnesReconnues: string[];
  lignesLues: number;
  lignesRetenues: number;
  /** Motif d'écartement de la feuille, le cas échéant. */
  motifEcart: string;
}

export interface RapportDispatch {
  lignes: LigneDispatchee[];
  feuilles: DiagnosticFeuille[];
  /** Lues, mais qu'aucune règle n'a su rattacher à un écran. */
  nonVentilees: number;
  /** Écartées du bilan à dessein : personnel, financier, amortissements. */
  exclues: number;
  /** Écartées faute de grandeur exploitable dans toutes les colonnes candidates. */
  sansValeur: number;
  avertissements: string[];
}

/** Synonymes des colonnes d'identification, du plus précis au plus général. */
const SYNONYMES_IDENTITE: Record<string, string[]> = {
  mainAccount: [
    'mainaccount', 'main accour', 'main account', 'compte principal', 'numero de compte',
    'n compte', 'compte', 'numero d immobilisation', 'numero immobilisation', 'row labels'
  ],
  nom: [
    'nom', 'designation', 'libelle', 'intitule', 'description', 'nom du produit', 'equipement'
  ],
  categorieCarbone: [
    'categorie carbone', 'categorie ghg', 'categorie', 'type materiau', 'famille'
  ],
  reference: ['reference', 'reference carbone', 'code article', 'codearticle', 'code'],
  type: ['type']
};

const ORDRE_IDENTITE = ['categorieCarbone', 'mainAccount', 'reference', 'type', 'nom'];

/** Libellés de cumul fermant une extraction comptable. */
const LIBELLES_TOTAL = /^(total|totaux|cumul|sous total|somme|grand total)\b/;

/** Associe chaque champ d'identification à son index de colonne. */
export function mapperIdentite(enTetes: unknown[]): Record<string, number> {
  const normalisees = enTetes.map(normaliserTexte);
  const carte: Record<string, number> = {};
  const prises = new Set<number>();

  for (const champ of ORDRE_IDENTITE) {
    for (const alias of SYNONYMES_IDENTITE[champ] ?? []) {
      const index = normalisees.findIndex((entete, i) => entete === alias && !prises.has(i));
      if (index >= 0) { carte[champ] = index; prises.add(index); break; }
    }
  }

  for (const champ of ORDRE_IDENTITE) {
    if (carte[champ] !== undefined) continue;
    for (const alias of SYNONYMES_IDENTITE[champ] ?? []) {
      const index = normalisees.findIndex(
        (entete, i) => entete && entete.startsWith(alias) && !prises.has(i)
      );
      if (index >= 0) { carte[champ] = index; prises.add(index); break; }
    }
  }

  return carte;
}

/** Indices des colonnes de valeur présentes, dans l'ordre de priorité. */
export function mapperValeurs(enTetes: unknown[]): { colonne: string; index: number }[] {
  const normalisees = enTetes.map(normaliserTexte);
  const trouvees: { colonne: string; index: number }[] = [];
  const prises = new Set<number>();

  for (const candidate of COLONNES_VALEUR) {
    const attendu = normaliserTexte(candidate);

    let index = normalisees.findIndex((entete, i) => entete === attendu && !prises.has(i));
    if (index < 0) {
      index = normalisees.findIndex(
        (entete, i) => entete && entete.startsWith(attendu) && !prises.has(i)
      );
    }
    if (index >= 0) {
      trouvees.push({ colonne: String(enTetes[index] ?? candidate).trim(), index });
      prises.add(index);
    }
  }

  return trouvees;
}

/**
 * Nature du document, déduite de ses intitulés de colonnes.
 *
 * <p>Une base d'immobilisations se reconnaît à son numéro d'immobilisation et
 * à sa colonne d'acquisitions. Sans cette lecture, ses 2 000 lignes seraient
 * ventilées au vocabulaire de leur libellé : une armoire électrique partirait
 * en électricité achetée et un climatiseur en réfrigérants, alors qu'il s'agit
 * dans les deux cas d'actifs acquis.</p>
 */
export function natureFeuille(enTetes: unknown[]): NatureDocument {
  const normalisees = enTetes.map(normaliserTexte);
  const contient = (motif: RegExp) => normalisees.some(entete => motif.test(entete));

  if (contient(/^numero d? ?immobilisation/) && contient(/^acquisition/)) return 'immobilisations';
  if (contient(/^main ?ac/) || contient(/^solde/) || contient(/^debit/)) return 'comptable';
  return 'inconnue';
}

/**
 * Repère la ligne d'en-tête d'une feuille.
 *
 * <p>Retenue dès qu'elle nomme une colonne d'identification et une colonne de
 * valeur : les extractions coiffent souvent leurs données de plusieurs lignes
 * de titre.</p>
 */
export function detecterLigneEnTete(lignes: unknown[][], profondeur = 30): number {
  let meilleure = -1;
  let meilleurScore = 0;

  lignes.slice(0, profondeur).forEach((ligne, index) => {
    if (!Array.isArray(ligne)) return;

    const identite = Object.keys(mapperIdentite(ligne)).length;
    const valeurs = mapperValeurs(ligne).length;
    if (!identite || !valeurs) return;

    const score = identite + valeurs;
    if (score > meilleurScore) { meilleurScore = score; meilleure = index; }
  });

  return meilleure;
}

/** Lit une feuille et ventile ses lignes ; {@code null} si elle n'en porte pas. */
export function lireFeuilleDispatch(
  feuille: XLSX.WorkSheet,
  nom: string
): { diagnostic: DiagnosticFeuille; lignes: LigneDispatchee[] } | null {

  const brut = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1, defval: null, blankrows: false, raw: true
  });

  if (!brut.length) {
    return {
      diagnostic: {
        feuille: nom, nature: 'inconnue', ligneEnTete: -1, colonnesReconnues: [],
        lignesLues: 0, lignesRetenues: 0, motifEcart: 'feuille vide'
      },
      lignes: []
    };
  }

  const ligneEnTete = detecterLigneEnTete(brut);
  if (ligneEnTete < 0) {
    return {
      diagnostic: {
        feuille: nom, nature: 'inconnue', ligneEnTete: -1, colonnesReconnues: [],
        lignesLues: brut.length, lignesRetenues: 0,
        motifEcart: 'aucun en-tête associant une identification à une colonne de valeur'
      },
      lignes: []
    };
  }

  const enTetes = brut[ligneEnTete];
  const identite = mapperIdentite(enTetes);
  const valeurs = mapperValeurs(enTetes);
  const nature = natureFeuille(enTetes);

  const cellule = (ligne: unknown[], champ: string) => {
    const index = identite[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  const lignes: LigneDispatchee[] = [];
  let lignesLues = 0;

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const mainAccount = texte(ligne, 'mainAccount');
    const libelle = texte(ligne, 'nom');
    if (!mainAccount && !libelle) return;

    // Les extractions se referment sur un cumul : ni compte, ni libellé d'actif.
    if (!mainAccount && LIBELLES_TOTAL.test(normaliserTexte(libelle))) return;

    lignesLues++;

    // Les colonnes de valeur sont reconstruites en objet pour que la résolution
    // par priorité s'applique à l'identique, quel que soit l'ordre du classeur.
    const candidates: Record<string, unknown> = {};
    for (const { colonne, index } of valeurs) candidates[colonne] = ligne[index] ?? null;

    const retenue = valeurPrioritaire(candidates);
    if (retenue.valeur === null) return;

    const categorieTexte = texte(ligne, 'categorieCarbone');
    const reference = texte(ligne, 'reference');
    const typeLu = texte(ligne, 'type');

    const routage = dispatcherLigne(
      { mainAccount, nom: libelle, categorieCarbone: categorieTexte, reference, type: typeLu },
      { nature }
    );

    lignes.push({
      cle: `${nom}#${ligneSource}`,
      feuille: nom,
      ligneSource,
      mainAccount,
      nom: libelle,
      categorieCarboneTexte: categorieTexte,
      categorieAbsente: estCategorieAbsente(categorieTexte),
      reference,
      quantite: retenue.valeur,
      colonneValeur: retenue.colonne,
      colonnesEcartees: retenue.colonnesEcartees,
      ecran: routage.ecran,
      scope: routage.scope,
      motif: routage.motif,
      origineRoutage: routage.origine,
      motCle: routage.motCle,
      exclu: routage.exclu
    });
  });

  return {
    diagnostic: {
      feuille: nom,
      nature,
      ligneEnTete,
      colonnesReconnues: [...Object.keys(identite), ...valeurs.map(v => v.colonne)],
      lignesLues,
      lignesRetenues: lignes.length,
      motifEcart: ''
    },
    lignes
  };
}

/**
 * Lit et ventile toutes les feuilles d'un classeur.
 *
 * <p>Aucune feuille n'interrompt la lecture : celles qui n'exposent pas de
 * grandeur exploitable figurent au diagnostic avec leur motif.</p>
 */
export function lireClasseurDispatch(classeur: XLSX.WorkBook): RapportDispatch {
  const lignes: LigneDispatchee[] = [];
  const feuilles: DiagnosticFeuille[] = [];
  const avertissements: string[] = [];
  let sansValeur = 0;

  for (const nom of classeur.SheetNames) {
    const lecture = lireFeuilleDispatch(classeur.Sheets[nom], nom);
    if (!lecture) continue;

    feuilles.push(lecture.diagnostic);
    lignes.push(...lecture.lignes);

    sansValeur += Math.max(0, lecture.diagnostic.lignesLues - lecture.diagnostic.lignesRetenues);

    if (lecture.diagnostic.motifEcart) {
      avertissements.push(`Feuille « ${nom} » écartée : ${lecture.diagnostic.motifEcart}.`);
    }
  }

  // Une ligne écartée à dessein n'est pas une ligne oubliée : les deux
  // décomptes sont tenus séparément.
  const exclues = lignes.filter(l => l.exclu).length;
  const nonVentilees = lignes.filter(l => !l.ecran && !l.exclu).length;

  if (!lignes.length) {
    avertissements.push(
      'Aucune ligne exploitable : le classeur doit exposer une colonne d\'identification '
      + '(Compte, Nom, Désignation) et une colonne de valeur '
      + `(${COLONNES_VALEUR.slice(0, 4).join(', ')}…).`
    );
  }

  return { lignes, feuilles, nonVentilees, exclues, sansValeur, avertissements };
}

/** Somme des grandeurs ventilées vers un écran donné. */
export function totalPourEcran(lignes: LigneDispatchee[], ecran: EcranDestination): number {
  return lignes
    .filter(l => l.ecran === ecran)
    .reduce((somme, l) => somme + (nettoyerNombre(l.quantite) ?? 0), 0);
}
