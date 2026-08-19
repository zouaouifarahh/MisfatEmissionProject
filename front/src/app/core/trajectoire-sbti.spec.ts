import { describe, it, expect } from 'vitest';

import {
  construireTrajectoire, effortRestant, statutTrajectoire,
  valeurPerimetre, libellePerimetre, ExerciceBilan
} from './trajectoire-sbti';

/**
 * Trajectoire SBTi : l'écart à l'engagement, pas la courbe qui flatte.
 *
 * <p>Ce banc protège trois propriétés qu'un tableau de bord carbone perd
 * facilement : l'année de base ne bouge pas, un exercice non collecté ne compte
 * pas pour zéro, et le réel ne se prolonge jamais au-delà de ce qui a été
 * mesuré.</p>
 */
describe('Trajectoire SBTi', () => {

  /** Série MISFAT resserrée : base 2023, deux exercices collectés. */
  const serie = (): ExerciceBilan[] => ([
    { annee: 2023, scope1: 3_041, scope2: 9_905, scope3: 70_425, total: 83_371 },
    { annee: 2024, scope1: 3_100, scope2: 9_400, scope3: 68_000, total: 80_500 }
  ]);

  const PARAMS = { anneeBase: 2023, anneeCible: 2030, reductionPct: 42,
                   perimetre: 'SCOPES_1_3' as const };

  describe('périmètre engagé', () => {

    it('additionne les seuls scopes couverts par la cible', () => {
      // La cible MISFAT porte sur 1 + 3 ; le scope 2 relève d'un engagement
      // distinct — 100 % de renouvelable — qui ne s'exprime pas en pourcentage.
      const exercice = serie()[0];

      expect(valeurPerimetre(exercice, 'SCOPES_1_3')).toBe(73_466);
      expect(valeurPerimetre(exercice, 'TOTAL')).toBe(83_371);
      expect(valeurPerimetre(exercice, 'SCOPE_2')).toBe(9_905);
    });

    it('nomme le périmètre pour que le lecteur sache ce qui est mesuré', () => {
      expect(libellePerimetre('SCOPES_1_3')).toBe('Scopes 1 + 3');
      expect(libellePerimetre('TOTAL')).toBe('Tous scopes');
    });
  });

  describe('construction du couloir', () => {

    it('fixe la valeur de base sur l\'année de base déclarée', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.anneeBase).toBe(2023);
      expect(t.valeurBase).toBe(73_466);
    });

    it('applique la réduction promise à l\'échéance', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.valeurCible).toBeCloseTo(73_466 * 0.58, 6);
      expect(t.anneeCible).toBe(2030);
    });

    it('couvre chaque année de la base à l\'échéance, sans trou', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.points.map(p => p.annee))
        .toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    });

    it('décroît linéairement — la convention de court terme', () => {
      // Une exponentielle donnerait un couloir plus indulgent les premières
      // années : exactement ce qu'un pilotage ne doit pas faire.
      const t = construireTrajectoire(serie(), PARAMS)!;
      const ecarts = t.points.slice(1).map((p, i) => t.points[i].cible - p.cible);

      for (const ecart of ecarts) expect(ecart).toBeCloseTo(t.effortAnnuel, 6);
    });

    it('ferme le couloir exactement sur la cible', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.points[t.points.length - 1].cible).toBeCloseTo(t.valeurCible, 6);
    });

    it('se rabat sur le premier exercice chiffré quand la base n\'est pas collectée', () => {
      // Une base non collectée rendrait toute la trajectoire arbitraire.
      const t = construireTrajectoire(serie(), { ...PARAMS, anneeBase: 2019 })!;

      expect(t.anneeBase).toBe(2023);
    });
  });

  describe('écart à l\'engagement', () => {

    it('mesure la dérive du dernier exercice', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;
      const pente = t.effortAnnuel;
      const point = t.points.find(p => p.annee === 2024)!;

      expect(point.reel).toBe(71_100);
      expect(point.cible).toBeCloseTo(73_466 - pente, 6);
      expect(point.ecart).toBeCloseTo(71_100 - (73_466 - pente), 6);
    });

    it('déclare non conforme un exercice au-dessus du couloir', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.points.find(p => p.annee === 2024)!.conforme).toBe(false);
      expect(statutTrajectoire(t)).toBe('DERIVE');
    });

    it('déclare conforme un exercice qui tient la trajectoire', () => {
      const avance: ExerciceBilan[] = [
        { annee: 2023, scope1: 3_041, scope2: 0, scope3: 70_425, total: 73_466 },
        { annee: 2024, scope1: 2_500, scope2: 0, scope3: 60_000, total: 62_500 }
      ];
      const t = construireTrajectoire(avance, PARAMS)!;

      expect(t.points.find(p => p.annee === 2024)!.conforme).toBe(true);
      expect(statutTrajectoire(t)).toBe('CONFORME');
    });

    it('l\'année de base est toujours sur le couloir, par construction', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;
      const base = t.points[0];

      expect(base.ecart).toBeCloseTo(0, 6);
      expect(base.conforme).toBe(true);
    });
  });

  describe('exercices non collectés', () => {

    it('laisse sans réel une année qui n\'a pas été saisie', () => {
      // Un exercice non collecté n'est pas un exercice à zéro : afficher −100 %
      // ferait passer un défaut de collecte pour une performance.
      const t = construireTrajectoire(serie(), PARAMS)!;
      const point = t.points.find(p => p.annee === 2026)!;

      expect(point.reel).toBeNull();
      expect(point.ecart).toBeNull();
      expect(point.conforme).toBeNull();
    });

    it('marque comme projetée toute année postérieure au dernier exercice', () => {
      // Au-delà du dernier exercice, seule la cible est tracée : une donnée
      // projetée présentée comme mesurée est ce qu'un audit sanctionne.
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.points.filter(p => p.projete).map(p => p.annee))
        .toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
      expect(t.points.filter(p => p.projete).every(p => p.reel === null)).toBe(true);
    });

    it('ignore un exercice ouvert mais vide dans le choix de la base', () => {
      const avecVide: ExerciceBilan[] = [
        { annee: 2022, scope1: 0, scope2: 0, scope3: 0, total: 0 },
        ...serie()
      ];
      const t = construireTrajectoire(avecVide, { ...PARAMS, anneeBase: null })!;

      expect(t.anneeBase).toBe(2023);
    });

    it('retient le dernier exercice réellement chiffré', () => {
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(t.dernierExercice?.annee).toBe(2024);
    });
  });

  describe('effort restant à fournir', () => {

    it('compte depuis le dernier exercice, non depuis l\'année de base', () => {
      // C'est le chiffre qui pilote : combien retirer chaque année à partir de
      // maintenant.
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(effortRestant(t)).toBeCloseTo((71_100 - t.valeurCible) / 6, 6);
    });

    it('rend l\'effort supérieur à l\'effort initial après une dérive', () => {
      // Le coût du retard doit être visible.
      const t = construireTrajectoire(serie(), PARAMS)!;

      expect(effortRestant(t)!).toBeGreaterThan(t.effortAnnuel);
    });

    it('ne prétend rien sans exercice collecté', () => {
      expect(effortRestant(null)).toBeNull();
      expect(statutTrajectoire(null)).toBe('INCONNU');
    });
  });

  describe('entrées inexploitables', () => {

    it('rend null sans aucun exercice', () => {
      expect(construireTrajectoire([], PARAMS)).toBeNull();
      expect(construireTrajectoire(null, PARAMS)).toBeNull();
    });

    it('rend null quand aucun exercice n\'est chiffré sur le périmètre', () => {
      const sansScope1ni3: ExerciceBilan[] = [
        { annee: 2023, scope1: 0, scope2: 9_905, scope3: 0, total: 9_905 }
      ];

      expect(construireTrajectoire(sansScope1ni3, PARAMS)).toBeNull();
    });

    it('rend null si l\'échéance ne suit pas l\'année de base', () => {
      // Une échéance antérieure à la base ne décrit aucune trajectoire.
      expect(construireTrajectoire(serie(), { ...PARAMS, anneeCible: 2022 })).toBeNull();
      expect(construireTrajectoire(serie(), { ...PARAMS, anneeCible: 2023 })).toBeNull();
    });

    it('borne une réduction aberrante plutôt que d\'inventer une cible négative', () => {
      const t = construireTrajectoire(serie(), { ...PARAMS, reductionPct: 150 })!;

      expect(t.valeurCible).toBe(0);
      expect(t.points.every(p => p.cible >= -1e-9)).toBe(true);
    });
  });
});
