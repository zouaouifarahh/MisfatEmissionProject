import { describe, it, expect } from 'vitest';

import { recalculerEchelle, messageRecalcul, LigneRecalculable } from './recalcul-echelle';

/**
 * Reprise des lignes calculées avant la correction d'échelle massique.
 *
 * <p>La formule est corrigée, mais le stockage ne se recalcule pas tout seul :
 * les lignes déjà enregistrées portent leur émission telle qu'elle a été
 * calculée à la saisie. Une seule ligne résiduelle suffit à porter une filiale
 * au-dessus du million de tonnes, et le bandeau d'invraisemblance reste allumé
 * sur une cause pourtant réparée.</p>
 *
 * <p>Le bandeau n'est pas le défaut : c'est le détecteur, et le seul qui ait
 * signalé ces 37 millions. Ce sont les données qu'on répare — il s'éteint
 * ensuite de lui-même.</p>
 */
describe('Transport amont — reprise de l\'échelle massique', () => {

  const ligne = (sur: Partial<LigneRecalculable> = {}): LigneRecalculable => ({
    facteur: 3_100.5, uniteFacteur: 'Tonne', devise: 'TND',
    montant: null, poidsKg: 12_000, distanceKm: null,
    emissionCalculee: 37_206_000, ...sur
  });

  describe('ligne calculée sous l\'ancienne formule', () => {

    it('ramène l\'émission à son ordre de grandeur', () => {
      // 12 t × 3 100,5 = 37 206 kgCO₂e, et non 37 206 000.
      const bilan = recalculerEchelle([ligne()]);

      expect(bilan.reprises).toBe(1);
      expect(bilan.lignes[0].emissionCalculee).toBeCloseTo(37_206, 3);
    });

    it('rapporte l\'écart, négatif quand le bilan baisse', () => {
      const bilan = recalculerEchelle([ligne()]);

      expect(bilan.ecartKg).toBeLessThan(0);
      expect(Math.abs(bilan.ecartKg)).toBeCloseTo(37_206_000 - 37_206, 0);
    });

    it('ne touche à rien d\'autre sur la ligne', () => {
      // La reprise recalcule ; elle ne réapparie pas et n'invente aucune
      // donnée : le facteur, le poids et l'unité restent ceux de la ligne.
      const bilan = recalculerEchelle([ligne()]);

      expect(bilan.lignes[0].facteur).toBe(3_100.5);
      expect(bilan.lignes[0].poidsKg).toBe(12_000);
      expect(bilan.lignes[0].uniteFacteur).toBe('Tonne');
    });
  });

  describe('ligne déjà juste', () => {

    it('la laisse strictement telle quelle', () => {
      const juste = ligne({ uniteFacteur: 'kg', facteur: 0.5, emissionCalculee: 6_000 });
      const bilan = recalculerEchelle([juste]);

      expect(bilan.reprises).toBe(0);
      // Même objet : le décompte doit dire ce qui a bougé, pas ce qui a été
      // parcouru.
      expect(bilan.lignes[0]).toBe(juste);
    });

    it('ignore un écart d\'arrondi flottant', () => {
      // Un centième de kilogramme n'est pas une correction : le compter
      // ferait annoncer une reprise là où rien n'a changé.
      const bilan = recalculerEchelle([
        ligne({ uniteFacteur: 'kg', facteur: 0.5, emissionCalculee: 6_000.01 })
      ]);

      expect(bilan.reprises).toBe(0);
    });
  });

  describe('lignes valorisées autrement', () => {

    it('laisse une ligne monétaire intacte', () => {
      // L'unité du facteur égale la devise : la ligne se valorise au montant,
      // que la correction d'échelle n'a jamais touché.
      const bilan = recalculerEchelle([
        ligne({ uniteFacteur: 'TND', devise: 'TND', montant: 4_000,
                poidsKg: null, facteur: 0.25, emissionCalculee: 1_000 })
      ]);

      expect(bilan.reprises).toBe(0);
    });

    it('laisse une ligne en tonnes-kilomètres intacte', () => {
      const bilan = recalculerEchelle([
        ligne({ uniteFacteur: 'Tonne.Km', facteur: 0.014, poidsKg: 12_000,
                distanceKm: 800, emissionCalculee: 134.4 })
      ]);

      expect(bilan.reprises).toBe(0);
    });
  });

  describe('cas limites', () => {

    it('ne bronche pas sur une liste vide ou absente', () => {
      expect(recalculerEchelle([]).reprises).toBe(0);
      expect(recalculerEchelle(null).lignes).toEqual([]);
      expect(recalculerEchelle(undefined).reprises).toBe(0);
    });

    it('ne reprend que les lignes fautives d\'un lot mêlé', () => {
      const bilan = recalculerEchelle([
        ligne(),
        ligne({ uniteFacteur: 'kg', facteur: 0.5, emissionCalculee: 6_000 }),
        ligne({ poidsKg: 3_000, emissionCalculee: 9_301_500 })
      ]);

      expect(bilan.reprises).toBe(2);
    });
  });

  describe('compte rendu', () => {

    it('dit combien de lignes et combien de tonnes ont été retirées', () => {
      const message = messageRecalcul(recalculerEchelle([ligne()]));

      expect(message).toContain('1 ligne(s) recalculée(s)');
      expect(message).toContain('retirée(s) du bilan');
    });

    it('reste muet quand rien n\'a bougé', () => {
      expect(messageRecalcul(recalculerEchelle([]))).toBe('');
    });
  });
});
