import * as XLSX from 'xlsx';

/**
 * Lecture tolérante des classeurs de suivi transport.
 *
 * <p>Fonctions pures, sans dépendance Angular : elles sont exécutables
 * directement sur les fichiers de production depuis un test.</p>
 */

/** Ligne de transport telle que lue du classeur, avant valorisation carbone. */
export interface LigneTransportBrute {
  numeroFacture: string;
  transporteur: string;
  destination: string;
  client: string;
  poidsKg: number | null;
  distanceTerrestreKm: number | null;
  distanceMaritimeKm: number | null;
  montant: number | null;
  dateDebut: string;
  dateFin: string;
  usine: string;
  /** Rang de la ligne dans la feuille, pour situer un rejet. */
  ligneSource: number;
}

export interface ResultatLecture {
  feuille: string;
  /** Index de la ligne d'en-tête retenue, base 0. */
  ligneEnTete: number;
  colonnesReconnues: string[];
  lignes: LigneTransportBrute[];
  /** Lignes écartées faute de donnée exploitable, avec leur motif. */
  rejets: { ligneSource: number; motif: string }[];
}

/**
 * Synonymes acceptés par colonne, du plus précis au plus général.
 *
 * <p>L'ordre est significatif : « Transporteur » porte le prestataire réel
 * (HBH, DACHSER) là où « Frs » désigne l'entité émettrice
 * (Misfat/SOLAUFIL Tunisie). Retenir le premier venu confondrait les deux.</p>
 */
const SYNONYMES: Record<string, string[]> = {
  facture: ['facture', 'n facture', 'no facture', 'num facture', 'ref', 'reference'],
  transporteur: ['transporteur', 'frs', 'fournisseur', 'prestataire'],
  pays: ['pays', 'destination'],
  client: ['clients', 'client', 'nom de livraison', 'nom de facturation'],
  poids: ['poids', 'poids kg', 'poids brut'],
  quantite: ['quantite'],
  distanceTerrestre: ['distance terrestre', 'distance', 'km', 'distance km'],
  distanceMaritime: ['distance maritime'],
  montant: ['montant de la facture', 'montant de la fac', 'montant'],
  dateDepart: ['date de depart', 'date depart', 'date'],
  dateLivraison: ['date de liv', 'date de livraison'],
  usine: ['usine', 'site']
};

/** Colonnes dont la présence atteste d'une feuille de transport. */
const COLONNES_PIVOT = ['facture', 'transporteur', 'pays', 'poids', 'montant'];

/**
 * Forme comparable d'un intitulé.
 *
 * <p>Les en-têtes de production portent accents, majuscules, espaces finaux et
 * ponctuation variable — « PAYS  », « Distance terrestre  », « N° déclaration ».
 * Les comparer bruts ferait échouer la reconnaissance.</p>
 */
