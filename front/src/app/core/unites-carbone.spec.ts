import { describe, it, expect } from 'vitest';

import {
  KG_VERS_TONNE,
  emissionKg,
  kgVersTonnes,
  normaliserUnite,
  quantiteVersUniteFacteur,
  tonnesVersKg
} from './unites-carbone';

/**
 * Conversions d'unités de la comptabilité carbone.
 *
 * <p>Ces bancs gardent la règle qui a coûté au tableau de bord un affichage à
 * 3,78 milliards de tonnes : les calculs se font en kgCO₂e, la conversion en
 * tonnes n'a lieu qu'à la frontière. Une régression ici se paie en facteurs
 * mille.</p>
 */
describe('unites-carbone', () => {

  describe('kgVersTonnes', () => {

    it('convertit mille kilogrammes en une tonne, exactement', () => {
      expect(kgVersTonnes(1_000)).toBe(1);
    });

    it('conserve la précision des petites valeurs', () => {
      expect(kgVersTonnes(2.636)).toBeCloseTo(0.002636, 9);
    });

    it('est l\'inverse de tonnesVersKg', () => {
      expect(kgVersTonnes(tonnesVersKg(3_782.59))).toBeCloseTo(3_782.59, 6);
    });

    it('expose le facteur de conversion utilisé', () => {
      expect(KG_VERS_TONNE).toBe(1_000);
    });
  });

  describe('normaliserUnite', () => {

    it('ignore la casse et les espaces', () => {
      expect(normaliserUnite(' kWh ')).toBe('KWH');
      expect(normaliserUnite('k W h')).toBe('KWH');
      expect(normaliserUnite('MWh')).toBe('MWH');
    });

    it('rend une chaîne vide sur une unité absente', () => {
      expect(normaliserUnite(null)).toBe('');
      expect(normaliserUnite(undefined)).toBe('');
    });
  });

  describe('quantiteVersUniteFacteur', () => {

    it('laisse la quantité intacte quand les deux unités concordent', () => {
      expect(quantiteVersUniteFacteur(7_565, 'MWh', 'MWh')).toBe(7_565);
      expect(quantiteVersUniteFacteur(7_565, 'kWh', 'KWH')).toBe(7_565);
    });

    it('convertit les mégawattheures en kilowattheures', () => {
      expect(quantiteVersUniteFacteur(7_565, 'MWh', 'kWh')).toBe(7_565_000);
    });

    it('convertit les kilowattheures en mégawattheures', () => {
      expect(quantiteVersUniteFacteur(7_565_000, 'kWh', 'MWh')).toBe(7_565);
    });

    it('convertit les tonnes en kilogrammes', () => {
      expect(quantiteVersUniteFacteur(2, 'Tonnes', 'kg')).toBe(2_000);
    });

    it('laisse la quantité intacte quand une unité manque', () => {
      expect(quantiteVersUniteFacteur(42, null, 'kWh')).toBe(42);
      expect(quantiteVersUniteFacteur(42, 'kWh', null)).toBe(42);
    });

    it('échoue explicitement sur deux unités non commensurables', () => {
      // Un échec visible vaut mieux qu'un total faux de trois ordres de grandeur.
      expect(() => quantiteVersUniteFacteur(100, 'kWh', 'kg')).toThrowError(/Conversion impossible/);
      expect(() => quantiteVersUniteFacteur(100, 'TND', 'EUR')).toThrowError(/Conversion impossible/);
    });
  });

  describe('emissionKg', () => {

    it('applique le facteur à la quantité déjà libellée dans son unité', () => {
      // 7 565 000 kWh × 0,5 kgCO₂e/kWh = 3 782 500 kgCO₂e, soit 3 782,5 tCO₂e.
      expect(emissionKg(7_565_000, 'kWh', 0.5, 'kWh')).toBe(3_782_500);
      expect(kgVersTonnes(emissionKg(7_565_000, 'kWh', 0.5, 'kWh'))).toBe(3_782.5);
    });

    it('convertit la quantité avant d\'appliquer le facteur', () => {
      // Même consommation saisie en MWh contre un facteur au kWh : le résultat
      // ne doit pas changer.
      expect(emissionKg(7_565, 'MWh', 0.5, 'kWh')).toBe(3_782_500);
    });

    it('n\'invente aucune conversion quand la saisie suit l\'unité du facteur', () => {
      // Le défaut historique : un facteur au MWh et une saisie au MWh
      // subissaient malgré tout un « × 1 000 » codé en dur.
      expect(emissionKg(7_565, 'MWh', 500, 'MWh')).toBe(3_782_500);
    });
  });
});
