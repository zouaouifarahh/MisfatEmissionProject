import { describe, it, expect } from 'vitest';

import {
  appliquerFacteurEnMasse, facteurValide, facteurSaisi, messagePourMasse, ChampsMasse
} from './modification-masse';

/**
 * Reprise d'un facteur sur tout un lot de lignes.
 *
 * <p>Corriger un facteur ligne à ligne sur plusieurs centaines
 * d'immobilisations n'est pas seulement long : rien ne garantit que la même
 * valeur ait été saisie partout, et l'écart passe inaperçu dans un total.</p>
 *
 * <p>Ce qui se joue ici touche directement l'empreinte affichée : une reprise
 * qui se trompe de grandeur ou qui recalcule mal fausse une catégorie entière
 * d'un seul geste. D'où le compte rendu chiffré, qui donne à voir l'écart
 * produit plutôt que de laisser l'utilisateur le découvrir dans le rapport.</p>
 */
describe('Modification en masse d\'un facteur', () => {

  interface Ligne {
    id: number;
    montant: number;
    facteur: number;
    emissionCalculee: number;
    baseAppliquee: string;
    origineFacteur: string;
  }

  const CHAMPS: ChampsMasse = {
    grandeur: 'montant', facteur: 'facteur', emission: 'emissionCalculee',
    base: 'baseAppliquee', origine: 'origineFacteur'
  };

  const ligneDe = (sur: Partial<Ligne> = {}): Ligne => ({
    id: 1, montant: 10_000, facteur: 0.31, emissionCalculee: 3_100,
    baseAppliquee: 'ADEME Fallback', origineFacteur: 'ADEME Fallback', ...sur
  });

  describe('validation de la saisie', () => {

    it('accepte un facteur strictement positif', () => {
      expect(facteurValide(0.42)).toBe(true);
      expect(facteurValide('0,42')).toBe(true);
      expect(facteurValide('0.42')).toBe(true);
    });

    it('refuse zéro', () => {
      // Zéro annulerait l'émission de toute une catégorie sans laisser de
      // trace ; neutraliser un poste passe par la déclaration prévue pour cela.
      expect(facteurValide(0)).toBe(false);
      expect(facteurValide('0')).toBe(false);
    });

    it('refuse le négatif et l\'illisible', () => {
      expect(facteurValide(-1)).toBe(false);
      expect(facteurValide('abc')).toBe(false);
      expect(facteurValide('')).toBe(false);
      expect(facteurValide(null)).toBe(false);
    });

    it('admet la virgule décimale', () => {
      expect(facteurSaisi('0,0492')).toBeCloseTo(0.0492, 10);
      expect(facteurSaisi('abc')).toBeNull();
    });
  });

  describe('application du facteur', () => {

    it('recalcule l\'émission depuis la grandeur', () => {
      const { lignes, modifiees } = appliquerFacteurEnMasse([ligneDe()], 0.42, CHAMPS);

      // 10 000 TND × 0,42, et non l'ancienne émission réajustée : ici la
      // nouvelle valeur est connue et fait autorité.
      expect(modifiees).toBe(1);
      expect(lignes[0].facteur).toBeCloseTo(0.42, 10);
      expect(lignes[0].emissionCalculee).toBeCloseTo(4_200, 4);
    });

    it('reprend toutes les lignes du lot', () => {
      const lot = [
        ligneDe({ id: 1, montant: 10_000 }),
        ligneDe({ id: 2, montant: 25_000, emissionCalculee: 7_750 }),
        ligneDe({ id: 3, montant: 4_000, emissionCalculee: 1_240 })
      ];

      const { lignes, modifiees } = appliquerFacteurEnMasse(lot, 0.5, CHAMPS);

      expect(modifiees).toBe(3);
      expect(lignes.map(l => l.emissionCalculee)).toEqual([5_000, 12_500, 2_000]);
    });

    it('rapporte l\'écart d\'émission produit', () => {
      const lot = [ligneDe({ montant: 10_000, emissionCalculee: 3_100 })];
      const { ecartKg, message } = appliquerFacteurEnMasse(lot, 0.42, CHAMPS);

      // 4 200 − 3 100 : l'utilisateur voit ce que sa reprise change avant de
      // le découvrir dans le rapport.
      expect(ecartKg).toBeCloseTo(1_100, 4);
      expect(message).toContain('1 ligne(s)');
      expect(message).toContain('+');
    });

    it('annonce une baisse comme telle', () => {
      const { ecartKg, message } = appliquerFacteurEnMasse([ligneDe()], 0.1, CHAMPS);

      expect(ecartKg).toBeLessThan(0);
      expect(message).toContain('−');
    });

    it('n\'écrit pas une ligne qui porte déjà la valeur', () => {
      const deja = [ligneDe({ facteur: 0.42, emissionCalculee: 4_200 })];
      const { lignes, modifiees, message } = appliquerFacteurEnMasse(deja, 0.42, CHAMPS);

      expect(modifiees).toBe(0);
      // Même objet : rien n'a été réécrit, donc rien n'a pu être abîmé.
      expect(lignes[0]).toBe(deja[0]);
      expect(message).toContain('déjà ce facteur');
    });

    it('ne reprend que les lignes qui changent, dans un lot mixte', () => {
      const lot = [
        ligneDe({ id: 1, facteur: 0.31 }),
        ligneDe({ id: 2, facteur: 0.42, emissionCalculee: 4_200 }),
        ligneDe({ id: 3, facteur: 0.38, emissionCalculee: 3_800 })
      ];

      const { modifiees } = appliquerFacteurEnMasse(lot, 0.42, CHAMPS);
      expect(modifiees).toBe(2);
    });

    it('inscrit la provenance de la nouvelle valeur', () => {
      const { lignes } = appliquerFacteurEnMasse([ligneDe()], 0.42, CHAMPS);

      // Une valeur saisie à la main ne doit pas se confondre avec une valeur
      // du référentiel : la base documentaire le dit.
      expect(lignes[0].baseAppliquee).toContain('reprise en masse');
      expect(lignes[0].origineFacteur).toBe('ADEME Fallback');
    });

    it('accepte une base documentaire choisie par l\'écran', () => {
      const { lignes } = appliquerFacteurEnMasse(
        [ligneDe()], 0.42, CHAMPS, 'Étude interne 2026'
      );

      expect(lignes[0].baseAppliquee).toBe('Étude interne 2026');
    });
  });

  describe('refus et cas limites', () => {

    it('ne touche à rien avec un facteur invalide', () => {
      const lot = [ligneDe()];

      for (const invalide of [0, -1, NaN]) {
        const { lignes, modifiees } = appliquerFacteurEnMasse(lot, invalide, CHAMPS);
        expect(modifiees).toBe(0);
        expect(lignes[0].facteur).toBeCloseTo(0.31, 10);
      }
    });

    it('accepte un lot vide', () => {
      expect(appliquerFacteurEnMasse([], 0.42, CHAMPS).modifiees).toBe(0);
      expect(appliquerFacteurEnMasse(null, 0.42, CHAMPS).lignes).toEqual([]);
    });

    it('ne modifie pas les lignes d\'origine', () => {
      const origine = ligneDe();
      appliquerFacteurEnMasse([origine], 0.42, CHAMPS);

      expect(origine.facteur).toBeCloseTo(0.31, 10);
      expect(origine.emissionCalculee).toBe(3_100);
    });

    it('tolère un écran sans base ni origine', () => {
      const reduit: ChampsMasse = {
        grandeur: 'montant', facteur: 'facteur', emission: 'emissionCalculee'
      };
      const { lignes, modifiees } = appliquerFacteurEnMasse([ligneDe()], 0.42, reduit);

      expect(modifiees).toBe(1);
      // Les champs non déclarés ne sont pas inventés.
      expect(lignes[0].baseAppliquee).toBe('ADEME Fallback');
    });

    it('garde l\'émission quand la grandeur est illisible', () => {
      const bancale = [ligneDe({ montant: NaN, emissionCalculee: 3_100 })];
      const { lignes } = appliquerFacteurEnMasse(bancale, 0.42, CHAMPS);

      expect(lignes[0].emissionCalculee).toBe(3_100);
    });
  });

  describe('compte rendu', () => {

    it('se tait quand rien n\'a bougé', () => {
      expect(messagePourMasse(0, 0, 0.42)).toContain('Aucune ligne');
    });

    it('chiffre la reprise', () => {
      const message = messagePourMasse(12, 4_500, 0.42);
      expect(message).toContain('12 ligne(s)');
      expect(message).toContain('0,42');
      expect(message).toContain('kgCO₂e');
    });
  });
});
