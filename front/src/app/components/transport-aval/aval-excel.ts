import * as XLSX from 'xlsx';

import {
  ModeFret, TypeSaisie, reconnaitreModeFret, reconnaitreTypeSaisie,
  normaliserTexte, tonnesKilometres, enTonnes,
  ETABLISSEMENT_DEFAUT, DEVISE_DEFAUT
} from './aval-facteur';

/**
 * Lecture des relevés d'expéditions aval.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Expédition telle que lue du classeur, avant valorisation carbone. */
export interface LigneAvalBrute {
  idExpedition: string;
  etablissement: string;
  destination: string;
  modeTexte: string;
  mode: ModeFret | null;
  typeSaisie: TypeSaisie;
  poidsTonnes: number | null;
  distanceKm: number | null;
  /** Tonnes-kilomètres, lues du fichier ou calculées du poids et de la distance. */
  tonneKm: number | null;
  montant: number | null;
  devise: string;
  /** Grandeur portant le calcul : t.km ou montant selon l'approche. */
  quantite: number | null;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureAval {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneAvalBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  idExpedition: ['id expedition', 'n lot', 'no lot', 'lot', 'ref', 'reference', 'code'],
  etablissement: ['etablissement', 'site depart', 'site', 'usine'],
  destination: ['destination', 'client', 'ville pays', 'ville', 'pays'],
  mode: ['mode transport', 'mode de transport', 'type fret', 'vecteur', 'mode'],
  typeSaisie: ['type saisie', 'approche'],
  poidsKg: ['poids kg', 'poids en kg', 'masse kg'],
  poidsTonnes: ['poids tonnes', 'poids en tonnes', 'tonnage'],
  poids: ['poids', 'masse'],
  distance: ['distance km', 'km trajet', 'distance', 'km'],
  tonneKm: ['tonne km', 'tkm', 't km'],
  montant: ['cout transport', 'montant', 'cout'],
  devise: ['devise', 'monnaie']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Poids (kg) » et « Poids (Tonnes) » précèdent « Poids » : l'unité change
 * le résultat d'un facteur mille, elle doit donc primer.</p>
 */
const ORDRE_CHAMPS = [
  'tonneKm', 'poidsKg', 'poidsTonnes', 'poids', 'distance', 'typeSaisie',
  'montant', 'devise', 'idExpedition', 'etablissement', 'mode', 'destination'
];

/** Sans destination, mode et grandeur valorisable, la feuille est inexploitable. */
const OBLIGATOIRES_DESTINATION = ['destination'];
const OBLIGATOIRES_MODE = ['mode'];
const OBLIGATOIRES_GRANDEUR = ['tonneKm', 'poidsKg', 'poidsTonnes', 'poids', 'montant'];

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
  const manquantes: string[] = [];

  if (!OBLIGATOIRES_DESTINATION.some(c => carte[c] !== undefined)) {
    manquantes.push('Destination / Client');
  }
  if (!OBLIGATOIRES_MODE.some(c => carte[c] !== undefined)) {
    manquantes.push('Mode de Transport');
  }
  if (!OBLIGATOIRES_GRANDEUR.some(c => carte[c] !== undefined)) {
    manquantes.push('Poids, Tonne.km ou Montant');
  }
  return manquantes;
}

/** Lit la feuille d'expéditions la plus fournie d'un classeur. */
export function lireClasseurAval(classeur: XLSX.WorkBook): ResultatLectureAval | null {
  let meilleur: ResultatLectureAval | null = null;
  let refuse: ResultatLectureAval | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleAval(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleAval(feuille: XLSX.WorkSheet, nom: string): ResultatLectureAval | null {
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

  const lignes: LigneAvalBrute[] = [];
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

    const destination = texte(ligne, 'destination');
    // Les relevés se terminent souvent par un total : aucune destination.
    if (!destination) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans destination' });
      return;
    }

    const defautsAppliques: string[] = [];
    compteur++;

    // Le poids est ramené en tonnes : l'unité figure dans l'intitulé de la
    // colonne, et confondre kilogrammes et tonnes fausse d'un facteur mille.
    const poidsTonnes = carte['poidsTonnes'] !== undefined
      ? nombreTolerant(cellule(ligne, 'poidsTonnes'))
      : carte['poidsKg'] !== undefined
        ? enTonnes(nombreTolerant(cellule(ligne, 'poidsKg')), 'kg')
        : enTonnes(nombreTolerant(cellule(ligne, 'poids')), 'tonnes');

    const distanceKm = nombreTolerant(cellule(ligne, 'distance'));
    const montant = nombreTolerant(cellule(ligne, 'montant'));

    // Les tonnes-kilomètres sont lues si le fichier les porte, calculées sinon.
    const tkmLu = nombreTolerant(cellule(ligne, 'tonneKm'));
    const tonneKm = tkmLu ?? tonnesKilometres(poidsTonnes, distanceKm);
    if (tkmLu === null && tonneKm !== null) defautsAppliques.push('tonne.km calculé');

    const typeLu = texte(ligne, 'typeSaisie');
    const typeSaisie = typeLu
      ? reconnaitreTypeSaisie(typeLu)
      : (tonneKm !== null ? 'Tonne.km' : 'Monétaire');
    if (!typeLu) defautsAppliques.push('type de saisie');

    const quantite = typeSaisie === 'Monétaire' ? montant : tonneKm;
    if (quantite === null) {
      rejets.push({
        ligneSource,
        motif: `${destination} : ni tonne.km ni montant exploitable`
      });
      return;
    }

    const idLu = texte(ligne, 'idExpedition');
    const idExpedition = idLu || `EXP-${String(compteur).padStart(4, '0')}`;
    if (!idLu) defautsAppliques.push('identifiant d\'expédition');

    const etablissementLu = texte(ligne, 'etablissement');
    const etablissement = etablissementLu || ETABLISSEMENT_DEFAUT;
    if (!etablissementLu) defautsAppliques.push('établissement');

    const deviseLue = texte(ligne, 'devise');
    const devise = (deviseLue || DEVISE_DEFAUT).toUpperCase();
    if (!deviseLue) defautsAppliques.push('devise');

    const modeTexte = texte(ligne, 'mode');

    lignes.push({
      idExpedition,
      etablissement,
      destination,
      modeTexte,
      mode: reconnaitreModeFret(modeTexte),
      typeSaisie,
      poidsTonnes,
      distanceKm,
      tonneKm,
      montant,
      devise,
      quantite,
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
