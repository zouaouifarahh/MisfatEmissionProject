import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from '../../backoffice/components/dashboard/dashboard';
import {
  adosseeAuReferentiel, tauxCouvertureReferentiel, statutRetenu, uniteDominante
} from './kpis-categorie';

describe('Socle des indicateurs de catégorie', () => {

  it('reconnaît une ligne adossée au référentiel, quelle que soit sa traçabilité', () => {
    // Écrans récents : l'origine est explicite.
    expect(adosseeAuReferentiel({ origineFacteur: 'MS SQL BDD' })).toBe(true);
    expect(adosseeAuReferentiel({ origineFacteur: 'ADEME Fallback' })).toBe(false);

    // Écrans intermédiaires : seule la base documentaire est tracée.
    expect(adosseeAuReferentiel({ baseAppliquee: 'DESNZ 2024' })).toBe(true);
    expect(adosseeAuReferentiel({ baseAppliquee: 'ADEME (repli)' })).toBe(false);

    // Écrans du Scope 1, antérieurs à la refonte.
    expect(adosseeAuReferentiel({ databaseSource: 'EPA-ORD 2024' })).toBe(true);

    // Faute de traçabilité, un facteur résolu vaut rattachement.
    expect(adosseeAuReferentiel({ facteur: 0.42 })).toBe(true);
    expect(adosseeAuReferentiel({ facteur: null })).toBe(false);
  });

  it('mesure la couverture et filtre par statut', () => {
    const lignes = [
      { origineFacteur: 'MS SQL BDD' },
      { origineFacteur: 'MS SQL BDD' },
      { origineFacteur: 'ADEME Fallback' },
      { baseAppliquee: 'ADEME (repli)' }
    ];

    expect(tauxCouvertureReferentiel(lignes)).toBe(50);
    expect(tauxCouvertureReferentiel([])).toBe(0);

    expect(lignes.filter(l => statutRetenu(l, 'MS SQL'))).toHaveLength(2);
    expect(lignes.filter(l => statutRetenu(l, 'Fallback'))).toHaveLength(2);
    expect(lignes.filter(l => statutRetenu(l, 'Tous'))).toHaveLength(4);
  });

  it('retient l\'unité la plus représentée', () => {
    expect(uniteDominante(['L', 'L', 'kg'])).toBe('L');
    expect(uniteDominante([null, '', undefined], 'kWh')).toBe('kWh');
  });
});

/**
 * Déploiement du socle sur les onze écrans de catégorie.
 *
 * <p>Le test monte chaque écran par le chemin réel du tableau de bord : un
 * gabarit qui référencerait un membre absent rendrait une page vide, et c'est
 * précisément ce que cette épreuve interdit.</p>
 */
describe('Socle d\'interface déployé sur les scopes 1, 2 et 3', () => {

  const ECRANS: [string, string][] = [
    ['combustion-etablissements', 'app-emission-list'],
    ['combustion-vehicules', 'app-combustion-vehicules'],
    ['emissions-refrigerants', 'app-emissions-refrigerants'],
    ['electricite-achetee', 'app-electricite-achetee'],
    ['biens-services', 'app-biens-services'],
    ['transport-amont', 'app-transport-amont'],
    ['transport-aval', 'app-transport-aval'],
    ['dechets', 'app-dechets'],
    ['voyages-affaires', 'app-voyages-affaires'],
    ['deplacements-employes', 'app-deplacements-employes'],
    ['investissements', 'app-investissements']
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  }, 30_000);

  const monter = (onglet: string) => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive(onglet);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  it('affiche quatre indicateurs sur chaque écran, sans page vide', () => {
    for (const [onglet, balise] of ECRANS) {
      const fixture = monter(onglet);
      const ecran: HTMLElement | null = fixture.nativeElement.querySelector(balise);

      expect(ecran, onglet).toBeTruthy();
      expect(ecran!.querySelectorAll('.kpi-carte').length, onglet).toBe(4);
      expect(fixture.nativeElement.querySelector('.ecran-a-venir'), onglet).toBeNull();
    }
  }, 60_000);

  it('propose recherche, filtre métier et filtre de statut sur chaque écran', () => {
    for (const [onglet, balise] of ECRANS) {
      const fixture = monter(onglet);
      const ecran: HTMLElement = fixture.nativeElement.querySelector(balise)!;

      expect(ecran.querySelector('.search-input'), onglet).toBeTruthy();

      const listes = Array.from(ecran.querySelectorAll<HTMLSelectElement>('.filter-dropdown'));
      expect(listes.length, onglet).toBeGreaterThanOrEqual(2);

      const statuts = listes.find(l => (l.textContent ?? '').includes('Validé MS SQL'));
      expect(statuts, onglet).toBeTruthy();
      expect(statuts!.textContent).toContain('Fallback appliqué ADEME');
    }
  }, 60_000);
});
