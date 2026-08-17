import { DonneesActivite, releveVide } from '../../core/activity-data.service';

/**
 * Extraction des données d'activité d'un classeur.
 *
 * <p>Les états financiers ne suivent aucune forme imposée : un tableau annuel
 * en colonnes, un relevé d'un seul exercice en lignes, des intitulés français
 * ou anglais. La lecture repose donc sur des motifs, jamais sur des positions
 * de cellules — un classeur dont on aurait décalé une colonne cesserait sinon
 * d'être lisible sans que rien ne le signale.</p>
 *
 * <p>Fonctions pures, sans dépendance Angular : l'écran d'import et les tests
 * empruntent exactement le même chemin.</p>
 */

/** Grille de lecture : ce qu'un intitulé de ligne désigne. */
const MOTIFS: { champ: keyof DonneesActivite; motif: RegExp }[] = [
  // Les véhicules avant l'effectif : « nombre de véhicules » porte les deux
  // vocabulaires, et l'effectif capterait la ligne le premier.
  { champ: 'vehiculesFonction', motif: /v[ée]hicul|flotte|voiture|fleet|company car/i },
  { champ: 'chiffreAffairesM', motif: /chiffre d.?affaires|\bc\.?a\.?\b|revenue|turnover|sales revenue/i },
  { champ: 'effectif', motif: /effectif|salari|employ|headcount|\betp\b|personnel/i },
  { champ: 'production', motif: /production|produit|volume produit|units produced|fabriqu/i },
  { champ: 'ventes', motif: /vente|sold|units sold|quantit[ée] vendue/i }
];

/** Résultat d'une lecture de classeur. */
export interface ResultatExtraction {
  releves: DonneesActivite[];
  /** Intitulés reconnus, restitués à l'écran pour que la lecture soit vérifiable. */
  reconnus: string[];
  /** Ce que le classeur n'a pas permis de lire. */
  avertissements: string[];
}

/** Nombre exploitable d'une cellule ; `null` si la cellule n'en porte pas. */
export function nombreDeCellule(valeur: unknown): number | null {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null;

  const brut = String(valeur ?? '').trim();
  if (!brut) return null;

  // Les états financiers écrivent « 45 000 000,00 », « 45.000.000,00 » ou
  // « 45,000,000.00 » selon la place : les trois doivent se lire pareil.
  const nettoye = brut
    .replace(/[\s  ]/g, '')
    .replace(/[^\d,.\-]/g, '');

  if (!nettoye || !/\d/.test(nettoye)) return null;

  const derniereVirgule = nettoye.lastIndexOf(',');
  const dernierPoint = nettoye.lastIndexOf('.');

  let normalise: string;
  if (derniereVirgule > dernierPoint) {
    normalise = nettoye.replace(/\./g, '').replace(',', '.');
  } else if (dernierPoint > derniereVirgule) {
    normalise = nettoye.replace(/,/g, '');
  } else {
    normalise = nettoye.replace(/,/g, '');
  }

  const nombre = Number(normalise);
  return Number.isFinite(nombre) ? nombre : null;
}

/** Une cellule porte-t-elle un millésime plausible ? */
export function anneeDeCellule(valeur: unknown): number | null {
  const brut = String(valeur ?? '').trim();
  const trouve = brut.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  if (!trouve) return null;

  const annee = Number(trouve[1]);
  return annee >= 2000 && annee <= 2100 ? annee : null;
}

/** Champ désigné par un intitulé de ligne, ou `null` s'il reste inconnu. */
export function champDeLIntitule(intitule: unknown): keyof DonneesActivite | null {
  const brut = String(intitule ?? '').trim();
  if (!brut || brut.length > 120) return null;

  return MOTIFS.find(regle => regle.motif.test(brut))?.champ ?? null;
}

/**
 * Ligne d'en-tête portant les millésimes.
 *
 * <p>Une ligne n'est retenue que si elle porte au moins deux années
 * distinctes : un intitulé isolé du type « Bilan 2025 » n'ouvre pas un tableau
 * pluriannuel et ne doit pas être pris pour tel.</p>
 *
 * @returns la correspondance colonne → millésime, ou `null` à défaut.
 */
export function repererAnnees(lignes: unknown[][]): Map<number, number> | null {
  for (const ligne of lignes.slice(0, 12)) {
    const trouvees = new Map<number, number>();

    ligne.forEach((cellule, colonne) => {
      const annee = anneeDeCellule(cellule);
      if (annee !== null) trouvees.set(colonne, annee);
    });

    if (new Set(trouvees.values()).size >= 2) return trouvees;
  }

  return null;
}

/**
 * Lit un tableau de cellules et en tire les relevés d'activité.
 *
 * @param lignes   contenu du classeur, en tableau de tableaux.
 * @param exercice exercice de repli, quand le classeur ne porte aucun millésime.
 */
export function extraireActivite(lignes: unknown[][], exercice: number | null): ResultatExtraction {
  const reconnus: string[] = [];
  const avertissements: string[] = [];

  if (!lignes.length) {
    return { releves: [], reconnus, avertissements: ['Le fichier ne contient aucune donnée lisible.'] };
  }

  const colonnesAnnees = repererAnnees(lignes);
  const parAnnee = new Map<number, DonneesActivite>();

  const deposer = (annee: number, champ: keyof DonneesActivite, valeur: number) => {
    const releve = parAnnee.get(annee) ?? releveVide(annee);
    (releve as unknown as Record<string, unknown>)[champ] = valeur;
    parAnnee.set(annee, releve);
  };

  for (const ligne of lignes) {
    // L'intitulé est cherché sur toute la ligne : les classeurs comptables
    // laissent souvent une colonne de numérotation avant le libellé.
    let champ: keyof DonneesActivite | null = null;
    let colonneIntitule = -1;

    for (let colonne = 0; colonne < ligne.length && champ === null; colonne++) {
      const trouve = champDeLIntitule(ligne[colonne]);
      if (trouve) {
        champ = trouve;
        colonneIntitule = colonne;
      }
    }

    if (!champ) continue;
    reconnus.push(String(ligne[colonneIntitule]).trim());

    if (colonnesAnnees) {
      for (const [colonne, annee] of colonnesAnnees) {
        const valeur = nombreDeCellule(ligne[colonne]);
        if (valeur !== null) deposer(annee, champ, valeur);
      }
      continue;
    }

    // Aucun millésime au classeur : la première valeur de la ligne est portée
    // à l'exercice consulté, faute de quoi elle n'aurait nulle part où aller.
    const premiere = ligne
      .slice(colonneIntitule + 1)
      .map(nombreDeCellule)
      .find(valeur => valeur !== null);

    if (premiere === undefined) continue;

    if (exercice === null) {
      avertissements.push(
        `« ${String(ligne[colonneIntitule]).trim()} » a été lu, mais aucun exercice n'est `
        + 'sélectionné : choisissez une année avant d\'importer.'
      );
      continue;
    }

    deposer(exercice, champ, premiere);
  }

  if (!parAnnee.size && !avertissements.length) {
    avertissements.push(
      'Aucun intitulé reconnu. Le fichier doit comporter des lignes nommées « Chiffre '
      + 'd\'affaires », « Effectif », « Production » ou « Ventes ».'
    );
  }

  return {
    releves: [...parAnnee.values()].sort((a, b) => a.annee - b.annee),
    reconnus: [...new Set(reconnus)],
    avertissements
  };
}
