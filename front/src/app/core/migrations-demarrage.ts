import { CLES_PAR_CATEGORIE, signalerMesuresLocalesModifiees } from '../shared/dispatch/mesures-locales';
import { migrationFaite, marquerMigration } from './appariement-referentiel';
import {
  CLE_STOCKAGE as CLE_DISPATCH, exerciceDepuisNom
} from '../shared/dispatch/cle-dispatch';
import {
  MARQUEUR_RECALCUL_ECHELLE, recalculerEchelle, LigneRecalculable
} from '../components/transport-amont/recalcul-echelle';

/**
 * Reprises jouées à l'ouverture de l'application.
 *
 * <p>Une correction de formule ne corrige que les calculs à venir : les lignes
 * déjà enregistrées portent leur émission telle qu'elle a été calculée à la
 * saisie, et le stockage du navigateur ne se recalcule pas tout seul. Tant
 * qu'une seule ligne résiduelle subsiste, elle peut porter une filiale
 * au-dessus du million de tonnes et laisser le bandeau d'invraisemblance
 * allumé sur une cause pourtant réparée.</p>
 *
 * <p>La reprise était jouée par l'écran du transport amont, donc seulement si
 * l'utilisateur s'y rendait. Un bilan faux restait affiché au tableau de bord
 * aussi longtemps qu'il n'ouvrait pas cet écran-là — c'est-à-dire, pour qui
 * consulte le bilan sans saisir, indéfiniment. Elle est désormais jouée au
 * démarrage : le stockage est repris avant que quoi que ce soit ne l'affiche.</p>
 *
 * <p>Chaque reprise porte son marqueur versionné et ne repasse pas. Aucune ne
 * doit interrompre le démarrage : une exception ici priverait l'utilisateur de
 * toute l'application pour une donnée qu'il n'a peut-être même pas.</p>
 */

/** Lignes d'une catégorie, relues sans supposer leur forme. */
function relire(cle: string): unknown[] {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return [];
    const relu = JSON.parse(brut);
    return Array.isArray(relu) ? relu : [];
  } catch {
    return [];
  }
}

/**
 * Rejoue l'échelle massique sur les lignes de transport amont.
 *
 * <p>Le poids en kilogrammes était multiplié par un facteur publié à la tonne :
 * mille fois trop haut. La reprise relit le poids, la distance, le montant et
 * le facteur que la ligne porte déjà — elle recalcule, elle n'invente rien et
 * ne réapparie pas.</p>
 *
 * @returns le nombre de lignes dont l'émission a changé.
 */
function reprendreEchelleTransportAmont(): number {
  if (migrationFaite(MARQUEUR_RECALCUL_ECHELLE)) return 0;

  const cle = CLES_PAR_CATEGORIE['transport-amont'];
  const lignes = relire(cle) as LigneRecalculable[];

  if (!lignes.length) {
    marquerMigration(MARQUEUR_RECALCUL_ECHELLE);
    return 0;
  }

  const bilan = recalculerEchelle(lignes);

  if (bilan.reprises) {
    try {
      localStorage.setItem(cle, JSON.stringify(bilan.lignes));
    } catch {
      // Stockage saturé : la reprise se rejouera au prochain démarrage, le
      // marqueur n'étant posé qu'après une écriture réussie.
      return 0;
    }
  }

  marquerMigration(MARQUEUR_RECALCUL_ECHELLE);
  return bilan.reprises;
}

/** Marqueur de la reprise des périodes, versionné. */
export const MARQUEUR_PERIODE_2025 = 'misfat_periode_retroactive_2025_v1';

/** Exercice attribué aux lignes antérieures, arbitré par l'exploitant. */
const PERIODE_RETROACTIVE = { dateDebut: '2025-01-01', dateFin: '2025-12-31' };

