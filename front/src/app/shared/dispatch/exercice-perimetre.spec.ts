import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

import { DispatchStore, exerciceDepuisNom } from './dispatch-store';
import { lireClasseurDispatch } from './dispatch-excel';

/** Balance réduite : un poste par scope. */
const BALANCE = [
  ['MainAccount', 'Nom', 'Débit', 'Catégorie Carbone'],
  ['602100', 'Achats matières combustibles Gasoil', 1000, 0],
  ['606500', 'Matières consommables électrique', 2000, 0],
  ['624000', 'Frêt et transport sur ventes', 3000, 0]
];

describe('Rattachement à l\'exercice et à la société', () => {
  let store: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DispatchStore]
    });
    store = TestBed.inject(DispatchStore);
    store.chargerFacteurs().subscribe();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
  });

  const publier = (exercice: number | null, entityId: number | null) => {
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(BALANCE), 'Sheet1');
    const rapport = lireClasseurDispatch(classeur);

    store.publier({
      lignes: store.valoriser(rapport.lignes),
      fichier: 'BG MISFAT 2025.xlsx', importeLe: '',
      exclues: rapport.exclues, nonVentilees: rapport.nonVentilees,
      exercice, entityId
    });
  };

  it('déduit l\'exercice du nom du classeur', () => {
    expect(exerciceDepuisNom('BG MISFAT 2025.xlsx')).toBe(2025);
    expect(exerciceDepuisNom('Base Investissemnt 2025.xlsx')).toBe(2025);
    expect(exerciceDepuisNom('balance.xlsx')).toBeNull();
  });

  it('cloisonne les répartitions par exercice', () => {
    publier(2025, null);

    store.suivrePerimetre(2025, null);
    expect(store.lignesActives.length).toBe(3);
    expect(store.totalPourScope('SCOPE_1')).toBeGreaterThan(0);

    // Une balance qui solde 2025 ne pèse rien sur le bilan 2026 : le millésime
    // de la répartition reste rappelé dans le bandeau de chaque catégorie, pour
    // qu'un écran vide s'explique de lui-même.
    store.suivrePerimetre(2026, null);
    expect(store.lignesActives).toEqual([]);
    expect(store.totalPourScope('SCOPE_1')).toBe(0);
    expect(store.instantane.exercice).toBe(2025);
  });

  it('rend la répartition en vue pluriannuelle', () => {
    publier(2025, null);

    // Exercice non renseigné : la vue consolidée est demandée, pas relâchée.
    store.suivrePerimetre(null, null);
    expect(store.lignesActives.length).toBe(3);
  });

  it('cloisonne les répartitions par société', () => {
    publier(2025, 7);

    store.suivrePerimetre(2025, 7);
    expect(store.lignesActives.length).toBe(3);

    store.suivrePerimetre(2025, 9);
    expect(store.lignesActives).toEqual([]);
  });

  it('laisse visible une répartition sans exercice renseigné', () => {
    // Une répartition antérieure à ce rattachement ne doit pas disparaître
    // sans explication : faute d'exercice, elle vaut pour tous.
    publier(null, null);

    store.suivrePerimetre(2026, 3);
    expect(store.lignesActives.length).toBe(3);
  });

  it('totalise les émissions par scope sur le périmètre consulté', () => {
    publier(2025, null);
    store.suivrePerimetre(2025, null);

    // 1 000 × 0,450 pour le gasoil, 2 000 × (0,420/0,291) pour l'électricité.
    expect(store.totalPourScope('SCOPE_1')).toBeCloseTo(450, 2);
    expect(store.totalPourScope('SCOPE_2')).toBeCloseTo(2000 * (0.420 / 0.291), 2);
    expect(store.totalPourScope('SCOPE_3')).toBeCloseTo(3000 * 0.350, 2);
  });

  it('conserve le rattachement après un rafraîchissement', () => {
    publier(2025, 7);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DispatchStore]
    });

    const apresF5 = TestBed.inject(DispatchStore);
    expect(apresF5.instantane.exercice).toBe(2025);
    expect(apresF5.instantane.entityId).toBe(7);

    // Une autre société masque la répartition ; un autre exercice aussi.
    apresF5.suivrePerimetre(2024, 9);
    expect(apresF5.lignesActives).toEqual([]);

    apresF5.suivrePerimetre(2024, 7);
    expect(apresF5.lignesActives).toEqual([]);

    apresF5.suivrePerimetre(2025, 7);
    expect(apresF5.lignesActives.length).toBe(3);
  });
});
