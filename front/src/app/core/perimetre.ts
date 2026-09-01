/**
 * Étanchéité du périmètre : société et exercice.
 *
 * <p>Toute restitution — tableau de bord, écran de catégorie, rapport — répond
 * à la combinaison stricte <em>[société sélectionnée] ET [exercice
 * sélectionné]</em>. Choisir « MISFAT TUNISIE » et « 2024 » ne doit laisser
 * remonter aucune mesure de 2025, ni d'une autre société : deux sociétés ne
 * partagent pas leurs émissions, et deux exercices ne se mélangent pas.</p>
 *
 * <p>La valeur {@code null} vaut « toutes » : elle porte la vue consolidée
 * groupe et la vue pluriannuelle. Ce n'est pas un relâchement de la règle, c'est
 * un périmètre plus large explicitement demandé.</p>
 *
 * <p>Fonctions pures, sans dépendance Angular : les écrans, les services et les
 * tests empruntent exactement le même chemin.</p>
 */

/** Périmètre consulté, tel que l'en-tête le définit. */
export interface Perimetre {
  /** Société retenue ; `null` en vue consolidée groupe. */
  entityId: number | null;
  /** Exercice retenu ; `null` en vue pluriannuelle. */
  annee: number | null;
}

/** Forme comparable d'un libellé d'organisation, accents et casse ôtés. */
function normaliser(libelle: string | null | undefined): string {
  return String(libelle ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Chiffres romains des numéros de site, ramenés à leur écriture décimale. */
const ROMAINS: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5',
  VI: '6', VII: '7', VIII: '8', IX: '9', X: '10'
};

/**
 * Mots qui ne distinguent pas un établissement d'un autre.
 *
 * <p>Indicatifs de pays, pays écrits en toutes lettres, formes juridiques et
 * mots de remplissage : « TN MISFAT TUNISIE » et « Usine Misfat » désignent la
 * même enseigne, et rien dans ces mots ne permet de les départager.</p>
 */
const MOTS_NEUTRES =
  /^(TN|FR|MA|DZ|IT|ES|EU|SA|SARL|SAS|SPA|GROUPE|GROUP|USINE|SITE|TUNISIE|TUNISIA|FRANCE|MAROC|MOROCCO|ALGERIE|ITALIE|ESPAGNE|EUROPE)$/;

/**
 * Jetons distinctifs d'un libellé d'établissement.
 *
 * <p>Les saisies écrivent « Misfat 1 », l'organigramme « MISFAT I » : les
 * chiffres romains sont ramenés à leur écriture décimale pour que les deux
 * formes se rejoignent. Le numéro de site, lui, est conservé — c'est
 * précisément ce qui distingue MISFAT I de MISFAT II, et le perdre reviendrait
 * à confondre deux usines.</p>
 */
function jetonsEtablissement(libelle: string | null | undefined): string[] {
  return normaliser(libelle)
    .split(' ')
    .map(mot => ROMAINS[mot] ?? mot)
    .filter(mot => mot.length > 0 && !MOTS_NEUTRES.test(mot));
}

/**
 * Deux libellés désignent-ils le même établissement ?
 *
 * <p>Le rapprochement est exact sur les jetons distinctifs, jamais approchant :
 * une correspondance par simple inclusion ferait passer les lignes de MISFAT II
 * pour celles de MISFAT I, et deux usines d'un même groupe verraient leurs
 * émissions se mélanger.</p>
 */
export function memeEtablissement(gauche: string | null | undefined,
                                  droite: string | null | undefined): boolean {
  const a = jetonsEtablissement(gauche);
  const b = jetonsEtablissement(droite);
  if (!a.length || !b.length) return false;

  return a.join('') === b.join('');
}

/**
 * Année portée par une date, quelle que soit son écriture.
 *
 * <p>Deux formes cohabitent dans les données. Les périodes saisies sont en
 * écriture ISO, l'année en tête — c'est ce que rend un champ `type="date"`. Les
 * horodatages de création, eux, sont posés par le pipe `date` d'Angular en
 * écriture française : « 15/03/2026 09:12 », l'année en troisième position.</p>
 *
 * <p>Seule la première était lue. Le repli documenté — « à défaut de période, la
 * date de création sert de rattachement » — ne fonctionnait donc pour aucune
 * ligne : toutes portent un horodatage français. Une ligne sans période n'avait
 * aucun exercice et se trouvait écartée de <strong>tout</strong> bilan daté,
 * quel que soit le millésime consulté. C'est ce qui laissait des écrans vides
 * sous une bannière annonçant des milliers de lignes.</p>
 *
 * @returns l'année, ou `null` si la valeur n'en documente aucune.
 */
export function anneeDeDate(valeur: unknown): number | null {
  const texte = String(valeur ?? '').trim();
  if (!texte) return null;

  // Écriture ISO : l'année ouvre la chaîne.
  const iso = /^(\d{4})/.exec(texte);

  // Écriture française : l'année vient après le jour et le mois. Le millésime
  // sur deux chiffres n'est pas repris — « 15/03/26 » se lirait aussi bien
  // 1926 que 2026, et trancher daterait la ligne au jugé.
  const francaise = /^\d{1,2}[/-]\d{1,2}[/-](\d{4})\b/.exec(texte);

  const annee = Number(iso?.[1] ?? francaise?.[1]);
  return Number.isFinite(annee) && annee >= 1900 && annee <= 2200 ? annee : null;
}

/**
 * Exercices auxquels une ligne se rattache.
 *
 * <p>La période de la ligne fait foi : une consommation courant de décembre
 * 2024 à janvier 2025 documente les deux exercices, et doit remonter sur l'un
 * comme sur l'autre. À défaut de période, la date de création sert de
 * rattachement : c'est la seule information dont la ligne dispose, et laisser
 * une saisie sans exercice reviendrait à la faire disparaître de toutes les
 * vues datées.</p>
 */
export function exercicesDeLaLigne(ligne: Record<string, unknown>): number[] {
  const annees = new Set<number>();

  for (const champ of ['dateDebut', 'dateFin']) {
    const annee = anneeDeDate(ligne[champ]);
    if (annee !== null) annees.add(annee);
  }

  if (!annees.size) {
    const creation = anneeDeDate(ligne['creeLe']);
    if (creation !== null) annees.add(creation);
  }

  return [...annees];
}

/**
 * La ligne relève-t-elle de l'exercice consulté ?
 *
 * <p>Un exercice non renseigné vaut « tous ». Une ligne qu'aucune date ne
 * rattache à un exercice est écartée dès qu'un exercice est demandé : la
 * rattacher d'office au millésime affiché lui prêterait une date qu'elle n'a
 * pas, et gonflerait le bilan de l'année consultée.</p>
 */
export function releveDeLExercice(ligne: Record<string, unknown>, annee: number | null): boolean {
  if (annee === null) return true;
  const exercices = exercicesDeLaLigne(ligne);
  return exercices.length > 0 && exercices.includes(annee);
}

/**
 * Société portée par la ligne, si elle en porte une.
 *
 * <p>Les lignes enregistrées avant l'estampillage n'en portent pas : elles
 * retombent sur le rapprochement par établissement, et à défaut restent sans
 * rattachement — état que les écrans annoncent plutôt que de le trancher.</p>
 */
export function societeDeLaLigne(ligne: Record<string, unknown>): number | null {
  const brut = ligne['societeId'];
  if (brut === null || brut === undefined || brut === '') return null;

  const societe = Number(brut);
  return Number.isFinite(societe) && societe > 0 ? societe : null;
}

/**
 * La ligne peut-elle être rattachée à une société ?
 *
 * <p>Ni société estampillée, ni établissement nommé : rien ne permet de dire à
 * qui elle appartient. L'écran la compte à part pour pouvoir le dire — la
 * masquer sans un mot la ferait passer pour perdue.</p>
 */
export function ligneRattachable(ligne: Record<string, unknown>): boolean {
  return societeDeLaLigne(ligne) !== null
    || String(ligne['etablissement'] ?? '').trim().length > 0;
}

/** Périmètre organisationnel résolu : les établissements de la société retenue. */
export interface PerimetreOrganisation {
  /** Société retenue ; `null` en vue consolidée groupe. */
  entityId: number | null;
  /** Noms des usines rattachées à la société retenue. */
  etablissements: string[];
  /**
   * Le groupe ne compte-t-il qu'une seule société ?
   *
   * <p>Alors une ligne sans établissement identifiable ne peut appartenir qu'à
   * elle : l'écarter ferait perdre la donnée sans qu'aucune ambiguïté ne le
   * justifie.</p>
   */
  societeUnique: boolean;
}

/** Périmètre ouvert : aucune restriction de société. */
export const ORGANISATION_GROUPE: PerimetreOrganisation = {
  entityId: null, etablissements: [], societeUnique: false
};

/**
 * La ligne relève-t-elle de la société consultée ?
 *
 * <p>Le rapprochement se fait sur le nom de l'établissement, seule information
 * de rattachement que les écrans de saisie conservent. Une ligne dont
 * l'établissement n'appartient pas à la société est écartée sans appel.</p>
 */
export function releveDeLaSociete(ligne: Record<string, unknown>,
                                  organisation: PerimetreOrganisation): boolean {
  if (organisation.entityId === null) return true;

  // La société portée par la ligne fait foi, quand elle en porte une. C'est le
  // seul rattachement certain : le nom d'usine est une donnée de saisie, et
  // plusieurs écrans — franchises, investissements — n'en demandent aucune.
  // Sans ce degré, leurs lignes ne pourraient jamais être cloisonnées.
  const societe = societeDeLaLigne(ligne);
  if (societe !== null) return societe === organisation.entityId;

  const etablissement = String(ligne['etablissement'] ?? '').trim();

  // Sans établissement, le rattachement n'est certain que si le groupe ne
  // compte qu'une société : sinon la ligne pourrait relever de n'importe
  // laquelle, et l'attribuer serait un choix arbitraire.
  if (!etablissement) return organisation.societeUnique;

  // Organigramme inconnu — service injoignable ou société sans usine déclarée :
  // rien ne permet de vérifier le rattachement. La ligne n'est retenue que
  // s'il n'existe aucune autre société à laquelle elle pourrait appartenir.
  if (!organisation.etablissements.length) return organisation.societeUnique;

  return organisation.etablissements.some(nom => memeEtablissement(nom, etablissement));
}

/** La ligne relève-t-elle du périmètre complet [société ET exercice] ? */
export function releveDuPerimetre(ligne: Record<string, unknown>,
                                  annee: number | null,
                                  organisation: PerimetreOrganisation = ORGANISATION_GROUPE): boolean {
  return releveDeLExercice(ligne, annee) && releveDeLaSociete(ligne, organisation);
}
