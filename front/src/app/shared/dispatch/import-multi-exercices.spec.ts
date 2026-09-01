import { describe, it, expect } from 'vitest';

import { exerciceDeCellule, exerciceRetenu } from './exercice-de-ligne';

/**
 * Import d'un classeur couvrant plusieurs exercices.
 *
 * <p>Un inventaire liste souvent les acquisitions de 2024, 2025 et 2026 côte à
 * côte. L'import ne lisait aucune date de ligne : il datait le lot entier du
 * millésime lu dans le nom du fichier, si bien qu'un classeur pluriannuel
 * versait tout sur une seule année. Les autres exercices n'étaient pas perdus —
 * ils étaient rangés sous une année qu'ils ne documentent pas, ce qui est pire,
 * car le total reste plausible.</p>
 */
describe('Exercice lu sur la ligne d\'un classeur', () => {

  describe('écritures rencontrées dans les classeurs', () => {

    it('lit une vraie date, rendue telle quelle par le lecteur', () => {
      expect(exerciceDeCellule(new Date(2024, 5, 12))).toBe(2024);
    });

    it('lit un numéro de série de tableur', () => {
      // 45 658 = 1er janvier 2025 dans le comptage du tableur.
      expect(exerciceDeCellule(45_658)).toBe(2025);
    });

    it('lit une date en écriture ISO', () => {
      expect(exerciceDeCellule('2024-03-15')).toBe(2024);
    });

    it('lit une date en écriture française', () => {
      expect(exerciceDeCellule('15/03/2024')).toBe(2024);
    });

    it('lit une année seule', () => {
      expect(exerciceDeCellule(2026)).toBe(2026);
      expect(exerciceDeCellule('2026')).toBe(2026);
      expect(exerciceDeCellule('Exercice 2026')).toBe(2026);
    });
  });

  describe('ce qu\'elle refuse de lire', () => {

    it('ne rend rien sur une cellule vide', () => {
      expect(exerciceDeCellule(null)).toBeNull();
      expect(exerciceDeCellule('')).toBeNull();
      expect(exerciceDeCellule('   ')).toBeNull();
    });

    it('ne prend pas un montant pour une date', () => {
      // Sous un an de série, ce n'est pas une date mais une durée ou une
      // somme : l'interpréter serait inventer un exercice.
      expect(exerciceDeCellule(12.5)).toBeNull();
      expect(exerciceDeCellule(300)).toBeNull();
    });

    it('ne lève pas un millésime sur deux chiffres', () => {
      // « 03/25 » désigne aussi bien mars 2025 qu'un rapport : le trancher
      // daterait la ligne au jugé.
      expect(exerciceDeCellule('03/25')).toBeNull();
    });

    it('écarte une année hors des bornes plausibles', () => {
      expect(exerciceDeCellule('1789-07-14')).toBeNull();
      expect(exerciceDeCellule(3200)).toBeNull();
    });

    it('ne rend rien sur un libellé sans date', () => {
      expect(exerciceDeCellule('Achats matières premières')).toBeNull();
    });
  });

  describe('degrés de repli', () => {

    it('retient la date de la ligne avant tout', () => {
      expect(exerciceRetenu('2024-03-15', 2025, 2026)).toBe(2024);
    });

    it('retombe sur le millésime du classeur', () => {
      expect(exerciceRetenu('', 2025, 2026)).toBe(2025);
    });

    it('retombe en dernier sur l\'exercice consulté', () => {
      // Convention assumée : une ligne sans date doit bien être rattachée
      // quelque part. Ce n'est pas une lecture de la donnée.
      expect(exerciceRetenu('', null, 2026)).toBe(2026);
    });

    it('ne rend rien quand aucun degré ne renseigne', () => {
      expect(exerciceRetenu('', null, null)).toBeNull();
    });
  });
});
