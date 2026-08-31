import { describe, it, expect } from 'vitest';

import {
  perimetreOrganisation, trierParPerimetre, messagePerimetre
} from './perimetre-ecran';

/**
 * Cloisonnement des tableaux de mesure.
 *
 * <p>Les dix-neuf écrans de saisie affichaient toutes leurs lignes, quel que
 * soit le périmètre choisi dans l'en-tête : sélectionner « MISFAT TUNISIE » et
 * « 2025 » laissait voir les mesures du Maroc et celles de 2026. Le tableau de
 * bord, lui, les écartait déjà — les deux vues d'une même donnée ne s'accordaient
 * pas, et c'est l'écran de saisie qui avait tort : c'est là qu'on corrige une
 * ligne, et corriger celle d'une autre société est une faute qu'aucun message ne
 * rattrape ensuite.</p>
 */
describe('Tableaux de mesure — cloisonnement société et exercice', () => {

  /** Ligne de mesure réduite à ce que le cloisonnement lit. */
  const ligne = (p: Record<string, unknown>) => ({
    id: 1, dateDebut: '2025-01-01', dateFin: '2025-12-31', ...p
  });

  const TUNISIE = perimetreOrganisation(1, ['MISFAT I', 'MISFAT II'], 3);
  const GROUPE = perimetreOrganisation(null, [], 3);

  describe('rattachement par la société portée par la ligne', () => {

    it('retient la ligne de la société consultée', () => {
      const tri = trierParPerimetre([ligne({ societeId: 1 })], 2025, TUNISIE);

      expect(tri.retenues).toHaveLength(1);
      expect(tri.autreSociete).toBe(0);
    });

    it('écarte la ligne d\'une autre société', () => {
      const tri = trierParPerimetre([ligne({ societeId: 2 })], 2025, TUNISIE);

      expect(tri.retenues).toHaveLength(0);
      expect(tri.autreSociete).toBe(1);
    });

    it('prime sur le nom d\'usine', () => {
      // L'usine est une donnée de saisie, la société un rattachement posé à
      // l'enregistrement : c'est elle qui fait foi quand les deux divergent.
      const tri = trierParPerimetre(
        [ligne({ societeId: 2, etablissement: 'MISFAT I' })], 2025, TUNISIE);

      expect(tri.autreSociete).toBe(1);
    });
  });

  describe('rattachement de repli par l\'établissement', () => {

    it('retient une usine de la société', () => {
      const tri = trierParPerimetre([ligne({ etablissement: 'MISFAT I' })], 2025, TUNISIE);

      expect(tri.retenues).toHaveLength(1);
    });

    it('écarte une usine qui n\'est pas la sienne', () => {
      const tri = trierParPerimetre([ligne({ etablissement: 'CASA NORD' })], 2025, TUNISIE);

      expect(tri.autreSociete).toBe(1);
    });
  });

  describe('ligne qu\'aucun rattachement ne désigne', () => {

    it('la garde visible plutôt que de la faire disparaître', () => {
      // Plusieurs écrans — franchises, investissements — ne demandent aucune
      // usine, et les lignes antérieures ne portent pas de société. Les écarter
      // viderait ces tableaux d'un coup, sans qu'on distingue une donnée
      // cloisonnée d'une donnée perdue.
      const tri = trierParPerimetre([ligne({})], 2025, TUNISIE);

      expect(tri.retenues).toHaveLength(1);
      expect(tri.sansRattachement).toBe(1);
    });

    it('ne la compte pas à part en vue groupe', () => {
      // Sans société consultée, il n'y a rien à rattacher : le signaler serait
      // une alerte sans objet.
      const tri = trierParPerimetre([ligne({})], 2025, GROUPE);

      expect(tri.sansRattachement).toBe(0);
    });
  });

  describe('cloisonnement par exercice', () => {

    it('écarte une mesure d\'un autre millésime', () => {
      const tri = trierParPerimetre(
        [ligne({ societeId: 1, dateDebut: '2026-01-01', dateFin: '2026-12-31' })],
        2025, TUNISIE);

      expect(tri.retenues).toHaveLength(0);
      expect(tri.autreExercice).toBe(1);
    });

    it('retient tout quand aucun exercice n\'est demandé', () => {
      const lignes = [
        ligne({ societeId: 1 }),
        ligne({ societeId: 1, dateDebut: '2026-01-01', dateFin: '2026-12-31' })
      ];

      expect(trierParPerimetre(lignes, null, TUNISIE).retenues).toHaveLength(2);
    });

    it('précède le cloisonnement par société dans le décompte', () => {
      // Une ligne hors exercice n'est pas comptée comme « autre société » :
      // le message dirait deux fois la même exclusion.
      const tri = trierParPerimetre(
        [ligne({ societeId: 2, dateDebut: '2026-01-01', dateFin: '2026-12-31' })],
        2025, TUNISIE);

      expect(tri.autreExercice).toBe(1);
      expect(tri.autreSociete).toBe(0);
    });
  });

  describe('vue groupe', () => {

    it('ne cloisonne rien', () => {
      const lignes = [ligne({ societeId: 1 }), ligne({ societeId: 2 }), ligne({})];

      expect(trierParPerimetre(lignes, 2025, GROUPE).retenues).toHaveLength(3);
    });
  });

  describe('groupe d\'une seule société', () => {

    it('lui rattache les lignes sans société', () => {
      // À une société près, il n'y a pas d'ambiguïté à lever.
      const seule = perimetreOrganisation(1, [], 1);
      const tri = trierParPerimetre([ligne({})], 2025, seule);

      expect(tri.retenues).toHaveLength(1);
    });
  });

  describe('compte rendu', () => {

    it('dit ce qui a été écarté et pourquoi', () => {
      const tri = trierParPerimetre(
        [ligne({ societeId: 2 }), ligne({ societeId: 1, dateDebut: '2026-01-01', dateFin: '' })],
        2025, TUNISIE);

      const message = messagePerimetre(tri, 'MISFAT TUNISIE', 2025);
      expect(message).toContain('1 ligne(s) relèvent d\'une autre société');
      expect(message).toContain('autre exercice que 2025');
    });

    it('signale les lignes qu\'il n\'a pas pu rattacher', () => {
      const tri = trierParPerimetre([ligne({})], 2025, TUNISIE);

      expect(messagePerimetre(tri, 'MISFAT TUNISIE', 2025))
        .toContain('ne portent aucune société');
    });

    it('se tait quand rien n\'a été écarté', () => {
      const tri = trierParPerimetre([ligne({ societeId: 1 })], 2025, TUNISIE);

      expect(messagePerimetre(tri, 'MISFAT TUNISIE', 2025)).toBe('');
    });
  });
});
