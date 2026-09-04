import { describe, it, expect } from 'vitest';

import {
  calculerEmission, modeCalculDe, poidsTotalDepuisQuantite, tonnesKilometres,
  POIDS_MOYEN_FILTRE_KG
} from './transport-facteur';

/**
 * Alignement du poids sur l'unité du facteur.
 *
 * <p>Les poids sont saisis en kilogrammes. Le facteur, lui, est publié dans
 * l'unité de sa source : le référentiel en compte au kilogramme, à la tonne —
 * cinq d'entre eux, dont un à 3 100 kgCO₂e la tonne — et le module de
 * conversion prévient en ouverture qu'une conversion oubliée « décale un poste
 * d'un facteur mille sans qu'aucun contrôle ne s'en aperçoive ».</p>
 *
 * <p>C'est exactement ce que faisait la branche massique : elle multipliait des
 * kilogrammes par un facteur à la tonne. Un chargement de douze tonnes sortait
 * à trente-sept mille tonnes de CO₂ — un ordre de grandeur qu'aucune usine de
 * filtration n'atteint, et que le tableau de bord signalait en rouge sans
 * pouvoir en nommer la cause.</p>
 */
describe('Transport amont — échelle du calcul massique', () => {

  /** Douze tonnes, saisies en kilogrammes comme l'écran l'impose. */
  const DOUZE_TONNES_EN_KG = 12_000;

  const ligne = (facteur: number, uniteFacteur: string) => ({
    facteur, uniteFacteur, dataType: 'PHYSIQUE',
    poidsKg: DOUZE_TONNES_EN_KG, distanceKm: null, montant: null
  });

  describe('facteur publié à la tonne', () => {

    it('ramène le poids en tonnes avant de multiplier', () => {
      // 12 t × 3 100,5 = 37 206 kgCO₂e, et non 37 206 000.
      expect(calculerEmission(ligne(3_100.5, 'T'))).toBeCloseTo(37_206, 3);
    });

    it('accepte les graphies du référentiel', () => {
      // « T », « Tonne », « tonnes » désignent la même unité : le référentiel
      // les emploie toutes les trois selon la source qui publie le facteur.
      for (const unite of ['T', 't', 'Tonne', 'tonnes']) {
        expect(calculerEmission(ligne(3_100.5, unite))).toBeCloseTo(37_206, 3);
      }
    });

    it('ne sort plus mille fois trop haut', () => {
      // La borne est grossière à dessein : elle dit l'ordre de grandeur, pas
      // la valeur. C'est ce garde-fou qui manquait.
      const emissionKg = calculerEmission(ligne(3_100.5, 'Tonne'));

      expect(emissionKg).toBeLessThan(100_000);
      expect(emissionKg / 1000).toBeLessThan(100);
    });
  });

  describe('facteur publié au kilogramme', () => {

    it('applique le poids tel quel', () => {
      expect(calculerEmission(ligne(0.5, 'kg'))).toBeCloseTo(6_000, 6);
    });

    it('ne change rien à ce qui était déjà juste', () => {
      // La correction ne doit pas déplacer les postes qui tombaient juste.
      expect(calculerEmission(ligne(2.4, 'kg'))).toBeCloseTo(28_800, 6);
    });
  });

  describe('facteur publié au gramme', () => {

    it('monte le poids en grammes', () => {
      // 12 000 kg = 12 000 000 g ; à 0,002 kgCO₂e le gramme.
      expect(calculerEmission(ligne(0.002, 'g'))).toBeCloseTo(24_000, 3);
    });
  });

  describe('unité que rien ne reconnaît', () => {

    it('laisse la quantité inchangée plutôt que de la corriger au jugé', () => {
      // Mieux vaut un poste juste dans son unité de saisie qu'un poste faux
      // dans une autre : la conversion refuse de deviner.
      expect(calculerEmission(ligne(1.5, 'palette'))).toBeCloseTo(18_000, 6);
    });

    it('reste sur la branche massique', () => {
      expect(modeCalculDe('palette', 'PHYSIQUE')).toBe('MASSE');
    });
  });

  describe('expédition comptée en unités', () => {

    it('déduit le poids total de la quantité et du poids moyen', () => {
      // 40 000 filtres à 0,3 kg : douze tonnes.
      expect(poidsTotalDepuisQuantite(40_000, 0.3)).toBeCloseTo(12_000, 6);
    });

    it('refuse de déduire un poids sans quantité', () => {
      // Un poids déduit d'une quantité inconnue serait une invention : c'est la
      // seule des deux données que personne ne peut supposer.
      expect(poidsTotalDepuisQuantite(null, 0.3)).toBeNull();
      expect(poidsTotalDepuisQuantite(0, 0.3)).toBeNull();
    });

    it("retombe sur le poids d'un filtre quand la masse unitaire manque", () => {
      // MISFAT expédie des filtres de deux cents grammes. Écarter du bilan un
      // chargement réel faute d'un chiffre connu de toute l'entreprise le
      // sous-évaluerait en silence.
      expect(POIDS_MOYEN_FILTRE_KG).toBe(0.2);
      expect(poidsTotalDepuisQuantite(40_000, null)).toBeCloseTo(8_000, 6);
      expect(poidsTotalDepuisQuantite(40_000, 0)).toBeCloseTo(8_000, 6);
    });

    it('laisse toujours primer une masse déclarée', () => {
      // Une référence plus lourde que la moyenne se saisit, et le repli ne s'y
      // substitue jamais.
      expect(poidsTotalDepuisQuantite(40_000, 0.3)).toBeCloseTo(12_000, 6);
    });

    it('applique la formule des tonnes-kilomètres', () => {
      // 1 800 km × 40 000 unités × 0,3 kg × 0,001 = 21 600 t.km
      expect(tonnesKilometres(1_800, 40_000, 0.3)).toBeCloseTo(21_600, 6);
    });

    it('porte le millième qui convertit les kilos en tonnes', () => {
      // Sans lui, le résultat serait mille fois plus grand — c'est cette
      // conversion que la formule rend explicite.
      const tkm = tonnesKilometres(1_000, 1_000, 1);
      expect(tkm).toBeCloseTo(1_000, 6);
      expect(tkm).not.toBeCloseTo(1_000_000, 0);
    });

    it('reste muette tant que le trajet ou le chargement manque', () => {
      expect(tonnesKilometres(null, 40_000, 0.3)).toBeNull();
      expect(tonnesKilometres(1_800, null, 0.3)).toBeNull();
    });

    it('boucle avec le facteur pour donner les émissions', () => {
      // 21 600 t.km × 0,014 kgCO₂e/t.km
      const tkm = tonnesKilometres(1_800, 40_000, 0.3)!;
      expect(tkm * 0.014).toBeCloseTo(302.4, 6);
    });
  });

  describe('les autres formules ne bougent pas', () => {

    it('garde la conversion de la tonne-kilomètre', () => {
      const t = calculerEmission({
        facteur: 0.014, uniteFacteur: 'Tonne.Km', dataType: 'PHYSIQUE',
        poidsKg: DOUZE_TONNES_EN_KG, distanceKm: 800, montant: null
      });
      // (12 000 / 1000) × 800 × 0,014
      expect(t).toBeCloseTo(134.4, 6);
    });

    it('garde la valorisation monétaire', () => {
      const m = calculerEmission({
        facteur: 0.25, uniteFacteur: 'TND', dataType: 'MONETAIRE',
        poidsKg: DOUZE_TONNES_EN_KG, distanceKm: null, montant: 4_000
      });
      expect(m).toBeCloseTo(1_000, 6);
    });

    it('garde la valorisation au kilomètre', () => {
      const k = calculerEmission({
        facteur: 0.9, uniteFacteur: 'km', dataType: 'PHYSIQUE',
        poidsKg: DOUZE_TONNES_EN_KG, distanceKm: 500, montant: null
      });
      expect(k).toBeCloseTo(450, 6);
    });
  });
});