/**
 * Attribue l'exercice 2025 aux lignes dépourvues de période.
 *
 * <p>Huit écrans du Scope 3 ne portaient aucune période. Leur date de création
 * est écrite en français — « 15/03/2026 09:12 » — que le lecteur d'exercice ne
 * sait pas interpréter : il attend une année en tête. Ces lignes n'avaient donc
 * <strong>aucun</strong> exercice, et se trouvaient écartées de tout bilan daté
 * — pas rattachées à la mauvaise année, mais invisibles. C'est ce qui laissait
 * plusieurs postes du Scope 3 à zéro pour cent alors que les tables étaient
 * pleines.</p>
 *
 * <p>La période retenue vient d'un arbitrage de l'exploitant : toutes les
 * lignes déjà enregistrées documentent l'exercice 2025. Elle n'est pas déduite
 * de la donnée, qui ne la porte pas — c'est pourquoi elle ne pouvait pas être
 * appliquée sans qu'on la demande.</p>
 *
 * <p>Seules les lignes sans aucune borne sont touchées : une période saisie,
 * même incomplète, est une information que personne ne doit écraser.</p>
 *
 * @returns le nombre de lignes datées.
 */
function attribuerPeriode2025(): number {
  if (migrationFaite(MARQUEUR_PERIODE_2025)) return 0;

  let datees = 0;

  for (const cle of Object.values(CLES_PAR_CATEGORIE)) {
    const lignes = relire(cle) as Record<string, unknown>[];
    if (!lignes.length) continue;

    let touchee = false;

    const reprises = lignes.map(ligne => {
      const debut = String(ligne['dateDebut'] ?? '').trim();
      const fin = String(ligne['dateFin'] ?? '').trim();
      if (debut || fin) return ligne;

      touchee = true;
      datees++;
      return { ...ligne, ...PERIODE_RETROACTIVE };
    });

    if (!touchee) continue;

    try {
      localStorage.setItem(cle, JSON.stringify(reprises));
    } catch {
      // Stockage saturé : le marqueur n'est pas posé, la reprise se rejouera.
      return 0;
    }
  }

  marquerMigration(MARQUEUR_PERIODE_2025);
  return datees;
}

/** Marqueur de la neutralisation des émissions résiduelles, versionné. */
export const MARQUEUR_PURGE_ABERRANTES = 'misfat_purge_emissions_aberrantes_v1';

/**
 * Plafond de plausibilité d'une ligne, en kgCO₂e.
 *
 * <p>Un million de tonnes sur une seule ligne. L'empreinte entière du groupe se
 * compte en dizaines de milliers de tonnes : le seuil est trois ordres de
 * grandeur au-dessus de la plus grosse ligne légitime, et n'arbitre donc aucun
 * cas discutable. Il ne retient que les artefacts de calcul — ceux qui portaient
 * le bilan à trente-sept millions.</p>
 */
export const EMISSION_LIGNE_MAX = 1e9;

/** Compte rendu de la dernière neutralisation, pour le bandeau du tableau de bord. */
export const bilanPurge = { lignes: 0, kgRetires: 0 };

/**
 * Neutralise les émissions résiduelles qu'aucun ordre de grandeur ne justifie.
 *
 * <p>Une correction de formule ne corrige que les calculs à venir : une ligne
 * enregistrée avant garde l'émission calculée à la saisie, et une seule suffit
 * à porter une filiale au-dessus du million de tonnes et à laisser le bandeau
 * d'invraisemblance allumé sur une cause pourtant réparée.</p>
 *
 * <p>La reprise ne <strong>recalcule</strong> pas : chaque écran a sa formule —
 * tonne-kilomètre, kilowattheure, montant, pouvoir de réchauffement — et rejouer
 * partout une formule unique rendrait des chiffres faux là où elle ne s'applique
 * pas. Elle remet à zéro l'émission et le facteur, et ne touche à rien d'autre :
 * la quantité, le poids, la distance et le montant restent intacts, si bien que
 * la ligne se revalorise dès qu'un facteur juste lui est affecté.</p>
 *
 * @returns le nombre de lignes neutralisées.
 */
