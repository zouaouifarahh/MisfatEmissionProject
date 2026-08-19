import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DispatchStore, LigneValorisee } from './dispatch-store';
import { adapterVersMesure } from './adaptateurs-mesure';

/**
 * Reprise du facteur sur les lignes issues de la ventilation comptable.
 *
 * <p>La reprise en masse ne touchait que les lignes saisies. Une catégorie
 * corrigée restait donc à moitié à l'ancienne valeur, et le total ne bougeait
 * pas comme l'utilisateur l'attendait — sans que rien ne le signale.</p>
 *
 * <p>La correction vit dans le magasin, seul détenteur de ces lignes et seul
 * capable de les republier à tous ses abonnés : le tableau, les indicateurs et
 * le bilan se mettent alors à jour ensemble, sans rechargement.</p>
 */
describe('Reprise du facteur — lignes ventilées', () => {

  const ligneDe = (sur: Partial<LigneValorisee> = {}): LigneValorisee => ({
    cle: 'BG#1', feuille: 'BG MISFAT 2025', ligneSource: 2, mainAccount: '601000',
    nom: 'Achats matières premières', categorieCarboneTexte: 'Metals',
    categorieAbsente: false, reference: '', quantite: 10_000,
    colonneValeur: 'Débit', colonnesEcartees: [], ecran: 'biens-services',
    scope: 'SCOPE_3', motif: 'compte 601000', origineRoutage: 'compte',
    motCle: '601000', exclu: false, facteur: 0.31, uniteFacteur: 'TND',
    libelleFacteur: 'Metals', baseAppliquee: 'ADEME Fallback',
    origineFacteur: 'ADEME Fallback', emissionKg: 3_100,
    referenceCarbone: 'MS3C1M', ...sur
  } as LigneValorisee);

  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    magasin = TestBed.inject(DispatchStore);
  });

  /** Publie une répartition, comme le ferait un import. */
  const publier = (lignes: LigneValorisee[]) => magasin.publier({
    lignes, fichier: 'BG MISFAT 2025.xlsx', importeLe: '2026-01-01',
    exclues: 0, nonVentilees: 0, exercice: 2025, entityId: null
  });

  it('reprend le facteur et recalcule l\'émission', () => {
    publier([ligneDe()]);

    const reprises = magasin.reprendreFacteur(['BG#1'], 0.5);

    expect(reprises).toBe(1);
    const [ligne] = magasin.instantane.lignes;
    expect(ligne.facteur).toBeCloseTo(0.5, 10);
    // 10 000 TND × 0,5 : l'émission suit, sans quoi le total mentirait.
    expect(ligne.emissionKg).toBeCloseTo(5_000, 6);
  });

  it('ne touche que les clés désignées', () => {
    publier([ligneDe(), ligneDe({ cle: 'BG#2', facteur: 0.2, emissionKg: 2_000 })]);

    magasin.reprendreFacteur(['BG#1'], 0.5);

    const [reprise, intacte] = magasin.instantane.lignes;
    expect(reprise.facteur).toBeCloseTo(0.5, 10);
    expect(intacte.facteur).toBeCloseTo(0.2, 10);
  });

  it('inscrit la provenance de la valeur saisie', () => {
    publier([ligneDe()]);
    magasin.reprendreFacteur(['BG#1'], 0.5);

    // Une valeur reprise à la main ne doit pas se confondre avec celle du
    // référentiel : la base documentaire le dit.
    expect(magasin.instantane.lignes[0].baseAppliquee).toContain('reprise en masse');
  });

  it('met à jour le total de la destination', () => {
    publier([ligneDe()]);
    const avant = magasin.totalPour('biens-services');

    magasin.reprendreFacteur(['BG#1'], 0.5);

    // Le total suit sans rechargement : c'est ce que l'utilisateur observe.
    expect(magasin.totalPour('biens-services')).toBeGreaterThan(avant);
    expect(magasin.totalPour('biens-services')).toBeCloseTo(5_000, 6);
  });

  it('persiste la reprise', () => {
    publier([ligneDe()]);
    magasin.reprendreFacteur(['BG#1'], 0.5);

    const relu = JSON.parse(localStorage.getItem('misfat_dispatched_lines') ?? '{}');
    expect(relu.lignes?.[0]?.facteur).toBeCloseTo(0.5, 10);
  });

  it('ne fait rien sur un facteur invalide', () => {
    publier([ligneDe()]);

    for (const invalide of [0, -1, NaN]) {
      expect(magasin.reprendreFacteur(['BG#1'], invalide)).toBe(0);
      expect(magasin.instantane.lignes[0].facteur).toBeCloseTo(0.31, 10);
    }
  });

  it('ne fait rien quand la ligne porte déjà la valeur', () => {
    publier([ligneDe({ facteur: 0.5 })]);
    expect(magasin.reprendreFacteur(['BG#1'], 0.5)).toBe(0);
  });

  it('ne fait rien sans clé', () => {
    publier([ligneDe()]);
    expect(magasin.reprendreFacteur([], 0.5)).toBe(0);
  });

  it('expose la clé jusqu\'à l\'écran, seule voie du retour', () => {
    // L'identifiant d'une ligne ventilée est reconstruit à chaque conversion :
    // sans la clé, l'écran ne saurait pas laquelle rendre au magasin.
    const mesure = adapterVersMesure(ligneDe(), 0, 'Biens et services achetés', 'MISFAT I');

    expect(mesure.cleVentilation).toBe('BG#1');
    expect(mesure.id).toBeLessThan(0);
  });
});
