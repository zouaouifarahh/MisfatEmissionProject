import * as XLSX from 'xlsx';

/**
 * Lecture des suivis d'ordres de mission.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur les fichiers de production depuis un test.</p>
 */

/** Mission telle que lue du classeur, avant valorisation carbone. */
export interface LigneVoyageBrute {
  reference: string;
  numeroOM: string;
  personne: string;
  etablissement: string;
  destination: string;
  depart: string;
  modeTexte: string;
  dateOrdre: string;
  dateDebut: string;
  dateFin: string;
  nbrJours: number | null;
  distanceKm: number | null;
  montant: number | null;
  /** Grandeur portant le calcul, quelle que soit la colonne d'origine. */
  quantite: number | null;
  /** « Distance » ou « Montant », déduit du fichier ou de l'unité. */
  typeSaisie: 'Distance' | 'Montant';
  unite: string;
  devise: string;
  /** Champs optionnels remplacés par une valeur par défaut. */
  defautsAppliques: string[];
  ligneSource: number;
}

export interface ResultatLectureVoyages {
  feuille: string;
  ligneEnTete: number;
  colonnesReconnues: string[];
  /** Colonnes obligatoires absentes : la lecture s'arrête proprement. */
  colonnesManquantes: string[];
  /** Message prêt à afficher quand la feuille n'est pas exploitable. */
  avertissement: string;
  lignes: LigneVoyageBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Synonymes acceptés par colonne, du plus précis au plus général. */
const SYNONYMES: Record<string, string[]> = {
  reference: ['reference', 'ref'],
  numeroOM: ['n ordre de mission', 'no ordre de mission', 'ordre de mission', 'n om', 'om'],
  personne: ['voyageur', 'personne', 'employe', 'collaborateur', 'nom prenom', 'nom et prenom', 'nom'],
  etablissement: ['etablissement', 'site', 'usine'],
  mode: ['moyen de transport', 'mode de transport', 'transport', 'mode'],
  depart: ['provenance', 'ville de depart', 'origine'],
  destination: ['destination', 'pays', 'ville'],
  dateOrdre: ['date'],
  dateDebut: ['date debut', 'date de debut', 'date de depart'],
  dateFin: ['date fin', 'date de fin', 'retour', 'date de retour'],
  nbrJours: ['nbr jours', 'nombre de jours', 'nb jours', 'jours', 'duree'],
  typeSaisie: ['type saisie', 'type de saisie', 'type'],
  quantite: ['quantite'],
  distanceKm: ['distance en km', 'distance km', 'distance', 'km', 'kilometrage'],
  montant: ['montant facture', 'montant de la facture', 'montant', 'cout', 'frais'],
  unite: ['unite', 'unit'],
  devise: ['devise', 'monnaie']
};

/** Établissement retenu quand le classeur n'en désigne aucun. */
export const ETABLISSEMENT_DEFAUT = 'Site principal';

/**
 * Ordre d'attribution, du champ le plus spécifique au plus large.
 *
 * <p>« Date début » doit être servi avant « Date », sans quoi le repli par
 * préfixe de cette dernière s'en emparerait.</p>
 */
const ORDRE_CHAMPS = [
  'numeroOM', 'reference', 'dateDebut', 'dateFin', 'nbrJours', 'typeSaisie',
  'quantite', 'distanceKm', 'montant', 'unite', 'devise', 'etablissement',
  'mode', 'depart', 'personne', 'destination', 'dateOrdre'
];

/**
 * Une feuille de voyages doit au minimum identifier la mission et porter une
 * grandeur valorisable.
 */
const OBLIGATOIRES_IDENTITE = ['reference', 'numeroOM'];
const OBLIGATOIRES_GRANDEUR = ['quantite', 'distanceKm', 'montant'];

/**
 * Forme comparable d'un intitulé.
 *
 * <p>Les en-têtes de production portent accents, casse et espaces finaux —
 * « Distance en Km », « N° Ordre de Mission », « Nbr Jours ». Les comparer
 * bruts ferait échouer la reconnaissance.</p>
 */
export function normaliserEnTete(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
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

/** Date au format ISO court, quelle que soit sa représentation d'origine. */
export function texteDate(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';

  if (valeur instanceof Date && !isNaN(valeur.getTime())) {
    return valeur.toISOString().slice(0, 10);
  }
  if (typeof valeur === 'number') {
    const date = XLSX.SSF.parse_date_code(valeur);
    return date
      ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
      : '';
  }

  const texte = String(valeur).trim();
  if (!texte) return '';
  const analysee = new Date(texte);
  return isNaN(analysee.getTime()) ? texte : analysee.toISOString().slice(0, 10);
}

/**
 * Repère la ligne d'en-tête : celle qui reconnaît le plus de colonnes.
 *
 * <p>Le suivi des ordres de mission ouvre directement sur ses en-têtes, mais
 * d'autres classeurs les font précéder d'un titre : la détection ne présume
 * donc pas de la première ligne.</p>
 */
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

/**
 * Associe chaque champ attendu à son index de colonne.
 *
 * <p>Deux passes : correspondances exactes dans l'ordre de priorité, puis
 * correspondances par préfixe. Une colonne déjà attribuée n'est jamais
 * réutilisée.</p>
 */
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

/**
 * Colonnes obligatoires absentes d'une carte donnée.
 *
 * <p>Une identité de mission et une grandeur valorisable sont requises ; à
 * défaut, la feuille est refusée avec un message, jamais par une exception.</p>
 */
export function colonnesManquantes(carte: Record<string, number>): string[] {
  const manquantes: string[] = [];

  if (!OBLIGATOIRES_IDENTITE.some(champ => carte[champ] !== undefined)) {
    manquantes.push('Référence ou N° Ordre de Mission');
  }
  if (!OBLIGATOIRES_GRANDEUR.some(champ => carte[champ] !== undefined)) {
    manquantes.push('Distance en Km ou Montant');
  }
  return manquantes;
}

/** Lit la feuille de voyages la plus fournie d'un classeur. */
export function lireClasseurVoyages(classeur: XLSX.WorkBook): ResultatLectureVoyages | null {
  let meilleur: ResultatLectureVoyages | null = null;
  let refuse: ResultatLectureVoyages | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleVoyages(classeur.Sheets[nom], nom);
    if (!resultat) continue;

    if (resultat.colonnesManquantes.length) {
      // Une feuille refusée sert de diagnostic si aucune autre ne convient.
      if (!refuse) refuse = resultat;
      continue;
    }
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }

  return meilleur ?? refuse;
}

export function lireFeuilleVoyages(feuille: XLSX.WorkSheet, nom: string): ResultatLectureVoyages | null {
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
      avertissement: `Feuille « ${nom} » inexploitable : colonne(s) ${manquantes.join(' et ')} introuvable(s).`,
      lignes: [],
      rejets: []
    };
  }

  const lignes: LigneVoyageBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    const reference = texte(ligne, 'reference');
    const numeroOM = texte(ligne, 'numeroOM');
    const personne = texte(ligne, 'personne');

    // Les suivis se terminent par une ligne de total : distance renseignée mais
    // aucune identité de mission. La retenir gonflerait le bilan d'un doublon
    // de l'ensemble des trajets.
    if (!reference && !numeroOM && !personne) {
      rejets.push({ ligneSource, motif: 'ligne de total ou sans identité de mission' });
      return;
    }

    const distanceKm = nombreTolerant(cellule(ligne, 'distanceKm'));
    const montant = nombreTolerant(cellule(ligne, 'montant'));
    const quantiteLue = nombreTolerant(cellule(ligne, 'quantite'));

    if (distanceKm === null && montant === null && quantiteLue === null) {
      rejets.push({ ligneSource, motif: `mission ${reference || numeroOM} sans distance ni montant` });
      return;
    }

    const defautsAppliques: string[] = [];

    const etablissementLu = texte(ligne, 'etablissement');
    const etablissement = etablissementLu || ETABLISSEMENT_DEFAUT;
    if (!etablissementLu) defautsAppliques.push('établissement');

    // Le type de saisie se lit du fichier ; à défaut, la colonne renseignée le
    // désigne : un montant sans distance vaut valorisation monétaire.
    const typeLu = normaliserEnTete(texte(ligne, 'typeSaisie'));
    let typeSaisie: 'Distance' | 'Montant';
    if (/montant|cout|monetaire/.test(typeLu)) {
      typeSaisie = 'Montant';
    } else if (/distance|km/.test(typeLu)) {
      typeSaisie = 'Distance';
    } else {
      typeSaisie = distanceKm === null && montant !== null ? 'Montant' : 'Distance';
      defautsAppliques.push('type de saisie');
    }

    const quantite = typeSaisie === 'Montant'
      ? (montant ?? quantiteLue)
      : (distanceKm ?? quantiteLue);

    const devise = texte(ligne, 'devise');
    const uniteLue = texte(ligne, 'unite');
    const unite = uniteLue || (typeSaisie === 'Montant' ? (devise || 'TND') : 'km');
    if (!uniteLue) defautsAppliques.push('unité');

    lignes.push({
      reference,
      numeroOM,
      personne,
      etablissement,
      destination: texte(ligne, 'destination'),
      depart: texte(ligne, 'depart'),
      modeTexte: texte(ligne, 'mode'),
      dateOrdre: texteDate(cellule(ligne, 'dateOrdre')),
      dateDebut: texteDate(cellule(ligne, 'dateDebut')),
      dateFin: texteDate(cellule(ligne, 'dateFin')),
      nbrJours: nombreTolerant(cellule(ligne, 'nbrJours')),
      distanceKm,
      montant,
      quantite,
      typeSaisie,
      unite,
      devise,
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
