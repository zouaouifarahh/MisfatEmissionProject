import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  DispatchStore, REPLIS_MONETAIRES, PRIX_KWH_TND, FACTEUR_ELECTRICITE_KWH
} from './dispatch-store';
import { LigneDispatchee } from './dispatch-excel';

/** Ligne ventilée minimale, telle que la produit le parseur. */
const ligne = (partiel: Partial<LigneDispatchee>): LigneDispatchee => ({
  cle: 'Sheet1#2', feuille: 'Sheet1', ligneSource: 2,
  mainAccount: '602100', nom: 'Achats matières combustibles Gasoil',
  categorieCarboneTexte: '0', categorieAbsente: true, reference: '',
  quantite: 1000, colonneValeur: 'Débit', colonnesEcartees: [],
  ecran: 'combustion-etablissements', scope: 'SCOPE_1',
  motif: '', origineRoutage: 'compte', motCle: '602100', exclu: false,
  ...partiel
});

describe('DispatchStore', () => {
  let store: DispatchStore;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DispatchStore]
    });
    store = TestBed.inject(DispatchStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Vide le référentiel : toutes les destinations basculent sur les replis. */
  const referentielVide = () => {
    store.chargerFacteurs().subscribe();
    httpMock.match(() => true).forEach(r => r.flush([]));
  };

  it('déduit le facteur électrique du prix du kilowattheure MISFAT', () => {
    // La balance porte une facture en dinars, pas des kilowattheures : le prix
    // relevé du suivi d'indicateurs fait le pont.
    expect(PRIX_KWH_TND).toBe(0.291);
    expect(REPLIS_MONETAIRES['electricite-achetee'])
      .toBeCloseTo(FACTEUR_ELECTRICITE_KWH / PRIX_KWH_TND, 6);
    expect(REPLIS_MONETAIRES['electricite-achetee']).toBeCloseTo(1.443, 3);
  });

  it('applique un repli ADEME quand le référentiel ne documente rien', () => {
    referentielVide();

    const facteur = store.facteurPour('biens-services');
    expect(facteur.origine).toBe('ADEME Fallback');
    expect(facteur.valeur).toBe(0.250);
    expect(facteur.base).toBe('ADEME Fallback');
  });

  it('préfère un facteur monétaire du référentiel MS SQL', () => {
    store.chargerFacteurs().subscribe();
    httpMock.match(() => true).forEach(r => r.flush([{
      id: 3, factorValue: 0.311, unit: 'TND', dataType: 'MONETAIRE', currency: 'TND',
      databaseSource: 'EXIOBASE 2024', referenceYear: 2024,
      carbonReference: {
        referenceCode: 'MS3C1', typeName: 'Purchased goods, monetary',
        category: { name: 'Category 1: Purchased goods and services', scope: { code: 'SCOPE_3' } }
      }
    }]));

    const facteur = store.facteurPour('biens-services');
    expect(facteur.origine).toBe('MS SQL BDD');
    expect(facteur.valeur).toBe(0.311);

    // Une autre destination n'hérite pas de ce facteur.
    expect(store.facteurPour('transport-aval').origine).toBe('ADEME Fallback');
  });

  it('valorise chaque ligne et n\'en laisse aucune à zéro par défaut', () => {
    referentielVide();

    const valorisees = store.valoriser([
      ligne({}),
      ligne({ cle: 'Sheet1#3', ecran: 'electricite-achetee', quantite: 500 })
    ]);

    expect(valorisees[0].emissionKg).toBeCloseTo(1000 * 0.450, 4);
    expect(valorisees[0].origineFacteur).toBe('ADEME Fallback');
    expect(valorisees[1].emissionKg).toBeCloseTo(500 * REPLIS_MONETAIRES['electricite-achetee'], 4);
    expect(valorisees.every(l => l.emissionKg > 0)).toBe(true);
  });

  it('laisse à zéro une ligne sans destination, sans la perdre', () => {
    referentielVide();

    const [orpheline] = store.valoriser([ligne({ ecran: null, scope: null, exclu: true })]);
    expect(orpheline.emissionKg).toBe(0);
    expect(orpheline.nom).toBe('Achats matières combustibles Gasoil');
  });

  it('diffuse à chaque écran les seules lignes qui lui reviennent', async () => {
    referentielVide();

    store.publier({
      lignes: store.valoriser([
        ligne({}),
        ligne({ cle: 'Sheet1#3', ecran: 'transport-aval', quantite: 2000 })
      ]),
      fichier: 'BG MISFAT 2025.xlsx',
      importeLe: '09/08/2026 10:00',
      exclues: 0,
      nonVentilees: 0,
      exercice: 2025,
      entityId: null
    });

    const recues = await new Promise<number>(resoudre =>
      store.pour('transport-aval').subscribe(l => resoudre(l.length))
    );

    expect(recues).toBe(1);
    expect(store.totalPour('transport-aval')).toBeCloseTo(2000 * 0.350, 4);
    expect(store.instantane.fichier).toBe('BG MISFAT 2025.xlsx');
  });

  it('remplace la répartition précédente au lieu de l\'additionner', () => {
    referentielVide();

    const publication = () => store.publier({
      lignes: store.valoriser([ligne({})]),
      fichier: 'BG MISFAT 2025.xlsx', importeLe: '', exclues: 0, nonVentilees: 0, exercice: 2025, entityId: null
    });

    publication();
    publication();

    // Réimporter le même classeur ne doit pas doubler le bilan.
    expect(store.instantane.lignes).toHaveLength(1);

    store.vider();
    expect(store.instantane.lignes).toEqual([]);
  });
});
