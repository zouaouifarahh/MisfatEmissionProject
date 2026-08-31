import { describe, it, expect, beforeEach } from 'vitest';

import {
  CLES_PAR_CATEGORIE, mesuresIncompletes, exercicesRenseignes
} from './mesures-locales';
import { PerimetreOrganisation } from '../../core/perimetre';

/**
 * Diagnostic d'un tableau de bord resté vide.
 *
 * <p>La trace énumérait trois causes possibles — « aucune saisie enregistrée,
 * ou des lignes hors de l'exercice, ou un facteur non résolu » — sans dire
 * laquelle s'appliquait. Elles appellent pourtant des gestes opposés : saisir
 * une donnée, changer d'exercice, ou affecter un facteur. Les trois sont
 * vérifiables, donc elles sont vérifiées.</p>
 *
 * <p>Elles ne sont pas corrigées d'office pour autant. Dater les lignes sur
 * l'exercice consulté les ferait remonter dans <strong>chaque</strong> millésime
 * regardé, et deux exercices cesseraient d'être comparables.</p>
 */
describe('Mesures locales — pourquoi le bilan est vide', () => {

  const CLE = CLES_PAR_CATEGORIE['biens-services'];
  const CLE_DECHETS = CLES_PAR_CATEGORIE['dechets'];

  const GROUPE: PerimetreOrganisation = {
    entityId: null, etablissements: [], societeUnique: false
  };

  beforeEach(() => localStorage.clear());

  describe('exercices que les mesures documentent', () => {

    it('nomme l\'année où la donnée se trouve', () => {
      // Le cas signalé : le bilan 2026 est vide, la donnée est sur 2025.
      localStorage.setItem(CLE, JSON.stringify([
        { id: 1, dateDebut: '2025-01-01', dateFin: '2025-12-31', emissionCalculee: 10 }
      ]));

      expect(exercicesRenseignes(GROUPE)).toEqual([{ exercice: 2025, lignes: 1 }]);
    });

    it('compte les lignes de chaque exercice, du plus récent au plus ancien', () => {
      localStorage.setItem(CLE, JSON.stringify([
        { id: 1, dateDebut: '2025-01-01', dateFin: '2025-12-31', emissionCalculee: 10 },
        { id: 2, dateDebut: '2025-06-01', dateFin: '2025-06-30', emissionCalculee: 20 },
        { id: 3, dateDebut: '2024-01-01', dateFin: '2024-12-31', emissionCalculee: 30 }
      ]));

      expect(exercicesRenseignes(GROUPE))
        .toEqual([{ exercice: 2025, lignes: 2 }, { exercice: 2024, lignes: 1 }]);
    });

    it('ne rend rien quand rien n\'est enregistré', () => {
      // C'est alors la collecte qui reste à faire, et le message doit le dire.
      expect(exercicesRenseignes(GROUPE)).toEqual([]);
    });

    it('balaie toutes les catégories', () => {
      localStorage.setItem(CLE, JSON.stringify([
        { id: 1, dateDebut: '2025-01-01', dateFin: '2025-12-31', emissionCalculee: 10 }]));
      localStorage.setItem(CLE_DECHETS, JSON.stringify([
        { id: 2, dateDebut: '2025-03-01', dateFin: '2025-03-31', emissionCalculee: 5 }]));

      expect(exercicesRenseignes(GROUPE)).toEqual([{ exercice: 2025, lignes: 2 }]);
    });
  });

  describe('mesures saisies sans facteur', () => {

    it('signale une quantité qui ne produit aucune émission', () => {
      localStorage.setItem(CLE, JSON.stringify([{
        id: 1, designation: 'Acier bobine', quantite: 1200, emissionCalculee: 0,
        dateDebut: '2025-01-01', dateFin: '2025-12-31'
      }]));

      const incompletes = mesuresIncompletes(2025, GROUPE);
      expect(incompletes).toHaveLength(1);
      expect(incompletes[0].libelle).toBe('Acier bobine');
      expect(incompletes[0].quantite).toBe(1200);
      expect(incompletes[0].categorie).toBe('biens-services');
    });

    it('ne signale pas une ligne sans quantité', () => {
      // Elle n'est pas incomplète : elle est vide, et c'est autre chose.
      localStorage.setItem(CLE, JSON.stringify([{
        id: 1, designation: 'Ébauche', quantite: 0, emissionCalculee: 0,
        dateDebut: '2025-01-01', dateFin: '2025-12-31'
      }]));

      expect(mesuresIncompletes(2025, GROUPE)).toEqual([]);
    });

    it('ne signale pas une ligne valorisée', () => {
      localStorage.setItem(CLE, JSON.stringify([{
        id: 1, designation: 'Acier bobine', quantite: 1200, emissionCalculee: 340,
        dateDebut: '2025-01-01', dateFin: '2025-12-31'
      }]));

      expect(mesuresIncompletes(2025, GROUPE)).toEqual([]);
    });

    it('reconnaît la quantité sous les noms des autres écrans', () => {
      // Montant, poids, distance : chaque écran nomme sa grandeur autrement, et
      // n'en retenir qu'un laisserait la plupart des lignes hors du relevé.
      localStorage.setItem(CLE, JSON.stringify([
        { id: 1, designation: 'Fret', poidsKg: 800, emissionCalculee: 0,
          dateDebut: '2025-01-01', dateFin: '2025-12-31' },
        { id: 2, designation: 'Achat', montant: 4500, emissionCalculee: 0,
          dateDebut: '2025-01-01', dateFin: '2025-12-31' }
      ]));

      expect(mesuresIncompletes(2025, GROUPE).map(m => m.quantite)).toEqual([800, 4500]);
    });

    it('rend un libellé plutôt qu\'une ligne anonyme', () => {
      localStorage.setItem(CLE, JSON.stringify([{
        id: 1, quantite: 10, emissionCalculee: 0,
        dateDebut: '2025-01-01', dateFin: '2025-12-31'
      }]));

      expect(mesuresIncompletes(2025, GROUPE)[0].libelle).toBe('(sans libellé)');
    });

    it('respecte l\'exercice consulté', () => {
      localStorage.setItem(CLE, JSON.stringify([{
        id: 1, designation: 'Acier', quantite: 10, emissionCalculee: 0,
        dateDebut: '2025-01-01', dateFin: '2025-12-31'
      }]));

      expect(mesuresIncompletes(2026, GROUPE)).toEqual([]);
      expect(mesuresIncompletes(2025, GROUPE)).toHaveLength(1);
    });
  });

  describe('cloisonnement par société', () => {

    it('ne compte que les lignes de la société consultée', () => {
      const tunisie: PerimetreOrganisation = {
        entityId: 1, etablissements: ['MISFAT I'], societeUnique: false
      };

      localStorage.setItem(CLE, JSON.stringify([
        { id: 1, societeId: 1, quantite: 10, emissionCalculee: 0,
          dateDebut: '2025-01-01', dateFin: '2025-12-31' },
        { id: 2, societeId: 2, quantite: 20, emissionCalculee: 0,
          dateDebut: '2025-01-01', dateFin: '2025-12-31' }
      ]));

      expect(mesuresIncompletes(2025, tunisie)).toHaveLength(1);
      expect(exercicesRenseignes(tunisie)).toEqual([{ exercice: 2025, lignes: 1 }]);
    });
  });
});
