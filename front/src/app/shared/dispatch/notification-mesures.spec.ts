import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  CLES_PAR_CATEGORIE,
  enregistrerLignes,
  mesuresLocalesModifiees$,
  signalerMesuresLocalesModifiees
} from './mesures-locales';

/**
 * Annonce des saisies aux vues qui les agrègent.
 *
 * <p>Les écrans de collecte écrivent leurs lignes dans le stockage du
 * navigateur ; le tableau de bord les y relit. Rien ne l'avertissait d'une
 * écriture : ses cartes restaient sur le compte du dernier chargement, et une
 * mesure enregistrée n'apparaissait qu'au changement de filtre. Le poste
 * paraissait figé à zéro alors que la donnée était là.</p>
 *
 * <p>L'écriture et l'annonce passent désormais par le même point d'entrée :
 * un écran qui persiste ses lignes annonce du même geste, sans avoir à y
 * penser. C'est ce couplage-là qui manquait.</p>
 */
describe('Mesures locales — annonce des écritures', () => {

  /** Une clé réellement suivie, prise de la table plutôt que recopiée. */
  const CLE_DECHETS = CLES_PAR_CATEGORIE['dechets'];

  let annonces: number;
  let ecoute: { unsubscribe(): void };

  beforeEach(() => {
    annonces = 0;
    ecoute = mesuresLocalesModifiees$.subscribe(() => annonces++);
  });

  afterEach(() => ecoute.unsubscribe());

  it('annonce l\'écriture des lignes d\'une catégorie', () => {
    expect(enregistrerLignes(CLE_DECHETS, [{ id: 1 }])).toBe(true);
    expect(annonces).toBe(1);
  });

  it('écrit réellement la valeur, l\'annonce ne s\'y substitue pas', () => {
    enregistrerLignes(CLE_DECHETS, [{ id: 7 }]);

    expect(JSON.parse(localStorage.getItem(CLE_DECHETS) ?? '[]')).toEqual([{ id: 7 }]);
  });

  it('annonce après l\'écriture, jamais avant', () => {
    // Une vue prévenue trop tôt relirait l'ancienne valeur et conclurait que
    // rien n'a changé.
    let vuAuMomentDeLAnnonce: string | null = null;
    const espion = mesuresLocalesModifiees$.subscribe(() => {
      vuAuMomentDeLAnnonce = localStorage.getItem(CLE_DECHETS);
    });

    enregistrerLignes(CLE_DECHETS, ['nouveau']);

    expect(vuAuMomentDeLAnnonce).toBe('["nouveau"]');
    espion.unsubscribe();
  });

  it('annonce une fois par écriture, quelle que soit la catégorie', () => {
    enregistrerLignes(CLES_PAR_CATEGORIE['voyages-affaires'], []);
    enregistrerLignes(CLES_PAR_CATEGORIE['investissements'], []);
    enregistrerLignes(CLES_PAR_CATEGORIE['transport-amont'], []);

    expect(annonces).toBe(3);
  });

  it('laisse passer une annonce déclenchée à la main', () => {
    // Le magasin de répartition n'écrit pas par ce chemin : il annonce
    // directement, et le tableau de bord doit l'entendre aussi.
    signalerMesuresLocalesModifiees();

    expect(annonces).toBe(1);
  });

  // Le refus d'écriture — quota dépassé sur une liste volumineuse — rend faux
  // et n'annonce rien : annoncer ferait recharger le tableau de bord sur une
  // donnée qui n'a pas été conservée. Ce chemin n'est pas couvert ici : jsdom
  // interdit de remplacer `localStorage.setItem`, et un banc qui ne peut pas
  // provoquer la panne qu'il prétend vérifier ne prouve rien.
});
