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

  // Les vues qui agrègent le stockage doivent repartir des valeurs reprises,
  // et non de celles qu'elles ont pu lire avant.
  if (reprises) signalerMesuresLocalesModifiees();

  return reprises;
}
