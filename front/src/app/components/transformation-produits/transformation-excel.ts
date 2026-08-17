import * as XLSX from 'xlsx';

import {
  TypeProcede, TypeSaisie, reconnaitreProcede, reconnaitreTypeSaisie,
  saisieDepuisUnite, normaliserUnite, normaliserTexte,
  grandeurValorisee, uniteValorisee
} from './transformation-facteur';

/**
 * Lecture des relevés de transformation des produits vendus.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Produit intermédiaire tel que lu du classeur, avant valorisation carbone. */
export interface LigneTransformationBrute {
  reference: string;
  produit: string;
  client: string;
  procedeTexte: string;
  procede: TypeProcede | null;
  typeSaisie: TypeSaisie;
  quantite: number | null;
  unite: string;
  /** Grandeur valorisée, masse déjà ramenée au kilogramme le cas échéant. */
  grandeur: number | null;
  uniteGrandeur: string;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureTransformation {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneTransformationBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  reference: ['code produit', 'reference', 'id', 'code'],
  produit: ['nom produit', 'produit', 'composant', 'designation'],
  client: ['client', 'acheteur', 'secteur', 'destination'],
  procede: ['type transformation', 'procede', 'operation', 'transformation'],
  typeSaisie: ['type saisie', 'approche'],
  quantite: ['masse tonnes', 'quantite', 'volume', 'membres', 'montant'],
  unite: ['unite', 'uom']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Type Saisie » précède « Type Transformation » sur le préfixe commun
 * « type », et « Code Produit » précède « Produit » : sans cet ordre, le repli
 * par préfixe s'emparerait de la mauvaise colonne.</p>
 */
const ORDRE_CHAMPS = [
  'reference', 'typeSaisie', 'procede', 'quantite', 'unite', 'produit', 'client'
];

/** Sans produit, procédé, quantité et unité, la feuille n'est pas exploitable. */
const OBLIGATOIRES = [
  { champ: 'produit', libelle: 'Nom Produit' },
  { champ: 'procede', libelle: 'Type Procédé' },
  { champ: 'quantite', libelle: 'Quantité / Volume' },
  { champ: 'unite', libelle: 'Unité' }
];

export function normaliserEnTete(valeur: unknown): string {
  return normaliserTexte(valeur);
}

/** Conversion numérique tolérante : erreurs Excel, virgule décimale, espaces. */
export function nombreTolerant(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
  if (valeur instanceof Date) return null;

  let texte = String(valeur).trim();
  if (!texte) return null;
  if (/^#?(n\s*\/?\s*a|div\/0!?|value!?|ref!?|-{1,2})$/i.test(texte)) return null;

  texte = texte.replace(/[\s  ]/g, '');

  const virgule = texte.lastIndexOf(',');
  const point = texte.lastIndexOf('.');
  if (virgule >= 0 && point >= 0) {
    texte = virgule > point
      ? texte.replace(/\./g, '').replace(',', '.')
      : texte.replace(/,/g, '');
  } else if (virgule >= 0) {
    texte = texte.replace(',', '.');
  }

  texte = texte.replace(/[^0-9.eE+-]/g, '');
  if (!texte || texte === '-' || texte === '.') return null;

  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
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

  return meilleurScore >= 3 ? meilleure : -1;
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
  return OBLIGATOIRES
    .filter(({ champ }) => carte[champ] === undefined)
    .map(({ libelle }) => libelle);
}

/** Lit la feuille de transformation la plus fournie d'un classeur. */
export function lireClasseurTransformation(
  classeur: XLSX.WorkBook
): ResultatLectureTransformation | null {

  let meilleur: ResultatLectureTransformation | null = null;
  let refuse: ResultatLectureTransformation | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleTransformation(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleTransformation(
  feuille: XLSX.WorkSheet,
  nom: string
): ResultatLectureTransformation | null {

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
      rejets: []
    };
  }

  const lignes: LigneTransformationBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  let compteur = 0;

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const produit = texte(ligne, 'produit');
    // Les relevés se terminent souvent par un total : aucune désignation.
    if (!produit) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans désignation de produit' });
      return;
    }

    const quantite = nombreTolerant(cellule(ligne, 'quantite'));
    if (quantite === null) {
      rejets.push({ ligneSource, motif: `${produit} : quantité absente ou illisible` });
      return;
    }

    compteur++;
    const defautsAppliques: string[] = [];

    const referenceLue = texte(ligne, 'reference');
    // Une référence absente est engendrée : chaque produit doit rester traçable.
    const reference = referenceLue || `TRF-${String(compteur).padStart(4, '0')}`;
    if (!referenceLue) defautsAppliques.push('référence');

    const unite = normaliserUnite(texte(ligne, 'unite'));

    const typeLu = texte(ligne, 'typeSaisie');
    const typeSaisie = typeLu ? reconnaitreTypeSaisie(typeLu) : saisieDepuisUnite(unite);
    if (!typeLu) defautsAppliques.push('type de saisie');

    const procedeTexte = texte(ligne, 'procede');
    const procede = reconnaitreProcede(procedeTexte);

    const monetaire = typeSaisie === 'Monétaire';
    const source = { procede: procede ?? 'Produit Fini Direct', quantite, unite, monetaire };

    lignes.push({
      reference,
      produit,
      client: texte(ligne, 'client'),
      procedeTexte,
      procede,
      typeSaisie,
      quantite,
      unite,
      grandeur: grandeurValorisee(source),
      uniteGrandeur: uniteValorisee(source),
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
    rejets
  };
}