function neutraliserEmissionsAberrantes(): number {
  if (migrationFaite(MARQUEUR_PURGE_ABERRANTES)) return 0;

  let neutralisees = 0;
  let kgRetires = 0;

  for (const cle of Object.values(CLES_PAR_CATEGORIE)) {
    const lignes = relire(cle) as Record<string, unknown>[];
    if (!lignes.length) continue;

    let touchee = false;

    const reprises = lignes.map(ligne => {
      const emission = Number(ligne['emissionCalculee']);
      if (!Number.isFinite(emission) || Math.abs(emission) <= EMISSION_LIGNE_MAX) return ligne;

      touchee = true;
      neutralisees++;
      kgRetires += emission;

      return { ...ligne, emissionCalculee: 0, facteur: null };
    });

    if (!touchee) continue;

    try {
      localStorage.setItem(cle, JSON.stringify(reprises));
    } catch {
      // Stockage saturé : le marqueur n'est pas posé, la reprise se rejouera.
      return 0;
    }
  }

  bilanPurge.lignes = neutralisees;
  bilanPurge.kgRetires = kgRetires;

  marquerMigration(MARQUEUR_PURGE_ABERRANTES);
  return neutralisees;
}

/** Message rendu à l'utilisateur quand des lignes ont été neutralisées. */
export function messagePurge(): string {
  if (bilanPurge.lignes <= 0) return '';

  const tonnes = (Math.abs(bilanPurge.kgRetires) / 1000)
    .toLocaleString('fr-FR', { maximumFractionDigits: 0 });

  return `${bilanPurge.lignes} ligne(s) portaient une émission impossible `
    + `(${tonnes} tCO₂e au total) : leur facteur a été retiré et leur émission remise `
    + 'à zéro. Les quantités saisies sont conservées — réaffectez un facteur pour les '
    + 'revaloriser.';
}

/** Marqueur de la reprise du millésime de la répartition, versionné. */
export const MARQUEUR_EXERCICE_CLASSEUR = 'misfat_exercice_classeur_v1';

/**
 * Rattache la répartition importée à l'exercice que son classeur documente.
 *
 * <p>« BG MISFAT 2025.xlsx » solde l'exercice 2025 : le nom du fichier le dit,
 * et l'import le lit désormais. Mais une répartition importée avant cette
 * lecture porte l'année consultée au moment de l'import — 2026 pour un classeur
 * de 2025 —, et le cloisonnement l'écarte alors du bilan 2025 tout entier.</p>
 *
 * <p>La reprise ne devine rien : elle relit le millésime dans le nom du fichier,
 * qui est une donnée et non une déduction. Sans année dans le nom, elle ne
 * touche à rien — inventer un exercice serait pire que d'en laisser un faux, qui
 * au moins se voit.</p>
 *
 * @returns 1 si la répartition a été rattachée, 0 sinon.
 */
function rattacherClasseurAuMillesime(): number {
  if (migrationFaite(MARQUEUR_EXERCICE_CLASSEUR)) return 0;

  let etat: { fichier?: string; exercice?: number | null };

  try {
    const brut = localStorage.getItem(CLE_DISPATCH);
    if (!brut) { marquerMigration(MARQUEUR_EXERCICE_CLASSEUR); return 0; }
    etat = JSON.parse(brut);
  } catch {
    marquerMigration(MARQUEUR_EXERCICE_CLASSEUR);
    return 0;
  }

  const duNom = exerciceDepuisNom(String(etat?.fichier ?? ''));
  if (duNom === null || duNom === etat?.exercice) {
    marquerMigration(MARQUEUR_EXERCICE_CLASSEUR);
    return 0;
  }

  try {
    localStorage.setItem(CLE_DISPATCH, JSON.stringify({ ...etat, exercice: duNom }));
  } catch {
    return 0;
  }

  bilanClasseur.fichier = String(etat?.fichier ?? '');
  bilanClasseur.avant = etat?.exercice ?? null;
  bilanClasseur.apres = duNom;

  marquerMigration(MARQUEUR_EXERCICE_CLASSEUR);
  return 1;
}

/** Compte rendu du rattachement, pour le bandeau du tableau de bord. */
export const bilanClasseur: { fichier: string; avant: number | null; apres: number | null } = {
  fichier: '', avant: null, apres: null
};

