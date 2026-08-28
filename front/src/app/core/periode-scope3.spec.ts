import { describe, it, expect } from 'vitest';

import { exercicesDeLaLigne, releveDeLExercice } from './perimetre';
import { periodeLisible } from '../shared/ui/periode-lisible';

/**
 * Rattachement d'une mesure Scope 3 à son exercice.
 *
 * <p>Huit écrans du Scope 3 ne portaient aucune période. Faute de dates, le
 * rattachement retombait sur la date de création : une donnée de 2025 saisie
 * en 2026 comptait pour 2026. Le poste n'était pas absent — il était sur le
 * mauvais exercice, ce qui est plus insidieux qu'un zéro : le total reste
 * plausible, et rien ne dit qu'il documente une autre année.</p>
 *
 * <p>Ces bancs verrouillent la règle : la période saisie prime, la date de
 * création ne sert que de repli.</p>
 */
describe('Scope 3 — rattachement d\'une mesure à son exercice', () => {

  /** Une ligne saisie en 2026 pour une consommation de 2025. */
  const LIGNE_2025_SAISIE_EN_2026 = {
    dateDebut: '2025-01-01',
    dateFin: '2025-12-31',
    creeLe: '15/03/2026 09:12'
  };

  describe('la période saisie prime sur la date de saisie', () => {

    it('rattache la ligne à l\'exercice qu\'elle documente', () => {
      expect(exercicesDeLaLigne(LIGNE_2025_SAISIE_EN_2026)).toEqual([2025]);
    });

    it('la fait remonter sur le bilan 2025', () => {
      expect(releveDeLExercice(LIGNE_2025_SAISIE_EN_2026, 2025)).toBe(true);
    });

    it('ne la fait pas remonter sur 2026, année de sa saisie', () => {
      // C'est le défaut que les champs de période corrigent : la ligne y
      // comptait, et gonflait un exercice qu'elle ne documente pas.
      expect(releveDeLExercice(LIGNE_2025_SAISIE_EN_2026, 2026)).toBe(false);
    });
  });

  describe('période à cheval sur deux exercices', () => {

    it('rattache la ligne aux deux', () => {
      // Une consommation de décembre à janvier documente les deux exercices et
      // doit remonter sur l'un comme sur l'autre.
      const aCheval = { dateDebut: '2024-12-01', dateFin: '2025-01-31', creeLe: '' };

      expect(exercicesDeLaLigne(aCheval).sort()).toEqual([2024, 2025]);
      expect(releveDeLExercice(aCheval, 2024)).toBe(true);
      expect(releveDeLExercice(aCheval, 2025)).toBe(true);
    });
  });

  describe('ligne antérieure, sans période', () => {

    it('retombe sur sa date de création', () => {
      // Les lignes enregistrées avant l'ajout des champs n'ont pas de période :
      // le repli les garde visibles plutôt que de les faire disparaître.
      const ancienne = { dateDebut: '', dateFin: '', creeLe: '2026-03-15' };

      expect(exercicesDeLaLigne(ancienne)).toEqual([2026]);
    });

    it('reste écartée d\'un exercice qu\'elle ne documente pas', () => {
      // Elle n'est pas rattachée d'office à l'exercice consulté : le faire lui
      // prêterait une date qu'elle n'a pas, et la ferait compter dans chaque
      // millésime qu'on regarde.
      const sansDate = { dateDebut: '', dateFin: '', creeLe: '' };

      expect(releveDeLExercice(sansDate, 2025)).toBe(false);
      // Sans exercice demandé, rien n'est écarté.
      expect(releveDeLExercice(sansDate, null)).toBe(true);
    });
  });

  describe('affichage de la période', () => {

    it('rend les deux bornes en écriture française', () => {
      expect(periodeLisible(LIGNE_2025_SAISIE_EN_2026)).toBe('01/01/2025 – 31/12/2025');
    });

    it('rend une borne seule quand la période est ouverte', () => {
      // Une période ouverte reste une information : la compléter d'office lui
      // prêterait une borne que personne n'a saisie.
      expect(periodeLisible({ dateDebut: '2025-01-01', dateFin: '' })).toBe('01/01/2025');
      expect(periodeLisible({ dateDebut: '', dateFin: '2025-12-31' })).toBe('31/12/2025');
    });

    it('rend un tiret plutôt qu\'une cellule vide', () => {
      // La cellule dit alors que la donnée manque, au lieu de laisser croire à
      // un défaut d'affichage.
      expect(periodeLisible({ dateDebut: '', dateFin: '' })).toBe('—');
      expect(periodeLisible(null)).toBe('—');
    });
  });
});
