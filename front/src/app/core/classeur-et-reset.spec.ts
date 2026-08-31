import { describe, it, expect, beforeEach } from 'vitest';

import {
  jouerMigrationsDeDemarrage, reinitialiserDonneesLocales,
  messageClasseur, bilanClasseur, MARQUEUR_EXERCICE_CLASSEUR
} from './migrations-demarrage';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';
import { CLE_STOCKAGE as CLE_DISPATCH } from '../shared/dispatch/cle-dispatch';

/**
 * Millésime de la répartition importée, et remise à zéro du stockage.
 *
 * <p>« BG MISFAT 2025.xlsx » solde l'exercice 2025 : son nom le dit. Une
 * répartition importée avant que l'import ne lise ce nom porte l'année qui
 * était consultée ce jour-là — 2026 pour un classeur de 2025 — et le
 * cloisonnement l'écarte alors du bilan 2025 tout entier, sans qu'aucun écran
 * ne l'explique.</p>
 */
describe('Répartition — millésime du classeur et remise à zéro', () => {

  const etat = (fichier: string, exercice: number | null) =>
    JSON.stringify({ fichier, exercice, lignes: [], exclues: 0, nonVentilees: 0, entityId: null });

  const relire = () => JSON.parse(localStorage.getItem(CLE_DISPATCH) ?? '{}');

  beforeEach(() => {
    localStorage.clear();
    bilanClasseur.fichier = '';
    bilanClasseur.avant = null;
    bilanClasseur.apres = null;
  });

  describe('rattachement au millésime du classeur', () => {

    it('corrige l\'exercice d\'une répartition mal étiquetée', () => {
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2026));

      jouerMigrationsDeDemarrage();

      expect(relire().exercice).toBe(2025);
    });

    it('ne touche pas à une répartition déjà juste', () => {
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2025));

      jouerMigrationsDeDemarrage();

      expect(relire().exercice).toBe(2025);
      expect(messageClasseur()).toBe('');
    });

    it('ne devine rien quand le nom ne porte pas d\'année', () => {
      // Inventer un exercice serait pire que d'en laisser un faux, qui au moins
      // se voit sur le bandeau du tableau de bord.
      localStorage.setItem(CLE_DISPATCH, etat('Base carbone interne (4).xlsx', 2026));

      jouerMigrationsDeDemarrage();

      expect(relire().exercice).toBe(2026);
    });

    it('conserve le reste de la répartition', () => {
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2026));

      jouerMigrationsDeDemarrage();

      const repris = relire();
      expect(repris.fichier).toBe('BG MISFAT 2025.xlsx');
      expect(repris.lignes).toEqual([]);
    });

    it('dit ce qu\'il a rattaché, et d\'où vient le millésime', () => {
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2026));

      jouerMigrationsDeDemarrage();

      const message = messageClasseur();
      expect(message).toContain('BG MISFAT 2025.xlsx');
      expect(message).toContain('2026');
      expect(message).toContain('2025');
    });

    it('pose son marqueur même sans répartition', () => {
      jouerMigrationsDeDemarrage();

      expect(localStorage.getItem(MARQUEUR_EXERCICE_CLASSEUR)).toBe('fait');
    });

    it('ne repasse pas une fois le marqueur posé', () => {
      // Un rattachement décidé après coup par l'exploitant ne doit pas être
      // défait au démarrage suivant.
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2026));
      jouerMigrationsDeDemarrage();

      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2024));
      jouerMigrationsDeDemarrage();

      expect(relire().exercice).toBe(2024);
    });
  });

  describe('remise à zéro des données locales', () => {

    it('efface les mesures de toutes les catégories', () => {
      localStorage.setItem(CLES_PAR_CATEGORIE['biens-services'], '[{"id":1}]');
      localStorage.setItem(CLES_PAR_CATEGORIE['franchises'], '[{"id":2}]');

      expect(reinitialiserDonneesLocales()).toBeGreaterThanOrEqual(2);

      expect(localStorage.getItem(CLES_PAR_CATEGORIE['biens-services'])).toBeNull();
      expect(localStorage.getItem(CLES_PAR_CATEGORIE['franchises'])).toBeNull();
    });

    it('efface la répartition importée', () => {
      localStorage.setItem(CLE_DISPATCH, etat('BG MISFAT 2025.xlsx', 2025));

      reinitialiserDonneesLocales();

      expect(localStorage.getItem(CLE_DISPATCH)).toBeNull();
    });

    it('efface les marqueurs de reprise', () => {
      // Les garder ferait tenir pour jouées des reprises dont les données
      // viennent d'être effacées.
      jouerMigrationsDeDemarrage();
      expect(localStorage.getItem(MARQUEUR_EXERCICE_CLASSEUR)).toBe('fait');

      reinitialiserDonneesLocales();

      expect(localStorage.getItem(MARQUEUR_EXERCICE_CLASSEUR)).toBeNull();
    });

    it('laisse ce qui n\'appartient pas aux mesures', () => {
      // La session et le référentiel vivent en base : ce n'est pas au
      // navigateur de les effacer.
      localStorage.setItem('token', 'abc');

      reinitialiserDonneesLocales();

      expect(localStorage.getItem('token')).toBe('abc');
    });

    it('ne compte que ce qui existait', () => {
      expect(reinitialiserDonneesLocales()).toBe(0);
    });

    it('est offerte à la console sous « misfat »', () => {
      jouerMigrationsDeDemarrage();

      const console_ = (globalThis as Record<string, any>)['misfat'];
      expect(typeof console_?.reinitialiserDonneesLocales).toBe('function');
    });
  });
});
