import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { TrajectoireSbtiComponent } from './trajectoire-sbti.component';
import { ExerciceBilan } from '../../core/trajectoire-sbti';

/**
 * Paramètres de l'engagement SBTi : valeurs par défaut et réactivité.
 *
 * <p>Les quatre champs commandent tout ce que l'écran montre — la cible, la
 * pente du couloir, chaque écart du tableau. Ces bancs vérifient qu'ils
 * partent des valeurs de l'engagement et qu'une modification se propage
 * immédiatement, sans rechargement ni bouton d'application.</p>
 */
describe('TrajectoireSbtiComponent — paramètres de l\'engagement', () => {

  /** Exercices collectés : la base 2021 n'en fait pas partie. */
  const EXERCICES: ExerciceBilan[] = [
    { annee: 2022, scope1: 400, scope2: 100, scope3: 500, total: 1000 },
    { annee: 2023, scope1: 380, scope2: 95, scope3: 480, total: 955 },
    { annee: 2024, scope1: 360, scope2: 90, scope3: 470, total: 920 }
  ];

  let composant: TrajectoireSbtiComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TrajectoireSbtiComponent] });
    composant = TestBed.createComponent(TrajectoireSbtiComponent).componentInstance;
    composant.exercices = EXERCICES;
  });

  describe('valeurs par défaut', () => {

    it('part de l\'engagement Misfat Filtration', () => {
      expect(composant.anneeBase()).toBe(2021);
      expect(composant.anneeCible()).toBe(2030);
      expect(composant.reductionPct()).toBe(42);
      expect(composant.perimetre()).toBe('SCOPES_1_3');
    });

    it('ne se présente pas comme une simulation au chargement', () => {
      expect(composant.engagementIntact()).toBe(true);
    });

    it('propose les cinq périmètres, Scopes 1 + 3 en tête', () => {
      expect(composant.PERIMETRES[0].code).toBe('SCOPES_1_3');
      expect(composant.PERIMETRES.length).toBe(5);
    });
  });

  describe('année de base non collectée', () => {

    it('signale le repli sur le premier exercice chiffré', () => {
      // 2021 n'est pas collecté : le couloir part de 2022, et l'écran le dit.
      expect(composant.baseSubstituee()).toBe(2022);
      expect(composant.trajectoire()?.anneeBase).toBe(2022);
    });

    it('ne signale rien quand la base demandée est chiffrée', () => {
      composant.anneeBase.set(2022);
      expect(composant.baseSubstituee()).toBeNull();
    });
  });

  describe('recalcul immédiat à chaque modification', () => {

    it('recalcule la cible quand la réduction change', () => {
      // Base retenue : 2022, scopes 1 + 3 = 400 + 500 = 900 t.
      const base = composant.trajectoire()!.valeurBase;
      expect(base).toBe(900);
      expect(composant.trajectoire()!.valeurCible).toBeCloseTo(900 * 0.58, 6);

      composant.reductionPct.set(50);
      expect(composant.trajectoire()!.valeurCible).toBeCloseTo(450, 6);
    });

    it('recalcule le couloir quand l\'échéance change', () => {
      const avant = composant.trajectoire()!.points.length;

      composant.anneeCible.set(2040);
      const apres = composant.trajectoire()!.points.length;

      expect(apres).toBeGreaterThan(avant);
      expect(composant.trajectoire()!.anneeCible).toBe(2040);
    });

    it('recalcule la base quand le périmètre change', () => {
      composant.perimetre.set('TOTAL');
      // Tous scopes en 2022 : 1 000 t, contre 900 sur les scopes 1 + 3.
      expect(composant.trajectoire()!.valeurBase).toBe(1000);

      composant.perimetre.set('SCOPE_1');
      expect(composant.trajectoire()!.valeurBase).toBe(400);
    });

    it('recalcule le tableau des écarts avec les paramètres', () => {
      const ecartInitial = composant.lignesTableau()
        .find(l => l.annee === 2024)?.ecart;

      composant.reductionPct.set(90);
      const ecartApres = composant.lignesTableau()
        .find(l => l.annee === 2024)?.ecart;

      // Une cible plus exigeante creuse l'écart du même exercice réel.
      expect(ecartApres!).toBeGreaterThan(ecartInitial!);
    });

    it('bascule en simulation dès qu\'un paramètre quitte l\'engagement', () => {
      composant.reductionPct.set(30);
      expect(composant.engagementIntact()).toBe(false);

      composant.retablirEngagement();
      expect(composant.engagementIntact()).toBe(true);
      expect(composant.anneeBase()).toBe(2021);
      expect(composant.reductionPct()).toBe(42);
    });
  });
});
