import * as XLSX from 'xlsx';

import {
  TypeActif, ModeSaisie, reconnaitreTypeActif, reconnaitreModeSaisie,
  modeDepuisUnite, normaliserUnite, normaliserTexte, quantiteAjustee,
  RATIO_OCCUPATION_DEFAUT, ETABLISSEMENT_DEFAUT
} from './actifs-facteur';

/**
 * Lecture des relevés d'actifs loués en amont.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Actif loué tel que lu du classeur, avant valorisation carbone. */
export interface LigneActifBrute {
  reference: string;
  designation: string;
  typeTexte: string;
  typeActif: TypeActif | null;
  etablissement: string;
  modeSaisie: ModeSaisie;
  quantite: number | null;
  unite: string;
  periode: string;
  ratioOccupation: number;
  /** Quantité imputable, surface déjà convertie en kWh le cas échéant. */
  quantiteAjustee: number | null;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureActifs {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneActifBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  reference: ['reference', 'id actif', 'code'],
  designation: ['designation actif', 'designation', 'nom actif', 'description', 'bien'],
  typeActif: ['type d actif', 'type actif', 'categorie', 'type'],
  etablissement: ['etablissement', 'site', 'usine'],
  modeSaisie: ['mode calcul', 'mode de calcul', 'type saisie', 'approche'],
  quantite: ['quantite', 'valeur', 'volume', 'montant'],
  unite: ['unite', 'uom'],
  periode: ['periode', 'annee', 'mois'],
  ratio: ['ratio occupation', 'occupation', 'part louee', 'quotite']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Désignation actif » et « Type d'actif » précèdent les alias courts, sans
 * quoi le repli par préfixe s'emparerait de la mauvaise colonne.</p>
 */
const ORDRE_CHAMPS = [
  'designation', 'typeActif', 'modeSaisie', 'reference', 'etablissement',
  'quantite', 'unite', 'periode', 'ratio'
];

/** Sans désignation, type, quantité et unité, la feuille n'est pas exploitable. */
const OBLIGATOIRES = [
  { champ: 'designation', libelle: 'Désignation Actif' },
  { champ: 'typeActif', libelle: 'Type d\'Actif' },
  { champ: 'quantite', libelle: 'Quantité / Valeur' },
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

/** Lit la feuille d'actifs la plus fournie d'un classeur. */
export function lireClasseurActifs(classeur: XLSX.WorkBook): ResultatLectureActifs | null {
  let meilleur: ResultatLectureActifs | null = null;
  let refuse: ResultatLectureActifs | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleActifs(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleActifs(feuille: XLSX.WorkSheet, nom: string): ResultatLectureActifs | null {
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

  const lignes: LigneActifBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];
  const anneeCourante = String(new Date().getFullYear());

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  let compteur = 0;

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const designation = texte(ligne, 'designation');
    // Les relevés se terminent souvent par un total : aucune désignation.
    if (!designation) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans désignation d\'actif' });
      return;
    }

    const quantite = nombreTolerant(cellule(ligne, 'quantite'));
    if (quantite === null) {
      rejets.push({ ligneSource, motif: `${designation} : quantité absente ou illisible` });
      return;
    }

    compteur++;
    const defautsAppliques: string[] = [];

    const referenceLue = texte(ligne, 'reference');
    // Une référence absente est engendrée : chaque actif doit rester traçable.
    const reference = referenceLue || `ACT-${String(compteur).padStart(4, '0')}`;
    if (!referenceLue) defautsAppliques.push('référence');

    const etablissementLu = texte(ligne, 'etablissement');
    const etablissement = etablissementLu || ETABLISSEMENT_DEFAUT;
    if (!etablissementLu) defautsAppliques.push('établissement');

    const unite = normaliserUnite(texte(ligne, 'unite'));

    const modeLu = texte(ligne, 'modeSaisie');
    // À défaut de mode déclaré, l'unité le désigne : des m² valent une surface,
    // une devise une approche monétaire.
    const modeSaisie = modeLu
      ? reconnaitreModeSaisie(modeLu)
      : modeDepuisUnite(unite);
    if (!modeLu) defautsAppliques.push('mode de calcul');

    const periodeLue = texte(ligne, 'periode');
    const periode = periodeLue || anneeCourante;
    if (!periodeLue) defautsAppliques.push('période');

    const ratioLu = nombreTolerant(cellule(ligne, 'ratio'));
    const ratioOccupation = ratioLu !== null && ratioLu > 0 ? ratioLu : RATIO_OCCUPATION_DEFAUT;
    if (ratioLu === null || ratioLu <= 0) defautsAppliques.push('ratio d\'occupation');

    const typeTexte = texte(ligne, 'typeActif');

    lignes.push({
      reference,
      designation,
      typeTexte,
      typeActif: reconnaitreTypeActif(typeTexte),
      etablissement,
      modeSaisie,
      quantite,
      unite,
      periode,
      ratioOccupation,
      quantiteAjustee: quantiteAjustee({ mode: modeSaisie, quantite, ratioOccupation }),
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