export function normaliserEnTete(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Conversion numérique tolérante.
 *
 * <p>Absorbe les erreurs Excel propagées (`#N/A`, `#DIV/0!`), les séparateurs de
 * milliers y compris l'espace insécable, et la virgule décimale française. Rend
 * {@code null} plutôt que {@code NaN} : une valeur illisible doit se distinguer
 * d'un zéro mesuré.</p>
 */
export function nombreTolerant(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;
  if (valeur instanceof Date) return null;

  let texte = String(valeur).trim();
  if (!texte) return null;

  // Erreurs Excel et tirets de saisie : absence de donnée, pas zéro.
  if (/^#?(n\s*\/?\s*a|div\/0!?|value!?|ref!?|name\?|nul|null|neant|-{1,2})$/i.test(texte)) return null;

  texte = texte.replace(/[\s  ]/g, '');

  const derniereVirgule = texte.lastIndexOf(',');
  const dernierPoint = texte.lastIndexOf('.');
  if (derniereVirgule >= 0 && dernierPoint >= 0) {
    // Le séparateur le plus à droite porte les décimales ; l'autre les milliers.
    texte = derniereVirgule > dernierPoint
      ? texte.replace(/\./g, '').replace(',', '.')
      : texte.replace(/,/g, '');
  } else if (derniereVirgule >= 0) {
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
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    return '';
  }

  const texte = String(valeur).trim();
  if (!texte) return '';

  const analysee = new Date(texte);
  return isNaN(analysee.getTime()) ? texte : analysee.toISOString().slice(0, 10);
}

/**
 * Repère la vraie ligne d'en-tête.
 *
 * <p>Les classeurs de production ouvrent sur un logo, un titre ou une plage
 * fusionnée : la première ligne n'est presque jamais l'en-tête. La ligne retenue
 * est celle qui reconnaît le plus de colonnes parmi les trente premières.</p>
 */
export function detecterLigneEnTete(lignes: unknown[][], profondeur = 30): number {
  let meilleure = -1;
  let meilleurScore = 0;

  lignes.slice(0, profondeur).forEach((ligne, index) => {
    if (!Array.isArray(ligne)) return;

    const normalisees = ligne.map(normaliserEnTete).filter(Boolean);
    const score = Object.values(SYNONYMES)
      .filter(alias => normalisees.some(entete => alias.includes(entete)))
      .length;

    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = index;
    }
  });

  // Trois colonnes reconnues au moins : en deçà, la ligne n'est pas un en-tête.
  return meilleurScore >= 3 ? meilleure : -1;
}

/**
 * Ordre d'attribution des colonnes, du champ le plus spécifique au plus large.
 *
 * <p>« distance maritime » doit être servi avant « distance », faute de quoi le
 * repli par préfixe de ce dernier s'en emparerait.</p>
 */
const ORDRE_CHAMPS = [
  'facture', 'distanceMaritime', 'distanceTerrestre', 'montant', 'poids', 'quantite',
  'transporteur', 'pays', 'client', 'dateLivraison', 'dateDepart', 'usine'
];

/**
 * Associe chaque champ attendu à son index de colonne, quand il existe.
 *
 * <p>Deux passes : les correspondances exactes d'abord, dans l'ordre de priorité
 * des synonymes, puis les correspondances par préfixe pour les champs restés
 * sans colonne. Une colonne déjà attribuée n'est jamais réutilisée.</p>
 */
export function mapperColonnes(enTetes: unknown[]): Record<string, number> {
  const normalisees = enTetes.map(normaliserEnTete);
  const carte: Record<string, number> = {};
  const prises = new Set<number>();

  const attribuer = (champ: string, index: number) => {
    carte[champ] = index;
    prises.add(index);
  };

  for (const champ of ORDRE_CHAMPS) {
    for (const alias of SYNONYMES[champ] ?? []) {
      const index = normalisees.findIndex((entete, i) => entete === alias && !prises.has(i));
      if (index >= 0) { attribuer(champ, index); break; }
    }
  }

  for (const champ of ORDRE_CHAMPS) {
    if (carte[champ] !== undefined) continue;
    for (const alias of SYNONYMES[champ] ?? []) {
      const index = normalisees.findIndex(
        (entete, i) => entete && entete.startsWith(alias) && !prises.has(i)
      );
      if (index >= 0) { attribuer(champ, index); break; }
    }
  }

  return carte;
}

/** Une feuille est exploitable si elle porte au moins deux colonnes pivots. */
export function estFeuilleTransport(carte: Record<string, number>): boolean {
  return COLONNES_PIVOT.filter(champ => carte[champ] !== undefined).length >= 2;
}

/**
 * Lit la première feuille exploitable d'un classeur.
 *
 * <p>Les classeurs de suivi comportent des tableaux croisés en tête de fichier :
 * les feuilles sont donc évaluées l'une après l'autre, et celle qui compte le
 * plus de lignes de détail l'emporte sur un croisement de synthèse.</p>
 */
export function lireClasseur(classeur: XLSX.WorkBook): ResultatLecture | null {
  let meilleur: ResultatLecture | null = null;

  for (const nom of classeur.SheetNames) {
    const resultat = lireFeuille(classeur.Sheets[nom], nom);
    if (!resultat) continue;
    if (!meilleur || resultat.lignes.length > meilleur.lignes.length) meilleur = resultat;
  }
  return meilleur;
}

export function lireFeuille(feuille: XLSX.WorkSheet, nom: string): ResultatLecture | null {
  const brut = XLSX.utils.sheet_to_json<unknown[]>(feuille, {
    header: 1, defval: null, blankrows: false, raw: true
  });
  if (!brut.length) return null;

  const ligneEnTete = detecterLigneEnTete(brut);
  if (ligneEnTete < 0) return null;

  const carte = mapperColonnes(brut[ligneEnTete]);
  if (!estFeuilleTransport(carte)) return null;

  const lignes: LigneTransportBrute[] = [];
  const rejets: { ligneSource: number; motif: string }[] = [];

  const cellule = (ligne: unknown[], champ: string) => {
    const index = carte[champ];
    return index === undefined ? null : ligne[index] ?? null;
  };
  const texte = (ligne: unknown[], champ: string) => String(cellule(ligne, champ) ?? '').trim();

  brut.slice(ligneEnTete + 1).forEach((ligne, decalage) => {
    const ligneSource = ligneEnTete + 2 + decalage;
    if (!Array.isArray(ligne) || ligne.every(c => c === null || String(c).trim() === '')) return;

    // Le poids porte le calcul physique ; « Quantité » compte des pièces et ne
    // sert de repli que si la feuille ne documente aucun poids.
    const poids = nombreTolerant(cellule(ligne, 'poids'))
      ?? (carte['poids'] === undefined ? nombreTolerant(cellule(ligne, 'quantite')) : null);
    const montant = nombreTolerant(cellule(ligne, 'montant'));

    if (poids === null && montant === null) {
      rejets.push({ ligneSource, motif: 'ni poids ni montant exploitable' });
      return;
    }

    lignes.push({
      numeroFacture: texte(ligne, 'facture'),
      transporteur: texte(ligne, 'transporteur'),
      destination: texte(ligne, 'pays'),
      client: texte(ligne, 'client'),
      poidsKg: poids,
      distanceTerrestreKm: nombreTolerant(cellule(ligne, 'distanceTerrestre')),
      distanceMaritimeKm: nombreTolerant(cellule(ligne, 'distanceMaritime')),
      montant,
      dateDebut: texteDate(cellule(ligne, 'dateDepart')),
      dateFin: texteDate(cellule(ligne, 'dateLivraison')),
      usine: texte(ligne, 'usine'),
      ligneSource
    });
  });

  return {
    feuille: nom,
    ligneEnTete,
    colonnesReconnues: Object.keys(carte),
    lignes,
    rejets
  };
}
