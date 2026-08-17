import * as XLSX from 'xlsx';

/**
 * Lecture des relevés de déchets, organisés en matrice mensuelle.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur les fichiers de production depuis un test.</p>
 */

/** Ligne de déchet telle que lue du classeur, avant valorisation carbone. */
export interface LigneDechetBrute {
  /** Libellé nettoyé de son unité : « Déchet plastic ». */
  typeDechet: string;
  /** Libellé d'origine, unité comprise : « Déchet plastic (T) ». */
  libelleComplet: string;
  /** Unité déduite du libellé : T, Pc, L, m³ — vide si indéterminable. */
  unite: string;
  /** Douze positions, `null` pour un mois non renseigné. */
  quantitesMensuelles: (number | null)[];
  quantiteTotale: number | null;
  moisRenseignes: number;
  /** Vrai quand la quantité provient d'une mention « Estimé… ». */
  estimation: boolean;
  /** Texte d'origine de l'estimation, conservé comme justification. */
  noteEstimation: string;
  /** Recyclage interne, externe, ou absence de recyclage. */
  traitement: string;
  prestataire: string;
  reutilise: string;
  ligneSource: number;
}

export interface ResultatLectureDechets {
  feuille: string;
  ligneEnTete: number;
  /** Année portée par le classeur, quand elle précède l'en-tête. */
  annee: number | null;
  moisDetectes: number;
  lignes: LigneDechetBrute[];
  rejets: { ligneSource: number; motif: string }[];
}

/** Mois attendus en colonnes, sous leur forme normalisée. */
const MOIS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'
];

/** Colonnes de métadonnées, en fin de ligne. */
const META = {
  traitement: ['recyclage int ext', 'recyclage', 'traitement', 'filiere'],
  prestataire: ['prestataire de recuperation', 'prestataire', 'recuperateur'],
  reutilise: ['reutilise oui non', 'reutilise', 'reutilisation']
};

/**
 * Forme comparable d'un intitulé.
 *
 * <p>Le classeur de production porte « Reçyclage Int. / Ext. » avec une cédille
 * fautive et « Aout » sans circonflexe : comparer les chaînes brutes ferait
 * échouer la reconnaissance.</p>
 */
export function normaliser(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Conversion numérique tolérante des cellules de quantité.
 *
 * <p>Les relevés mêlent nombres et commentaires : « Estimé 6000 m3 »,
 * « Estimé à 1 T en 2025 (…) ». Le premier nombre du texte porte la quantité ;
 * l'année qui suit ne doit jamais être confondue avec elle.</p>
 */
export function quantiteTolerante(valeur: unknown): { valeur: number | null; estimation: boolean; note: string } {
  if (valeur === null || valeur === undefined) return { valeur: null, estimation: false, note: '' };

  if (typeof valeur === 'number') {
    return { valeur: Number.isFinite(valeur) ? valeur : null, estimation: false, note: '' };
  }

  const texte = String(valeur).trim();
  if (!texte) return { valeur: null, estimation: false, note: '' };

  if (/^#?(n\s*\/?\s*a|div\/0!?|value!?|ref!?|-{1,2})$/i.test(texte)) {
    return { valeur: null, estimation: false, note: '' };
  }

  // Un texte porteur d'une mention d'estimation reste une donnée exploitable :
  // l'ignorer ferait disparaître des flux entiers du bilan.
  const estimation = /estim/i.test(texte);

  const premierNombre = texte
    .replace(/[  ]/g, ' ')
    .match(/-?\d+(?:[.,]\d+)?/);

  if (!premierNombre) return { valeur: null, estimation, note: estimation ? texte : '' };

  const nombre = Number(premierNombre[0].replace(',', '.'));
  return {
    valeur: Number.isFinite(nombre) ? nombre : null,
    estimation,
    note: estimation ? texte : ''
  };
}

/**
 * Sépare le libellé du déchet de son unité.
 *
 * <p>Les unités sont portées par le libellé lui-même — « Déchet plastic (T) »,
 * « Huiles usées (L) », « Eaux usées m3 » — et non par une colonne dédiée.</p>
 */
export function extraireUnite(libelle: string): { type: string; unite: string } {
  const texte = String(libelle ?? '').trim();
  if (!texte) return { type: '', unite: '' };

  const entreParentheses = texte.match(/\(([^)]{1,6})\)\s*$/);
  if (entreParentheses) {
    return {
      type: texte.slice(0, entreParentheses.index).trim(),
      unite: normaliserUnite(entreParentheses[1])
    };
  }

  const suffixe = texte.match(/\b(m3|m³|tonnes?|kg|litres?|pcs?)\s*$/i);
  if (suffixe) {
    return {
      type: texte.slice(0, suffixe.index).trim(),
      unite: normaliserUnite(suffixe[1])
    };
  }

  return { type: texte, unite: '' };
}

