import { CLES_PAR_CATEGORIE, signalerMesuresLocalesModifiees } from '../shared/dispatch/mesures-locales';
import { migrationFaite, marquerMigration } from './appariement-referentiel';
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

  // Les vues qui agrègent le stockage doivent repartir des valeurs reprises,
  // et non de celles qu'elles ont pu lire avant.
  if (reprises) signalerMesuresLocalesModifiees();

  return reprises;
}
