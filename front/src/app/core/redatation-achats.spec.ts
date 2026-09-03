import { describe, it, expect, beforeEach } from 'vitest';

import {
  jouerMigrationsDeDemarrage, messageAchats, bilanAchats, MARQUEUR_ACHATS_2025
} from './migrations-demarrage';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';
import { releveDeLExercice } from './perimetre';

/**
 * Redatation des achats versés sous le mauvais millésime.
 *
 * <p>L'import des achats lisait une colonne de date ; absente du classeur, la
 * période restait vide et la ligne retombait sur sa date de création — donc sur
 * l'année de l'import. Un export d'achats 2025 versé en 2026 s'est ainsi
 * retrouvé daté de 2026, et restait invisible pour qui consulte 2025, alors que
 * l'import venait d'annoncer trente-sept mille lignes.</p>
 *
 * <p>L'import est corrigé depuis. Cette reprise ne vaut que pour les lignes déjà
 * versées, qu'aucune correction d'import ne peut rattraper.</p>
 */
describe('Reprise — achats redatés en 2025', () => {

  const CLE = CLES_PAR_CATEGORIE['biens-services'];
  const relire = () => JSON.parse(localStorage.getItem(CLE) ?? '[]');

  /** Ligne telle que l'import la posait : datée de l'année de versement. */
  const achat = (id: number, sur: Record<string, unknown> = {}) => ({
    id, etiquette: 'Achat ' + id, quantite: 1000, facteur: 0.1, emissionCalculee: 100,
    dateDebut: '2026-01-01', dateFin: '2026-12-31',
    societeId: 1, creeLe: '15/03/2026 09:12', ...sur
  });

  beforeEach(() => {
    localStorage.clear();
    bilanAchats.lignes = 0;
  });

  describe('lignes versées sous 2026', () => {

    it('les ramène à l\'exercice 2025', () => {
      localStorage.setItem(CLE, JSON.stringify([achat(1), achat(2)]));

      jouerMigrationsDeDemarrage();

      for (const ligne of relire()) {
        expect(ligne.dateDebut).toBe('2025-01-01');
        expect(ligne.dateFin).toBe('2025-12-31');
      }
    });

    it('les rend visibles sur le bilan 2025', () => {
      const avant = achat(1);
      expect(releveDeLExercice(avant, 2025)).toBe(false);

      localStorage.setItem(CLE, JSON.stringify([avant]));
      jouerMigrationsDeDemarrage();

      const [apres] = relire();
      expect(releveDeLExercice(apres, 2025)).toBe(true);
      expect(releveDeLExercice(apres, 2026)).toBe(false);
    });

    it('conserve tout le reste de la ligne', () => {
      // La reprise date ; elle ne recalcule rien et ne réapparie pas.
      localStorage.setItem(CLE, JSON.stringify([achat(7)]));

      jouerMigrationsDeDemarrage();

      const [ligne] = relire();
      expect(ligne.id).toBe(7);
      expect(ligne.etiquette).toBe('Achat 7');
      expect(ligne.emissionCalculee).toBe(100);
      expect(ligne.creeLe).toBe('15/03/2026 09:12');
    });

    it('compte ce qu\'elle a repris', () => {
      localStorage.setItem(CLE, JSON.stringify([achat(1), achat(2), achat(3)]));

      jouerMigrationsDeDemarrage();

      expect(bilanAchats.lignes).toBe(3);
      expect(messageAchats()).toContain('3 ligne(s)');
      expect(messageAchats()).toContain('2025');
    });
  });

  describe('lignes qu\'elle ne touche pas', () => {

    it('laisse une ligne déjà datée d\'un autre exercice', () => {
      localStorage.setItem(CLE, JSON.stringify([
        achat(1, { dateDebut: '2024-01-01', dateFin: '2024-12-31' })
      ]));

      jouerMigrationsDeDemarrage();

      expect(relire()[0].dateDebut).toBe('2024-01-01');
    });

    it('laisse une ligne rattachée à une autre société', () => {
      // L'arbitrage portait sur MISFAT TUNISIE : l'etendre a une filiale dont
      // personne n'a parle daterait ses achats au juge.
      localStorage.setItem(CLE, JSON.stringify([achat(1, { societeId: 2 })]));

      jouerMigrationsDeDemarrage();

      expect(relire()[0].dateDebut).toBe('2026-01-01');
    });

    it('reprend une ligne sans société', () => {
      // Les lignes anterieures a l'estampillage n'en portent pas : les ecarter
      // laisserait invisible precisement ce qu'on cherche a rendre visible.
      localStorage.setItem(CLE, JSON.stringify([achat(1, { societeId: null })]));

      jouerMigrationsDeDemarrage();

      expect(relire()[0].dateDebut).toBe('2025-01-01');
    });

    it('ne touche pas aux autres catégories', () => {
      const cleDechets = CLES_PAR_CATEGORIE['dechets'];
      localStorage.setItem(cleDechets, JSON.stringify([achat(1)]));

      jouerMigrationsDeDemarrage();

      expect(JSON.parse(localStorage.getItem(cleDechets) ?? '[]')[0].dateDebut)
        .toBe('2026-01-01');
    });
  });

  describe('rejeu', () => {

    it('ne repasse pas une fois le marqueur posé', () => {
      localStorage.setItem(CLE, JSON.stringify([achat(1)]));
      jouerMigrationsDeDemarrage();

      // Un achat verse apres coup releve de l'import corrige, qui date
      // desormais ses lignes : le redater d'office serait une decision de trop.
      localStorage.setItem(CLE, JSON.stringify([...relire(), achat(9)]));
      jouerMigrationsDeDemarrage();

      const lignes = relire();
      expect(lignes[0].dateDebut).toBe('2025-01-01');
      expect(lignes[1].dateDebut).toBe('2026-01-01');
      expect(localStorage.getItem(MARQUEUR_ACHATS_2025)).toBe('fait');
    });

    it('pose son marqueur même sans achat à reprendre', () => {
      jouerMigrationsDeDemarrage();

      expect(localStorage.getItem(MARQUEUR_ACHATS_2025)).toBe('fait');
      expect(messageAchats()).toBe('');
    });
  });
});
