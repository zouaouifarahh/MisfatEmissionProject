import { describe, it, expect } from 'vitest';

import {
  reconnaitreUnite, convertirUnite, alignerSurFacteur, uniteDenominateur,
  unitesCompatibles, unitesDeDimension, normaliserUnite, UNITES, UNITE_REFERENCE
} from './conversion-unites';

/**
 * Conversion d'unités : le facteur mille qui ne se voit pas.
 *
 * <p>Confondre kWh et MWh, litre et mètre cube, kilogramme et tonne, c'est
 * décaler un poste d'un facteur mille. Le total reste un nombre, la ventilation
 * reste plausible, et rien ne signale l'erreur. D'où ce banc.</p>
 */
describe('Conversion des unités physiques', () => {

  describe('reconnaissance des écritures', () => {

    it('reconnaît le code canonique', () => {
      expect(reconnaitreUnite('kWh')?.dimension).toBe('ENERGIE');
      expect(reconnaitreUnite('t')?.dimension).toBe('MASSE');
    });

    it('reconnaît les écritures des factures', () => {
      // Le classeur écrit « m³ », l'ERP « m3 », la facture « mètres cubes ».
      expect(reconnaitreUnite('m³')?.code).toBe('m3');
      expect(reconnaitreUnite('m3')?.code).toBe('m3');
      expect(reconnaitreUnite('mètres cubes')?.code).toBe('m3');
      expect(reconnaitreUnite('LITRES')?.code).toBe('L');
      expect(reconnaitreUnite('tonnes')?.code).toBe('t');
    });

    it('ne devine pas une unité absente du catalogue', () => {
      // Deviner ici, c'est calculer à côté sans le dire.
      expect(reconnaitreUnite('palette')).toBeNull();
      expect(reconnaitreUnite('')).toBeNull();
      expect(reconnaitreUnite(null)).toBeNull();
    });

    it('distingue le kilowattheure du mégawattheure', () => {
      // La confusion la plus fréquente, et celle qui coûte un facteur mille.
      expect(reconnaitreUnite('kwh')?.code).toBe('kWh');
      expect(reconnaitreUnite('mwh')?.code).toBe('MWh');
    });
  });

  describe('conversions au sein d\'une dimension', () => {

    it('convertit les masses', () => {
      expect(convertirUnite(2.5, 't', 'kg').valeur).toBeCloseTo(2_500, 9);
      expect(convertirUnite(1_500, 'kg', 't').valeur).toBeCloseTo(1.5, 9);
      expect(convertirUnite(500, 'g', 'kg').valeur).toBeCloseTo(0.5, 9);
    });

    it('convertit les volumes', () => {
      expect(convertirUnite(3, 'm3', 'L').valeur).toBeCloseTo(3_000, 9);
      expect(convertirUnite(2_500, 'L', 'm3').valeur).toBeCloseTo(2.5, 9);
    });

    it('convertit les énergies', () => {
      expect(convertirUnite(1.2, 'MWh', 'kWh').valeur).toBeCloseTo(1_200, 9);
      expect(convertirUnite(3_600, 'kWh', 'MWh').valeur).toBeCloseTo(3.6, 9);
      expect(convertirUnite(1, 'GJ', 'kWh').valeur).toBeCloseTo(277.777_777_778, 6);
    });

    it('convertit les distances', () => {
      expect(convertirUnite(100, 'mi', 'km').valeur).toBeCloseTo(160.934_4, 6);
      expect(convertirUnite(1_500, 'm', 'km').valeur).toBeCloseTo(1.5, 9);
    });

    it('convertit le fret', () => {
      expect(convertirUnite(2_000, 'kg.km', 't.km').valeur).toBeCloseTo(2, 9);
    });

    it('rend la quantité inchangée entre unités identiques', () => {
      const r = convertirUnite(42, 'kWh', 'kWh');

      expect(r.statut).toBe('IDENTIQUE');
      expect(r.valeur).toBe(42);
    });

    it('revient à la valeur d\'origine par aller-retour', () => {
      const aller = convertirUnite(1_234.5, 'L', 'm3');
      const retour = convertirUnite(aller.valeur, 'm3', 'L');

      expect(retour.valeur).toBeCloseTo(1_234.5, 6);
    });
  });

  describe('refus de convertir', () => {

    it('refuse entre dimensions différentes', () => {
      // Des litres de gazole valent bien des kilogrammes, mais par une masse
      // volumique propre au produit : elle doit être portée par la ligne.
      const r = convertirUnite(1_000, 'L', 'kg');

      expect(r.statut).toBe('DIMENSIONS_INCOMPATIBLES');
      expect(r.valeur).toBe(1_000);
      expect(r.avertissement).toContain('masse volumique');
    });

    it('conserve la quantité face à une unité inconnue', () => {
      const r = convertirUnite(12, 'palette', 'kg');

      expect(r.statut).toBe('UNITE_INCONNUE');
      expect(r.valeur).toBe(12);
      expect(r.avertissement).toContain('palette');
    });

    it('signale aussi une cible inconnue', () => {
      expect(convertirUnite(12, 'kg', 'brouette').statut).toBe('UNITE_INCONNUE');
    });
  });

  describe('alignement sur l\'unité du facteur', () => {

    it('extrait la quantité mesurée de l\'unité du facteur', () => {
      expect(uniteDenominateur('kgCO2e/L')).toBe('L');
      expect(uniteDenominateur('kgCO2e/kWh')).toBe('kWh');
      expect(uniteDenominateur('kgCO₂e par tonne')).toBe('tonne');
      expect(uniteDenominateur('kg')).toBe('kg');
      expect(uniteDenominateur(null)).toBe('');
    });

    it('aligne une saisie en m³ sur un facteur au litre', () => {
      const r = alignerSurFacteur(3, 'm3', 'kgCO2e/L');

      expect(r.statut).toBe('CONVERTI');
      expect(r.valeur).toBeCloseTo(3_000, 9);
    });

    it('aligne une saisie en MWh sur un facteur au kWh', () => {
      const r = alignerSurFacteur(1.2, 'MWh', 'kgCO2e/kWh');

      expect(r.valeur).toBeCloseTo(1_200, 9);
    });

    it('laisse la quantité intacte quand le facteur ne nomme pas son unité', () => {
      expect(alignerSurFacteur(10, 'kg', '').statut).toBe('UNITE_INCONNUE');
    });
  });

  describe('listes proposables à la saisie', () => {

    it('propose les unités compatibles, celle de départ comprise', () => {
      const codes = unitesCompatibles('kWh').map(u => u.code);

      expect(codes).toContain('kWh');
      expect(codes).toContain('MWh');
      expect(codes).not.toContain('kg');
    });

    it('ne propose rien pour une unité inconnue', () => {
      expect(unitesCompatibles('palette')).toEqual([]);
    });

    it('groupe les unités par dimension', () => {
      expect(unitesDeDimension('MASSE').every(u => u.dimension === 'MASSE')).toBe(true);
      expect(unitesDeDimension('VOLUME').length).toBeGreaterThan(1);
    });
  });

  describe('cohérence du catalogue', () => {

    it('donne à chaque dimension une unité de référence de rapport 1', () => {
      for (const [dimension, code] of Object.entries(UNITE_REFERENCE)) {
        const reference = UNITES.find(u => u.code === code);

        expect(reference, `référence manquante pour ${dimension}`).toBeDefined();
        expect(reference!.versReference).toBe(1);
        expect(reference!.dimension).toBe(dimension);
      }
    });

    it('n\'attribue jamais deux unités à la même écriture', () => {
      // La comparaison porte sur la forme normalisée, seule qui compte à la
      // lecture : « m³ » et « m » se confondaient sous une simple minuscule,
      // et le mètre cube s'emparait de la clé du mètre.
      const vues = new Map<string, string>();

      for (const unite of UNITES) {
        for (const forme of [unite.code, unite.libelle, ...unite.alias]) {
          const clef = normaliserUnite(forme);
          const deja = vues.get(clef);
          expect(deja ?? unite.code,
                 `« ${forme} » revendiquée par ${deja} et ${unite.code}`).toBe(unite.code);
          vues.set(clef, unite.code);
        }
      }
    });

    it('donne à chaque unité un rapport strictement positif', () => {
      for (const unite of UNITES) expect(unite.versReference).toBeGreaterThan(0);
    });
  });
});
