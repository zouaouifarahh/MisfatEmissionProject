import * as XLSX from 'xlsx';

import {
  FiliereTraitement, TypeSaisie, reconnaitreFiliere, reconnaitreTypeSaisie,
  normaliserUnite, normaliserTexte, grandeurValorisee, uniteValorisee
} from './fin-de-vie-facteur';

/**
 * Lecture des relevés de fin de vie des produits vendus.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Produit en fin de vie tel que lu du classeur, avant valorisation carbone. */
export interface LigneFinDeVieBrute {
  reference: string;
  produit: string;
  filiereTexte: string;
  filiere: FiliereTraitement | null;
  typeSaisie: TypeSaisie;
  masse: number | null;
  unite: string;
  montant: number | null;
  /** Grandeur valorisée, masse déjà ramenée au kilogramme le cas échéant. */
  grandeur: number | null;
  uniteGrandeur: string;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureFinDeVie {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneFinDeVieBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  reference: ['reference', 'id', 'code'],
  produit: ['produit', 'gamme', 'filtre', 'designation'],
  filiere: ['mode fin de vie', 'filiere', 'traitement', 'filiere traitement'],
  typeSaisie: ['type saisie', 'approche'],
  masseTonnes: ['masse tonnes', 'masse en tonnes', 'tonnage'],
  masseKg: ['masse kg', 'masse en kg'],
  masse: ['masse vendue', 'masse', 'quantite'],
  unite: ['unite', 'uom'],
  montant: ['montant', 'cout']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Masse (Tonnes) » et « Masse (kg) » précèdent « Masse » : l'unité change
 * le résultat d'un facteur mille, elle doit primer. « Type Saisie » précède
 * « Traitement » sur leur préfixe commun.</p>
 */
const ORDRE_CHAMPS = [
  'reference', 'typeSaisie', 'masseTonnes', 'masseKg', 'masse',
  'unite', 'montant', 'filiere', 'produit'
];

/** Sans produit, filière et grandeur, la feuille n'est pas exploitable. */
const OBLIGATOIRES_PRODUIT = ['produit'];
const OBLIGATOIRES_FILIERE = ['filiere'];
const OBLIGATOIRES_GRANDEUR = ['masseTonnes', 'masseKg', 'masse', 'montant'];

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

  if (!OBLIGATOIRES_PRODUIT.some(c => carte[c] !== undefined)) manquantes.push('Produit / Gamme');
  if (!OBLIGATOIRES_FILIERE.some(c => carte[c] !== undefined)) manquantes.push('Filière Traitement');
  if (!OBLIGATOIRES_GRANDEUR.some(c => carte[c] !== undefined)) manquantes.push('Masse ou Montant');

  return manquantes;
}

/** Lit la feuille de fin de vie la plus fournie d'un classeur. */
export function lireClasseurFinDeVie(classeur: XLSX.WorkBook): ResultatLectureFinDeVie | null {
  let meilleur: ResultatLectureFinDeVie | null = null;
  let refuse: ResultatLectureFinDeVie | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleFinDeVie(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleFinDeVie(
  feuille: XLSX.WorkSheet,
  nom: string
): ResultatLectureFinDeVie | null {

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

  const lignes: LigneFinDeVieBrute[] = [];
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

    const defautsAppliques: string[] = [];

    // L'unité de la masse figure dans l'intitulé de sa colonne : confondre
    // tonnes et kilogrammes fausserait d'un facteur mille.
    let masse: number | null = null;
    let unite = '';

    if (carte['masseTonnes'] !== undefined) {
      masse = nombreTolerant(cellule(ligne, 'masseTonnes'));
      unite = 'Tonnes';
    } else if (carte['masseKg'] !== undefined) {
      masse = nombreTolerant(cellule(ligne, 'masseKg'));
      unite = 'kg';
    } else {
      masse = nombreTolerant(cellule(ligne, 'masse'));
      const uniteLue = normaliserUnite(texte(ligne, 'unite'));
      unite = uniteLue || 'Tonnes';
      if (!uniteLue) defautsAppliques.push('unité');
    }

    const montant = nombreTolerant(cellule(ligne, 'montant'));

    if (masse === null && montant === null) {
      rejets.push({ ligneSource, motif: `${produit} : ni masse ni montant exploitable` });
      return;
    }

    compteur++;

    const referenceLue = texte(ligne, 'reference');
    // Une référence absente est engendrée : chaque flux doit rester traçable.
    const reference = referenceLue || `FDV-${String(compteur).padStart(4, '0')}`;
    if (!referenceLue) defautsAppliques.push('référence');

    const typeLu = texte(ligne, 'typeSaisie');
    // À défaut de type déclaré, la colonne renseignée le désigne.
    const typeSaisie = typeLu
      ? reconnaitreTypeSaisie(typeLu)
      : (masse === null ? 'Monétaire' : 'Masse');
    if (!typeLu) defautsAppliques.push('type de saisie');

    const filiereTexte = texte(ligne, 'filiere');
    const source = { typeSaisie, masse, unite, montant };

    lignes.push({
      reference,
      produit,
      filiereTexte,
      filiere: reconnaitreFiliere(filiereTexte),
      typeSaisie,
      masse,
      unite,
      montant,
      grandeur: grandeurValorisee(source),
      uniteGrandeur: uniteValorisee(typeSaisie, unite),
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
