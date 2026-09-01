/**
 * Exercice porté par une cellule de classeur.
 *
 * <p>Un inventaire couvre souvent plusieurs années dans un même fichier : une
 * base d'immobilisations liste les acquisitions de 2024, 2025 et 2026 côte à
 * côte. L'import ne lisait aucune date de ligne — il datait le lot entier du
 * millésime lu dans le nom du fichier —, si bien qu'un classeur pluriannuel
 * versait tout sur une seule année. Les autres exercices n'étaient pas perdus :
 * ils étaient rangés sous une année qu'ils ne documentent pas, ce qui est pire,
 * car le total reste plausible.</p>
 *
 * <p>Ce module ne fait que lire. Il ne devine pas : une cellule qu'il ne sait
 * pas interpréter rend {@code null}, et c'est à l'appelant de décider du repli
 * — le millésime du classeur, puis l'exercice consulté.</p>
 */

/** Bornes au-delà desquelles une année n'est plus un exercice plausible. */
const PLUS_ANCIEN = 2000;
const PLUS_RECENT = 2100;

/** L'année est-elle un exercice possible ? */
function exercicePlausible(annee: number): boolean {
  return Number.isFinite(annee) && annee >= PLUS_ANCIEN && annee <= PLUS_RECENT;
}

/**
 * Origine du jour zéro des dates Excel, en millisecondes Unix.
 *
 * <p>Le tableur compte les jours depuis le 30 décembre 1899. Le décalage de
 * deux jours par rapport au 1er janvier 1900 n'est pas une erreur de ce
 * module : il compense l'année 1900 que le tableur tient à tort pour
 * bissextile, et qu'il faut reproduire pour retomber sur ses dates.</p>
 */
const ORIGINE_EXCEL = Date.UTC(1899, 11, 30);
const MS_PAR_JOUR = 86_400_000;

/**
 * Exercice documenté par une cellule, quelle que soit son écriture.
 *
 * <p>Quatre formes se rencontrent dans les classeurs de l'exploitant : la date
 * lue comme telle par le lecteur de tableur, le numéro de série du tableur, la
 * date écrite en toutes lettres — française ou ISO —, et l'année seule.</p>
 *
 * @returns l'exercice, ou `null` si la cellule n'en documente aucun.
 */
export function exerciceDeCellule(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;

  // Le lecteur est configuré pour rendre de vraies dates : c'est le cas le plus
  // sûr, et il ne demande aucune interprétation.
  if (valeur instanceof Date) {
    const annee = valeur.getFullYear();
    return exercicePlausible(annee) ? annee : null;
  }

  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    // Une année pleine s'écrit parfois telle quelle dans une colonne de date.
    if (exercicePlausible(valeur) && Number.isInteger(valeur)) return valeur;

    // Sinon, un numéro de série de tableur. En deçà d'un an, ce n'est pas une
    // date mais une durée ou un montant, et l'interpréter serait inventer.
    if (valeur < 366) return null;

    const annee = new Date(ORIGINE_EXCEL + valeur * MS_PAR_JOUR).getUTCFullYear();
    return exercicePlausible(annee) ? annee : null;
  }

  const texte = String(valeur).trim();
  if (!texte) return null;

  // Écriture ISO : l'année ouvre la chaîne.
  const iso = /^(\d{4})[-/]\d{1,2}[-/]\d{1,2}/.exec(texte);
  if (iso) {
    const annee = Number(iso[1]);
    return exercicePlausible(annee) ? annee : null;
  }

  // Écriture française : l'année ferme la chaîne. Un millésime sur deux
  // chiffres n'est pas repris — « 03/25 » désigne aussi bien mars 2025 qu'un
  // rapport, et le lever au hasard daterait la ligne au jugé.
  const francaise = /^\d{1,2}[-/]\d{1,2}[-/](\d{4})\b/.exec(texte);
  if (francaise) {
    const annee = Number(francaise[1]);
    return exercicePlausible(annee) ? annee : null;
  }

  // Année seule, éventuellement entourée d'espaces ou d'un libellé court.
  const seule = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(texte);
  if (seule) {
    const annee = Number(seule[1]);
    return exercicePlausible(annee) ? annee : null;
  }

  return null;
}

/**
 * Exercice retenu pour une ligne, replis compris.
 *
 * <p>Trois degrés, du plus documenté au plus supposé : la date portée par la
 * ligne, le millésime du classeur, puis l'exercice consulté. Le dernier est
 * une convention assumée — une ligne sans date doit bien être rattachée quelque
 * part — et non une lecture de la donnée.</p>
 */
export function exerciceRetenu(
  dateLigne: unknown,
  exerciceDuClasseur: number | null,
  exerciceConsulte: number | null
): number | null {
  return exerciceDeCellule(dateLigne) ?? exerciceDuClasseur ?? exerciceConsulte;
}
