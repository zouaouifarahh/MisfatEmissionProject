import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  DispatchStore, LigneValorisee, FACTEUR_MONETAIRE_MAX, facteurPlausible
} from './dispatch-store';

/**
 * Garde-fou de vraisemblance sur le facteur d'émission corrigé.
 *
 * <p>La correction manuelle donne à l'utilisateur le dernier mot sur le
 * facteur : c'est son objet même, et c'est pourquoi elle est dangereuse. Un
 * champ libre finit toujours par recevoir une valeur de test, et un ratio
 * monétaire n'a aucune borne naturelle qui l'arrêterait — 9 999 se calcule
 * aussi bien que 0,25.</p>
 *
 * <p>Un facteur de 9 999 kgCO₂e par dinar appliqué à 1,5 million de dinars a
 * porté un seul poste à 15 millions de tonnes, soit 96 % de l'empreinte
 * affichée pour l'exercice. Le total n'était pas mal additionné : il était
 * exactement juste sur une donnée fausse.</p>
 */
describe('Facteur monétaire — garde-fou de vraisemblance', () => {

  const ligneDe = (sur: Partial<LigneValorisee> = {}): LigneValorisee => ({
    cle: 'BG#1', feuille: 'BG', ligneSource: 2, mainAccount: '601000',
    nom: 'Voyages et déplacements (autres)', categorieCarboneTexte: 'Travel',
    categorieAbsente: false, reference: '', quantite: 1_548_240, colonneValeur: 'Débit',
    colonnesEcartees: [], ecran: 'voyages-affaires', scope: 'SCOPE_3',
    motif: 'compte 601000', origineRoutage: 'compte', motCle: '601000', exclu: false,
    facteur: 0.3, uniteFacteur: 'TND', libelleFacteur: 'Travel',
    baseAppliquee: 'MS SQL BDD', origineFacteur: 'MS SQL BDD',
    emissionKg: 464_472, referenceCarbone: '', ...sur
  } as LigneValorisee);

  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    magasin = TestBed.inject(DispatchStore);

    magasin.publier({
      lignes: [ligneDe()], fichier: 'BG MISFAT 2025.xlsx', importeLe: '2026-01-01',
      exclues: 0, nonVentilees: 0, exercice: 2025, entityId: 1
    });
  });

  describe('règle de plausibilité', () => {

    it('accepte les ratios monétaires du référentiel', () => {
      // Les facteurs réellement portés par la base MISFAT : 0,101 à 0,55.
      for (const facteur of [0.101, 0.235, 0.55, 2, 100]) {
        expect(facteurPlausible(facteur)).toBe(true);
      }
    });

    it('refuse les valeurs hors d\'échelle et les valeurs impossibles', () => {
      for (const facteur of [2222, 9999, 1e6]) {
        expect(facteurPlausible(facteur)).toBe(false);
      }
      for (const facteur of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(facteurPlausible(facteur)).toBe(false);
      }
    });

    it('place la borne à 100 kgCO₂e par unité de devise', () => {
      expect(FACTEUR_MONETAIRE_MAX).toBe(100);
      expect(facteurPlausible(FACTEUR_MONETAIRE_MAX)).toBe(true);
      expect(facteurPlausible(FACTEUR_MONETAIRE_MAX + 0.01)).toBe(false);
    });
  });

  describe('reprise du facteur dans le magasin', () => {

    it('applique un facteur plausible et recalcule l\'émission', () => {
      expect(magasin.reprendreFacteur(['BG#1'], 0.25)).toBe(1);

      const ligne = magasin.instantane.lignes[0];
      expect(ligne.facteur).toBe(0.25);
      expect(ligne.emissionKg).toBeCloseTo(1_548_240 * 0.25, 3);
    });

    it('refuse le facteur de 9 999 qui a produit les 15 millions de tonnes', () => {
      expect(magasin.reprendreFacteur(['BG#1'], 9999)).toBe(0);

      // La ligne garde son facteur d'origine : rien n'est appliqué à moitié.
      const ligne = magasin.instantane.lignes[0];
      expect(ligne.facteur).toBe(0.3);
      expect(ligne.emissionKg).toBe(464_472);
    });

    it('laisse la ligne à écrire quand la reprise est refusée', () => {
      magasin.marquerPersistees(['BG#1']);
      magasin.reprendreFacteur(['BG#1'], 9999);

      // Refus n'est pas modification : l'état de persistance ne bouge pas.
      expect(magasin.instantane.lignes[0].persisteeEnBase).toBe(true);
    });

    it('borne l\'empreinte d\'un poste à un ordre de grandeur défendable', () => {
      // Le pire cas admis reste très au-dessus du réel, mais sous le seuil
      // d'invraisemblance du tableau de bord une fois converti en tonnes.
      magasin.reprendreFacteur(['BG#1'], FACTEUR_MONETAIRE_MAX);
      const tonnes = magasin.instantane.lignes[0].emissionKg / 1000;

      expect(tonnes).toBeCloseTo(154_824, 0);
      expect(tonnes).toBeLessThan(1_000_000);
    });
  });
});
