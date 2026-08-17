import * as XLSX from 'xlsx';

import {
  CategorieCarbone, CATEGORIE_REPLI, reconnaitreCategorie, estCelluleAbsente,
  montantTolerant, normaliserTexte
} from './investissements-facteur';

/**
 * Lecture des extractions d'immobilisations MISFAT.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Immobilisation telle que lue du classeur, avant valorisation carbone. */
export interface LigneImmobilisationBrute {
  numeroImmo: string;
  /**
   * Référence carbone du référentiel, lorsque le classeur la porte.
   *
   * <p>Elle désigne le facteur à appliquer — « MS3C2ACW » — là où le numéro
   * d'immobilisation n'identifie qu'un actif comptable.</p>
   */
  referenceCarbone?: string;
  /** Code article de l'ERP, identifiant de gestion de la pièce. */
  codeArticle?: string;
  designation: string;
  /** Cellule « Catégorie Carbone » telle qu'elle figure au classeur. */
  categorieTexte: string;
  categorie: CategorieCarbone;
  /** La cellule d'origine portait une erreur de formule ou restait vide. */
  categorieAbsente: boolean;
  montant: number;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureImmobilisations {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneImmobilisationBrute[];
  rejets: { ligneSource: number; motif: string }[];
  /** Lignes basculées sur la famille de repli faute d'appariement. */
  repliesNA: number;
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  referenceCarbone: [
    'reference carbone', 'ref carbone', 'reference carb', 'code carbone',
    'reference ghg'
  ],
  codeArticle: [
    'code article erp', 'code article', 'article erp', 'code erp', 'ref article',
    'reference article'
  ],
  numeroImmo: [
    'numero d immobilisation', 'numero immobilisation', 'n immobilisation',
    'no immobilisation', 'n immo', 'no immo', 'numero immo', 'immobilisation',
    'id', 'code'
  ],
  designation: [
    'nom', 'designation', 'designation de l actif', 'libelle', 'equipement',
    'description', 'actif'
  ],
  montant: [
    'acquisitions', 'acquisition', 'montant acquisition', 'valeur acquisition',
    'prix acquisition', 'montant', 'valeur', 'prix', 'valeur brute', 'cout'
  ],
  categorie: [
    'categorie carbone', 'categorie', 'type materiau', 'materiau', 'famille',
    'categorie ghg'
  ]
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Catégorie Carbone » précède « Catégorie », et le numéro d'immobilisation
 * précède la désignation : sur le préfixe commun « immobilisation », le code
 * doit l'emporter sur le libellé.</p>
 *
 * <p><strong>La référence carbone et le code article passent en tête.</strong>
 * La seconde passe d'appariement compare par préfixe, et {@code numeroImmo}
 * accepte l'alias « code » : sans cette priorité, une colonne « Code Article
 * ERP » était captée comme numéro d'immobilisation, et l'identifiant ERP se
 * retrouvait dans la colonne des immobilisations.</p>
 */
const ORDRE_CHAMPS = [
  'referenceCarbone', 'codeArticle', 'categorie', 'numeroImmo', 'montant', 'designation'
];

/**
 * Libellés de cumul fermant une extraction comptable.
 *
 * <p>Éprouvés sur la seule désignation, et seulement en l'absence de numéro
 * d'immobilisation : un actif réellement codifié garde sa ligne, quel que soit
 * son nom.</p>
 */
const LIBELLES_TOTAL = /^(total|totaux|cumul|sous total|somme|general)\b/;

/** Sans identification de l'actif ni montant, la feuille n'est pas exploitable. */
const OBLIGATOIRES_ACTIF = ['designation', 'numeroImmo'];
const OBLIGATOIRES_MONTANT = ['montant'];

export function normaliserEnTete(valeur: unknown): string {
  return normaliserTexte(valeur);
}

/** Repère la ligne d'en-tête : celle qui reconnaît le plus de colonnes. */
export function detecterLigneEnTete(lignes: unknown[][], profondeur = 25): number {
  let meilleure = -1;
  let meilleurScore = 0;

  lignes.slice(0, profondeur).forEach((ligne, index) => {
    if (!Array.isArray(ligne)) return;
    const normalisees = ligne.map(normaliserEnTete).filter(Boolean);
    const score = Object.values(SYNONYMES)
      .filter(alias => normalisees.some(entete => alias.includes(entete)))
      .length;
    if (score > meilleurScore) { meilleurScore = score; meilleure = index; }
  });

  return meilleurScore >= 2 ? meilleure : -1;
}

/** Associe chaque champ à son index : correspondances exactes puis par préfixe. */
export function mapperColonnes(enTetes: unknown[]): Record<string, number> {
  const normalisees = enTetes.map(normaliserEnTete);
  const carte: Record<string, number> = {};
  const prises = new Set<number>();

  for (const champ of ORDRE_CHAMPS) {
    for (const alias of SYNONYMES[champ] ?? []) {
      const index = normalisees.findIndex((entete, i) => entete === alias && !prises.has(i));
      if (index >= 0) { carte[champ] = index; prises.add(index); break; }
    }
  }

  for (const champ of ORDRE_CHAMPS) {
    if (carte[champ] !== undefined) continue;
    for (const alias of SYNONYMES[champ] ?? []) {
      const index = normalisees.findIndex(
        (entete, i) => entete && entete.startsWith(alias) && !prises.has(i)
      );
      if (index >= 0) { carte[champ] = index; prises.add(index); break; }
    }
  }

  return carte;
}

/** Colonnes obligatoires absentes d'une carte donnée. */
export function colonnesManquantes(carte: Record<string, number>): string[] {
  const manquantes: string[] = [];

  if (!OBLIGATOIRES_ACTIF.some(c => carte[c] !== undefined)) {
    manquantes.push('Désignation ou N° d\'immobilisation');
  }
  if (!OBLIGATOIRES_MONTANT.some(c => carte[c] !== undefined)) {
    manquantes.push('Acquisitions (TND)');
  }

  return manquantes;
}

/** Lit la feuille d'immobilisations la plus fournie d'un classeur. */
export function lireClasseurImmobilisations(
  classeur: XLSX.WorkBook
): ResultatLectureImmobilisations | null {

  let meilleur: ResultatLectureImmobilisations | null = null;
  let refuse: ResultatLectureImmobilisations | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleImmobilisations(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleImmobilisations(
  feuille: XLSX.WorkSheet,
  nom: string
): ResultatLectureImmobilisations | null {

  const brut = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1, defval: null, blankrows: false, raw: true
  });
  if (!brut.length) return null;

  const ligneEnTete = detecterLigneEnTete(brut);
  if (ligneEnTete < 0) return null;

  const carte = mapperColonnes(brut[ligneEnTete]);
  const manquantes = colonnesManquantes(carte);

  if (manquantes.length) {
    return {
      feuille: nom,
      ligneEnTete,
      colonnesReconnues: Object.keys(carte),
      colonnesManquantes: manquantes,
      avertissement: `Feuille « ${nom} » inexploitable : colonne(s) ${manquantes.join(', ')} introuvable(s).`,
      lignes: [],
      rejets: [],
      repliesNA: 0
    };
  }

  const lignes: LigneImmobilisationBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];
  let repliesNA = 0;

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  let compteur = 0;

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const numeroLu = texte(ligne, 'numeroImmo');
    const designationLue = texte(ligne, 'designation');

    // Les extractions comptables se terminent par un cumul : ni code, et une
    // désignation absente ou réduite à un libellé de total.
    if (!numeroLu && !designationLue) {
      rejets.push({ ligneSource, motif: 'ligne sans identification d\'actif' });
      return;
    }
    if (!numeroLu && LIBELLES_TOTAL.test(normaliserTexte(designationLue))) {
      rejets.push({ ligneSource, motif: `ligne de cumul « ${designationLue} »` });
      return;
    }

    const montant = montantTolerant(cellule(ligne, 'montant'));
    if (montant === null) {
      rejets.push({
        ligneSource,
        motif: `${designationLue || numeroLu} : montant d'acquisition illisible`
      });
      return;
    }

    compteur++;
    const defautsAppliques: string[] = [];

    const numeroImmo = numeroLu || `IMM-${String(compteur).padStart(5, '0')}`;
    if (!numeroLu) defautsAppliques.push('n° d\'immobilisation');

    const designation = designationLue || numeroLu;
    if (!designationLue) defautsAppliques.push('désignation');

    // Le #N/A d'une RECHERCHEV du fichier source ne dit rien de l'actif : il
    // bascule la ligne sur la famille de repli, jamais à la corbeille.
    const categorieTexte = texte(ligne, 'categorie');
    const categorie = reconnaitreCategorie(categorieTexte);
    const categorieAbsente = estCelluleAbsente(categorieTexte) || categorie === CATEGORIE_REPLI;

    if (categorieAbsente) {
      repliesNA++;
      defautsAppliques.push('catégorie carbone');
    }

    lignes.push({
      numeroImmo,
      // Identifiants du référentiel et de l'ERP : lus tels quels, ils ne se
      // substituent pas au numéro d'immobilisation mais s'y ajoutent.
      referenceCarbone: texte(ligne, 'referenceCarbone') || undefined,
      codeArticle: texte(ligne, 'codeArticle') || undefined,
      designation,
      categorieTexte,
      categorie,
      categorieAbsente,
      montant,
      defautsAppliques,
      ligneSource
    });
  });

  return {
    feuille: nom,
    ligneEnTete,
    colonnesReconnues: Object.keys(carte),
    colonnesManquantes: [],
    avertissement: '',
    lignes,
    rejets,
    repliesNA
  };
}
