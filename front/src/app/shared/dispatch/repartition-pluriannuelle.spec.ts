import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DispatchStore, LigneValorisee } from './dispatch-store';
import { mesuresLocalesModifiees$ } from './mesures-locales';

/**
 * Répartition couvrant plusieurs exercices.
 *
 * <p>Le cloisonnement se jugeait sur le lot : un classeur portait un millésime,
 * celui lu dans son nom de fichier, et consulter une autre année l'écartait en
 * bloc. Un inventaire pluriannuel — une base d'immobilisations couvrant 2024,
 * 2025 et 2026 — versait donc tout sur une seule année, et ses lignes de 2024
 * n'alimentaient jamais 2024. Le total restait plausible sous un exercice qu'il
 * ne documentait pas, ce qui est plus insidieux qu'une absence.</p>
 */
describe('Répartition — un classeur, plusieurs exercices', () => {

  const ligne = (cle: string, exercice: number | null, kg: number): LigneValorisee => ({
    cle, feuille: 'Immo', ligneSource: 1, mainAccount: '215000',
    nom: 'Machine ' + cle, categorieCarboneTexte: '', categorieAbsente: false,
    reference: '', quantite: 1000, exercice, colonneValeur: 'Débit',
    colonnesEcartees: [], ecran: 'investissements', scope: 'SCOPE_3',
    motif: '', origineRoutage: 'compte', motCle: '', exclu: false,
    facteur: 0.25, uniteFacteur: 'TND', libelleFacteur: '', baseAppliquee: '',
    origineFacteur: 'MS SQL BDD', emissionKg: kg, referenceCarbone: ''
  });

  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    magasin = TestBed.inject(DispatchStore);

    magasin.publier({
      fichier: 'Immobilisations.xlsx', importeLe: '', exclues: 0, nonVentilees: 0,
      // Le classeur ne porte pas d'année dans son nom : seules les lignes
      // renseignent l'exercice.
      exercice: null, entityId: null,
      lignes: [
        ligne('a', 2024, 1_000),
        ligne('b', 2025, 2_000),
        ligne('c', 2025, 3_000),
        ligne('d', 2026, 4_000)
      ]
    });
  });

  describe('chaque exercice reçoit ses propres lignes', () => {

    it('rend les lignes de 2024 sur 2024', () => {
      const retenues = magasin.lignesPour(2024, null);

      expect(retenues.map(l => l.cle)).toEqual(['a']);
    });

    it('rend les deux lignes de 2025 sur 2025', () => {
      expect(magasin.lignesPour(2025, null).map(l => l.cle)).toEqual(['b', 'c']);
    });

    it('n\'écarte plus le classeur en bloc', () => {
      // C'est le defaut signale : consulter 2024 ne rendait rien, tout le lot
      // etant date du millesime du fichier.
      expect(magasin.lignesPour(2024, null)).not.toHaveLength(0);
      expect(magasin.lignesPour(2026, null)).not.toHaveLength(0);
    });

    it('ne rend rien sur un exercice qu\'aucune ligne ne documente', () => {
      expect(magasin.lignesPour(2023, null)).toHaveLength(0);
    });

    it('rend tout quand aucun exercice n\'est demandé', () => {
      expect(magasin.lignesPour(null, null)).toHaveLength(4);
    });
  });

  describe('lignes sans date', () => {

    it('retombent sur le millésime du classeur', () => {
      magasin.publier({
        fichier: 'BG MISFAT 2025.xlsx', importeLe: '', exclues: 0, nonVentilees: 0,
        exercice: 2025, entityId: null,
        lignes: [ligne('x', null, 500), ligne('y', 2024, 700)]
      });

      expect(magasin.lignesPour(2025, null).map(l => l.cle)).toEqual(['x']);
      expect(magasin.lignesPour(2024, null).map(l => l.cle)).toEqual(['y']);
    });
  });

  describe('cloisonnement par société', () => {

    it('reste un critère de lot', () => {
      // Le classeur est importe pour une societe, et ses lignes n'en portent
      // pas d'autre.
      magasin.publier({
        fichier: 'Immo.xlsx', importeLe: '', exclues: 0, nonVentilees: 0,
        exercice: null, entityId: 1,
        lignes: [ligne('a', 2025, 100)]
      });

      expect(magasin.lignesPour(2025, 1)).toHaveLength(1);
      expect(magasin.lignesPour(2025, 2)).toHaveLength(0);
    });
  });

  describe('exercices couverts', () => {

    it('annonce ce que le classeur documente, du plus récent au plus ancien', () => {
      expect(magasin.exercicesCouverts()).toEqual([
        { exercice: 2026, lignes: 1 },
        { exercice: 2025, lignes: 2 },
        { exercice: 2024, lignes: 1 }
      ]);
    });
  });

  describe('émissions retenues par le périmètre', () => {

    it('compte par différence, et non tout ou rien', () => {
      // Depuis que l'exercice se juge ligne par ligne, un classeur peut etre
      // retenu pour partie : dire « rien n'est compte » serait alors faux.
      magasin.suivrePerimetre(2025, null);

      // Retenu : 2 000 + 3 000. Ecarte : 1 000 (2024) + 4 000 (2026).
      expect(magasin.emissionKgHorsPerimetre()).toBe(5_000);
    });

    it('ne signale rien quand tout est compté', () => {
      magasin.suivrePerimetre(null, null);

      expect(magasin.emissionKgHorsPerimetre()).toBe(0);
    });
  });

  describe('annonce aux vues qui agrègent', () => {

    it('prévient dès qu\'une répartition est publiée', () => {
      // Le magasin diffusait a ses propres abonnes, mais le tableau de bord
      // n'ecoute que ce signal : un import restait invisible sur ses cartes
      // jusqu'au prochain changement de filtre.
      let annonces = 0;
      const abonnement = mesuresLocalesModifiees$.subscribe(() => annonces++);

      magasin.publier({
        fichier: 'Autre.xlsx', importeLe: '', exclues: 0, nonVentilees: 0,
        exercice: null, entityId: null, lignes: [ligne('z', 2025, 10)]
      });

      expect(annonces).toBe(1);
      abonnement.unsubscribe();
    });

    it('prévient aussi quand la répartition change d\'exercice', () => {
      let annonces = 0;
      const abonnement = mesuresLocalesModifiees$.subscribe(() => annonces++);

      magasin.rattacherAExercice(2027);

      expect(annonces).toBe(1);
      abonnement.unsubscribe();
    });
  });
});