/** Forme canonique d'une unité, pour le rapprochement au référentiel. */
export function normaliserUnite(brute: string): string {
  const unite = normaliser(brute);
  if (/^(t|tonne|tonnes)$/.test(unite)) return 'Tonne';
  if (/^(l|litre|litres)$/.test(unite)) return 'L';
  if (/^(m3|m 3)$/.test(unite)) return 'm³';
  if (/^(pc|pcs|piece|pieces)$/.test(unite)) return 'Pc';
  if (/^(kg)$/.test(unite)) return 'kg';
  return brute.trim();
}

/**
 * Repère la ligne d'en-tête : celle qui aligne le plus de mois.
 *
 * <p>Le classeur ouvre sur un titre puis sur l'année ; la première ligne n'est
 * donc jamais l'en-tête.</p>
 */
export function detecterLigneEnTete(lignes: unknown[][], profondeur = 20): number {
  let meilleure = -1;
  let meilleurScore = 0;

  lignes.slice(0, profondeur).forEach((ligne, index) => {
    if (!Array.isArray(ligne)) return;
    const normalisees = ligne.map(normaliser);
    const score = MOIS.filter(mois => normalisees.includes(mois)).length;
    if (score > meilleurScore) { meilleurScore = score; meilleure = index; }
  });

  // Six mois au moins : en deçà, la ligne n'est pas un en-tête mensuel.
  return meilleurScore >= 6 ? meilleure : -1;
}

/** Année portée par les lignes précédant l'en-tête, si elle y figure seule. */
export function detecterAnnee(lignes: unknown[][], ligneEnTete: number): number | null {
  for (let i = 0; i < ligneEnTete; i++) {
    for (const cellule of lignes[i] ?? []) {
      const annee = Number(String(cellule ?? '').trim());
      if (Number.isInteger(annee) && annee >= 2000 && annee <= 2100) return annee;
    }
  }
  return null;
}

/** Index de colonne de chaque mois, et des trois métadonnées de fin de ligne. */
export function mapperColonnes(enTetes: unknown[]): {
  mois: number[];
  traitement: number;
  prestataire: number;
  reutilise: number;
} {
  const normalisees = enTetes.map(normaliser);

  const mois = MOIS.map(nom => normalisees.indexOf(nom));

  const chercher = (alias: string[]) => {
    for (const a of alias) {
      const index = normalisees.findIndex(entete => entete === a);
      if (index >= 0) return index;
    }
    for (const a of alias) {
      const index = normalisees.findIndex(entete => entete && entete.startsWith(a));
      if (index >= 0) return index;
    }
    return -1;
  };

  return {
    mois,
    traitement: chercher(META.traitement),
    prestataire: chercher(META.prestataire),
    reutilise: chercher(META.reutilise)
  };
}

/** Lit la première feuille portant une matrice mensuelle de déchets. */
export function lireClasseurDechets(classeur: XLSX.WorkBook): ResultatLectureDechets | null {
  let meilleur: ResultatLectureDechets | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuilleDechets(classeur.Sheets[nom], nom);
    if (!resultat) continue;
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }
  return meilleur;
}

export function lireFeuilleDechets(feuille: XLSX.WorkSheet, nom: string): ResultatLectureDechets | null {
  const brut = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1, defval: null, blankrows: false, raw: true
  });
  if (!brut.length) return null;

  const ligneEnTete = detecterLigneEnTete(brut);
  if (ligneEnTete < 0) return null;

  const carte = mapperColonnes(brut[ligneEnTete]);
  const moisDetectes = carte.mois.filter(i => i >= 0).length;

  const lignes: LigneDechetBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];

  const texte = (ligne: unknown[], index: number) =>
    index >= 0 ? String(ligne[index] ?? '').trim() : '';

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne)) return;

    const libelle = String(ligne[0] ?? '').trim();
    // Les lignes de total en pied de tableau n'ont pas de libellé : les retenir
    // compterait deux fois les tonnages.
    if (!libelle) return;

    const { type, unite } = extraireUnite(libelle);

    const quantitesMensuelles: (number | null)[] = [];
    let estimation = false;
    let noteEstimation = '';

    carte.mois.forEach(index => {
      if (index < 0) { quantitesMensuelles.push(null); return; }
      const lue = quantiteTolerante(ligne[index]);
      if (lue.estimation) {
        estimation = true;
        if (!noteEstimation) noteEstimation = lue.note;
      }
      quantitesMensuelles.push(lue.valeur);
    });

    const renseignes = quantitesMensuelles.filter(q => q !== null);
    if (!renseignes.length) {
      rejets.push({ ligneSource, motif: `« ${libelle} » sans quantité mensuelle exploitable` });
      return;
    }

    lignes.push({
      typeDechet: type,
      libelleComplet: libelle,
      unite,
      quantitesMensuelles,
      quantiteTotale: renseignes.reduce((somme, q) => somme + (q ?? 0), 0),
      moisRenseignes: renseignes.length,
      estimation,
      noteEstimation,
      traitement: texte(ligne, carte.traitement),
      prestataire: texte(ligne, carte.prestataire),
      reutilise: texte(ligne, carte.reutilise),
      ligneSource
    });
  });

  return {
    feuille: nom,
    ligneEnTete,
    annee: detecterAnnee(brut, ligneEnTete),
    moisDetectes,
    lignes,
    rejets
  };
}