/** Message rendu à l'utilisateur quand la répartition a changé d'exercice. */
export function messageClasseur(): string {
  if (bilanClasseur.apres === null) return '';

  return `La répartition importée de « ${bilanClasseur.fichier} » était rattachée à `
    + `${bilanClasseur.avant ?? 'aucun exercice'} : elle est désormais portée par l'exercice `
    + `${bilanClasseur.apres}, que son nom de classeur documente.`;
}

/**
 * Vide les données locales et laisse l'application repartir à neuf.
 *
 * <p>Destinée aux essais : le stockage du navigateur accumule les saisies, les
 * répartitions et les marqueurs de reprise, et une seule ligne aberrante suffit
 * à fausser tout un bilan. Rien ne permettait de repartir proprement sans vider
 * le stockage à la main, clé par clé.</p>
 *
 * <p>Elle efface les mesures des dix-neuf écrans, la répartition importée et les
 * marqueurs de reprise — de sorte que celles-ci rejouent au prochain démarrage.
 * Elle ne touche ni à la session, ni au référentiel, qui vivent en base : ce
 * n'est pas au navigateur de les effacer.</p>
 *
 * <p>Accessible à la console sous {@code misfat.reinitialiserDonneesLocales()}.
 * Elle ne recharge pas la page d'elle-même : c'est à l'appelant de décider,
 * et un rechargement d'office masquerait le compte rendu qu'elle rend.</p>
 *
 * @returns le nombre de clés effacées.
 */
export function reinitialiserDonneesLocales(): number {
  if (typeof localStorage === 'undefined') return 0;

  const cles = new Set<string>([...Object.values(CLES_PAR_CATEGORIE), CLE_DISPATCH]);

  // Les marqueurs de reprise partent avec : les garder ferait tenir pour jouées
  // des reprises dont les données viennent d'être effacées.
  for (let i = 0; i < localStorage.length; i++) {
    const cle = localStorage.key(i);
    if (cle && cle.startsWith('misfat_')) cles.add(cle);
  }

  let effacees = 0;
  for (const cle of cles) {
    if (localStorage.getItem(cle) === null) continue;
    localStorage.removeItem(cle);
    effacees++;
  }

  signalerMesuresLocalesModifiees();
  return effacees;
}

/**
 * Joue les reprises en attente sur le stockage du navigateur.
 *
 * <p>Appelée une fois au démarrage. Sans effet au pré-rendu, où le stockage du
 * navigateur n'existe pas : les reprises se joueront à l'hydratation.</p>
 *
 * @returns le nombre total de lignes reprises, pour la trace de mise au point.
 */
export function jouerMigrationsDeDemarrage(): number {
  if (typeof localStorage === 'undefined') return 0;

  let reprises = 0;

  try {
    reprises += reprendreEchelleTransportAmont();
  } catch (erreur) {
    // Une reprise qui échoue ne doit pas emporter le démarrage : l'application
    // reste utilisable, et la donnée sera reprise au prochain lancement.
    console.error('[migrations] reprise de l\'échelle massique interrompue', erreur);
  }

  try {
    reprises += attribuerPeriode2025();
  } catch (erreur) {
    console.error('[migrations] attribution de la période 2025 interrompue', erreur);
  }

  try {
    reprises += neutraliserEmissionsAberrantes();
  } catch (erreur) {
    console.error('[migrations] neutralisation des émissions aberrantes interrompue', erreur);
  }

  try {
    reprises += rattacherClasseurAuMillesime();
  } catch (erreur) {
    console.error('[migrations] rattachement du classeur à son millésime interrompu', erreur);
  }

  // Utilitaire de remise à zéro, offert à la console pour les essais. Exposé
  // ici plutôt que par un bouton : effacer les saisies n'est pas une action
  // qu'une interface doit rendre facile.
  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>)['misfat'] = { reinitialiserDonneesLocales };
  }

  // Les vues qui agrègent le stockage doivent repartir des valeurs reprises,
  // et non de celles qu'elles ont pu lire avant.
  if (reprises) signalerMesuresLocalesModifiees();

  return reprises;
}
