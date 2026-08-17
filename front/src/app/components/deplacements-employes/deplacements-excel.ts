import * as XLSX from 'xlsx';

import {
  ModeTransport, reconnaitreMode, normaliserTexte, kilometrageAnnuel,
  JOURS_TRAVAILLES_DEFAUT, COVOITURAGE_DEFAUT, ETABLISSEMENT_DEFAUT
} from '../../shared/mobilite/modes-transport';

/**
 * Lecture des relevés de déplacements domicile-travail.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur les fichiers de production depuis un test.</p>
 */

/** Trajet domicile-travail tel que lu du classeur. */
export interface LigneDeplacementBrute {
  matricule: string;
  employe: string;
  etablissement: string;
  adresseDomicile: string;
  modeTexte: string;
  mode: ModeTransport | null;
  motorisation: string;
  distanceAllerKm: number | null;
  joursTravailles: number;
  covoiturage: number;
  /** Kilométrage annuel déduit : aller × 2 × jours ÷ covoiturage. */
  kmAnnuels: number | null;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureDeplacements {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneDeplacementBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  matricule: ['matricule', 'id', 'code salarie', 'code employe'],
  employe: ['nom prenom', 'nom et prenom', 'employe', 'salarie', 'collaborateur', 'nom'],
  etablissement: ['etablissement', 'site', 'usine'],
  adresse: ['adresse domicile', 'adresse', 'ville', 'domicile'],
  mode: ['moyen de transport', 'transport', 'mode', 'mode de transport'],
  motorisation: ['motorisation', 'type carburant', 'carburant', 'energie'],
  distance: ['distance aller', 'distance km', 'distance', 'km', 'kilometrage'],
  jours: ['jours travailles', 'jours an', 'jours', 'nombre de jours'],
  covoiturage: ['taux d occupation', 'taux occupation', 'covoiturage', 'occupants']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Distance aller » précède « Distance », et « Nom & Prénom » précède
 * « Nom », faute de quoi le repli par préfixe s'emparerait de la mauvaise
 * colonne.</p>
 */
const ORDRE_CHAMPS = [
  'matricule', 'adresse', 'motorisation', 'distance', 'jours', 'covoiturage',
  'etablissement', 'mode', 'employe'
];

/** Sans matricule, employé, mode et distance, la feuille n'est pas exploitable. */
const OBLIGATOIRES = [
  { champ: 'matricule', libelle: 'Matricule' },
  { champ: 'employe', libelle: 'Nom & Prénom' },
  { champ: 'mode', libelle: 'Moyen de transport' },
  { champ: 'distance', libelle: 'Distance (KM)' }
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

/** Lit la feuille de déplacements la plus fournie d'un classeur. */
export function lireClasseurDeplacements(classeur: XLSX.WorkBook): ResultatLectureDeplacements | null {
  let meilleur: ResultatLectureDeplacements | null = null;
  let refuse: ResultatLectureDeplacements | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleDeplacements(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleDeplacements(
  feuille: XLSX.WorkSheet,
  nom: string
): ResultatLectureDeplacements | null {

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

  const lignes: LigneDeplacementBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const matricule = texte(ligne, 'matricule');
    const employe = texte(ligne, 'employe');

    // Les relevés se terminent souvent par un total : ni matricule ni employé.
    if (!matricule && !employe) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans identité de salarié' });
      return;
    }

    const distanceAllerKm = nombreTolerant(cellule(ligne, 'distance'));
    if (distanceAllerKm === null || distanceAllerKm < 0) {
      rejets.push({ ligneSource, motif: `${matricule || employe} : distance absente ou illisible` });
      return;
    }

    const defautsAppliques: string[] = [];

    const etablissementLu = texte(ligne, 'etablissement');
    const etablissement = etablissementLu || ETABLISSEMENT_DEFAUT;
    if (!etablissementLu) defautsAppliques.push('établissement');

    const joursLus = nombreTolerant(cellule(ligne, 'jours'));
    const joursTravailles = joursLus && joursLus > 0 ? joursLus : JOURS_TRAVAILLES_DEFAUT;
    if (!joursLus || joursLus <= 0) defautsAppliques.push('jours travaillés');

    const covoiturageLu = nombreTolerant(cellule(ligne, 'covoiturage'));
    const covoiturage = covoiturageLu && covoiturageLu > 0 ? covoiturageLu : COVOITURAGE_DEFAUT;
    if (!covoiturageLu || covoiturageLu <= 0) defautsAppliques.push('taux d\'occupation');

    const modeTexte = texte(ligne, 'mode');
    const mode = reconnaitreMode(modeTexte);

    lignes.push({
      matricule,
      employe,
      etablissement,
      adresseDomicile: texte(ligne, 'adresse'),
      modeTexte,
      mode,
      motorisation: texte(ligne, 'motorisation'),
      distanceAllerKm,
      joursTravailles,
      covoiturage,
      kmAnnuels: kilometrageAnnuel(distanceAllerKm, joursTravailles, covoiturage),
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
