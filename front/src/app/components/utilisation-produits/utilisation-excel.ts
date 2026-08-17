import * as XLSX from 'xlsx';

import {
  GammeProduit, TypeSaisie, reconnaitreGamme, reconnaitreTypeSaisie,
  normaliserTexte, grandeurValorisee, uniteValorisee,
  DUREE_VIE_DEFAUT_KM, ETABLISSEMENT_DEFAUT
} from './utilisation-facteur';

/**
 * Lecture des relevés d'utilisation des produits vendus.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur un classeur depuis un test.</p>
 */

/** Produit vendu tel que lu du classeur, avant valorisation carbone. */
export interface LigneUtilisationBrute {
  reference: string;
  gammeTexte: string;
  gamme: GammeProduit | null;
  etablissement: string;
  typeSaisie: TypeSaisie;
  quantiteVendue: number | null;
  dureeVieKm: number;
  montant: number | null;
  /** Grandeur valorisée : kilométrage total couvert ou montant facturé. */
  grandeur: number | null;
  uniteGrandeur: string;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureUtilisation {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
  avertissement: string;
  lignes: LigneUtilisationBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  reference: ['code produit', 'reference', 'id', 'code'],
  gamme: ['type filtre', 'gamme', 'designation', 'produit'],
  etablissement: ['etablissement', 'site', 'usine'],
  typeSaisie: ['type saisie', 'approche'],
  quantite: ['quantite vendue', 'quantite', 'unites', 'volume'],
  dureeVie: ['kilometrage km', 'kilometrage', 'km unite', 'duree de vie', 'duree'],
  montant: ['ventes tnd', 'montant', 'ca', 'chiffre d affaires']
};

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Type Saisie » précède « Type Filtre » sur le préfixe commun « type », et
 * « Quantité Vendue » précède « Quantité » : sans cet ordre, le repli par
 * préfixe s'emparerait de la mauvaise colonne.</p>
 */
const ORDRE_CHAMPS = [
  'reference', 'typeSaisie', 'dureeVie', 'quantite', 'montant',
  'gamme', 'etablissement'
];

/** Sans gamme ni grandeur valorisable, la feuille n'est pas exploitable. */
const OBLIGATOIRES_GAMME = ['gamme'];
const OBLIGATOIRES_GRANDEUR = ['quantite', 'montant'];

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

  if (!OBLIGATOIRES_GAMME.some(c => carte[c] !== undefined)) {
    manquantes.push('Gamme / Type Filtre');
  }
  if (!OBLIGATOIRES_GRANDEUR.some(c => carte[c] !== undefined)) {
    manquantes.push('Quantité Vendue ou Montant');
  }
  return manquantes;
}

/** Lit la feuille d'utilisation la plus fournie d'un classeur. */
export function lireClasseurUtilisation(
  classeur: XLSX.WorkBook
): ResultatLectureUtilisation | null {

  let meilleur: ResultatLectureUtilisation | null = null;
  let refuse: ResultatLectureUtilisation | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleUtilisation(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleUtilisation(
  feuille: XLSX.WorkSheet,
  nom: string
): ResultatLectureUtilisation | null {

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

  const lignes: LigneUtilisationBrute[] = [];
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

    const gammeTexte = texte(ligne, 'gamme');
    // Les relevés se terminent souvent par un total : aucune gamme désignée.
    if (!gammeTexte) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans gamme de produit' });
      return;
    }

    const quantiteVendue = nombreTolerant(cellule(ligne, 'quantite'));
    const montant = nombreTolerant(cellule(ligne, 'montant'));

    if (quantiteVendue === null && montant === null) {
      rejets.push({ ligneSource, motif: `${gammeTexte} : ni quantité vendue ni montant exploitable` });
      return;
    }

    compteur++;
    const defautsAppliques: string[] = [];

    const referenceLue = texte(ligne, 'reference');
    // Une référence absente est engendrée : chaque gamme doit rester traçable.
    const reference = referenceLue || `USE-${String(compteur).padStart(4, '0')}`;
    if (!referenceLue) defautsAppliques.push('référence');

    const etablissementLu = texte(ligne, 'etablissement');
    const etablissement = etablissementLu || ETABLISSEMENT_DEFAUT;
    if (!etablissementLu) defautsAppliques.push('établissement');

    const typeLu = texte(ligne, 'typeSaisie');
    // À défaut de type déclaré, la colonne renseignée le désigne : un montant
    // sans quantité vendue vaut valorisation monétaire.
    const typeSaisie = typeLu
      ? reconnaitreTypeSaisie(typeLu)
      : (quantiteVendue === null ? 'Monétaire' : 'Kilométrage');
    if (!typeLu) defautsAppliques.push('type de saisie');

    const dureeLue = nombreTolerant(cellule(ligne, 'dureeVie'));
    const dureeVieKm = dureeLue !== null && dureeLue > 0 ? dureeLue : DUREE_VIE_DEFAUT_KM;
    if ((dureeLue === null || dureeLue <= 0) && typeSaisie === 'Kilométrage') {
      defautsAppliques.push('durée de vie');
    }

    const source = { typeSaisie, quantiteVendue, dureeVieKm, montant };

    lignes.push({
      reference,
      gammeTexte,
      gamme: reconnaitreGamme(gammeTexte),
      etablissement,
      typeSaisie,
      quantiteVendue,
      dureeVieKm,
      montant,
      grandeur: grandeurValorisee(source),
      uniteGrandeur: uniteValorisee(typeSaisie),
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
