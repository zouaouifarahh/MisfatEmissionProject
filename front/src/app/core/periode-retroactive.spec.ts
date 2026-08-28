import { describe, it, expect, beforeEach } from 'vitest';

import { jouerMigrationsDeDemarrage, MARQUEUR_PERIODE_2025 } from './migrations-demarrage';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';
import { releveDeLExercice } from './perimetre';

/**
 * Attribution rétroactive de l'exercice 2025.
 *
 * <p>Huit écrans du Scope 3 ne portaient aucune période. Leur date de création
 * est écrite en français — « 15/03/2026 09:12 » — que le lecteur d'exercice ne
 * sait pas interpréter : il attend une année en tête. Ces lignes n'avaient donc
 * <strong>aucun</strong> exercice et se trouvaient écartées de tout bilan daté.
 * Elles n'étaient pas sur la mauvaise année : elles étaient invisibles, ce qui
 * explique les postes à zéro pour cent devant des tables pleines.</p>
 *
 * <p>La période retenue vient d'un arbitrage de l'exploitant — toutes les
 * lignes déjà enregistrées documentent 2025 — et non d'une déduction : la
 * donnée ne la porte pas. C'est pourquoi la reprise ne pouvait pas être jouée
 * sans qu'on la demande.</p>
 */
describe('Reprise — période rétroactive 2025', () => {

  const CLE_INVESTISSEMENTS = CLES_PAR_CATEGORIE['investissements'];
  const CLE_FRANCHISES = CLES_PAR_CATEGORIE['franchises'];

  /** Ligne telle que les huit écrans l'enregistraient : sans période. */
  const sansPeriode = (id: number) => ({
    id, designation: `Actif ${id}`, emissionCalculee: 1_200,
    dateDebut: '', dateFin: '', creeLe: '15/03/2026 09:12'
  });

  const relire = (cle: string) => JSON.parse(localStorage.getItem(cle) ?? '[]');

  beforeEach(() => {
    // Le stockage est vide entre deux tests, marqueur compris : chaque banc
    // rejoue donc la reprise sur son propre jeu.
    localStorage.clear();
  });

  describe('lignes dépourvues de période', () => {

    it('leur attribue l\'exercice 2025', () => {
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([sansPeriode(1)]));

      expect(jouerMigrationsDeDemarrage()).toBeGreaterThan(0);

      const [ligne] = relire(CLE_INVESTISSEMENTS);
      expect(ligne.dateDebut).toBe('2025-01-01');
      expect(ligne.dateFin).toBe('2025-12-31');
    });

    it('les rend enfin visibles sur le bilan 2025', () => {
      // Avant la reprise, la ligne n'appartenait a aucun exercice.
      const avant = sansPeriode(1);
      expect(releveDeLExercice(avant, 2025)).toBe(false);

      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([avant]));
      jouerMigrationsDeDemarrage();

      const [apres] = relire(CLE_INVESTISSEMENTS);
      expect(releveDeLExercice(apres, 2025)).toBe(true);
      expect(releveDeLExercice(apres, 2026)).toBe(false);
    });

    it('traite toutes les catégories, pas seulement une', () => {
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([sansPeriode(1)]));
      localStorage.setItem(CLE_FRANCHISES, JSON.stringify([sansPeriode(2), sansPeriode(3)]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE_INVESTISSEMENTS)[0].dateDebut).toBe('2025-01-01');
      expect(relire(CLE_FRANCHISES).map((l: { dateDebut: string }) => l.dateDebut))
        .toEqual(['2025-01-01', '2025-01-01']);
    });

    it('conserve tout le reste de la ligne', () => {
      // La reprise date ; elle ne recalcule rien et ne réapparie pas.
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([sansPeriode(7)]));
      jouerMigrationsDeDemarrage();

      const [ligne] = relire(CLE_INVESTISSEMENTS);
      expect(ligne.id).toBe(7);
      expect(ligne.designation).toBe('Actif 7');
      expect(ligne.emissionCalculee).toBe(1_200);
      expect(ligne.creeLe).toBe('15/03/2026 09:12');
    });
  });

  describe('lignes qui portent déjà une période', () => {

    it('ne touche pas à une période complète', () => {
      const datee = { ...sansPeriode(1), dateDebut: '2024-01-01', dateFin: '2024-12-31' };
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([datee]));

      jouerMigrationsDeDemarrage();

      const [ligne] = relire(CLE_INVESTISSEMENTS);
      expect(ligne.dateDebut).toBe('2024-01-01');
      expect(ligne.dateFin).toBe('2024-12-31');
    });

    it('ne complète pas une période ouverte', () => {
      // Une seule borne saisie reste une information : la compléter d'office
      // lui prêterait une date que personne n'a posée.
      const ouverte = { ...sansPeriode(1), dateDebut: '2026-06-01', dateFin: '' };
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([ouverte]));

      jouerMigrationsDeDemarrage();

      const [ligne] = relire(CLE_INVESTISSEMENTS);
      expect(ligne.dateDebut).toBe('2026-06-01');
      expect(ligne.dateFin).toBe('');
    });
  });

  describe('rejeu', () => {

    it('ne repasse pas une fois le marqueur posé', () => {
      localStorage.setItem(CLE_INVESTISSEMENTS, JSON.stringify([sansPeriode(1)]));
      jouerMigrationsDeDemarrage();

      // Une ligne ajoutee apres coup ne doit pas etre datee d'office : la
      // saisie exige desormais sa periode, et la reprise a fait son office.
      localStorage.setItem(CLE_INVESTISSEMENTS,
        JSON.stringify([...relire(CLE_INVESTISSEMENTS), sansPeriode(9)]));
      jouerMigrationsDeDemarrage();

      const lignes = relire(CLE_INVESTISSEMENTS);
      expect(lignes[0].dateDebut).toBe('2025-01-01');
      expect(lignes[1].dateDebut).toBe('');
      expect(localStorage.getItem(MARQUEUR_PERIODE_2025)).toBe('fait');
    });

    it('pose son marqueur même sans aucune ligne à reprendre', () => {
      jouerMigrationsDeDemarrage();

      expect(localStorage.getItem(MARQUEUR_PERIODE_2025)).toBe('fait');
    });
  });
});
