import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';

/**
 * Aucun agrégat n'est demandé avant que l'exercice soit connu.
 *
 * <p>Le tableau de bord chargeait ses agrégats dès son initialisation, en
 * lisant le filtre global de façon synchrone — donc avant que la liste des
 * exercices soit revenue. L'exercice valait alors {@code null}, et
 * emission-service lit un exercice absent comme « tous les exercices » : c'est
 * ce qu'il désigne légitimement quand la vue consolidée le demande.</p>
 *
 * <p>La page affichait donc la somme de toutes les années sous le millésime en
 * cours — 32 253 tCO₂e là où 2026 en portait 8 — avant qu'une seconde réponse
 * la corrige. Au rendu serveur, où il n'y a pas de seconde réponse, ce total
 * faux était le seul que la page portait.</p>
 */
describe('Tableau de bord — amorçage des agrégats', () => {

  const ANNEES = [
    { id: 1, valeur: 2024, statut: 'CLOTUREE' },
    { id: 2, valeur: 2025, statut: 'CLOTUREE' },
    { id: 3, valeur: 2026, statut: 'EN_COURS' }
  ];

  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  const agregats = () => httpMock.match(r => r.url.includes('/emissions/stats/aggregate'));

  /** Sert les exercices, d'où qu'ils soient demandés. */
  const servirAnnees = () => {
    const demandes = httpMock.match(r => r.url.includes('/annees'));
    demandes.forEach(r => r.flush(ANNEES));
    return demandes.length;
  };

  it('ne demande aucun agrégat tant que les exercices ne sont pas revenus', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    // C'est ici que partait la requête sans année.
    expect(agregats()).toHaveLength(0);
  });

  it('demande le premier agrégat sur l\'exercice en cours', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(servirAnnees()).toBeGreaterThan(0);
    fixture.detectChanges();

    const demandes = agregats();
    expect(demandes.length).toBeGreaterThan(0);
    expect(demandes[0].request.params.get('year')).toBe('2026');
  });

  it('n\'émet jamais d\'agrégat sans année', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    servirAnnees();
    fixture.detectChanges();

    // Un agrégat sans année vaut « tous les exercices » : le total de la page
    // ne documenterait plus le millésime qu'elle affiche.
    for (const demande of agregats()) {
      expect(demande.request.params.get('year')).not.toBeNull();
    }
  });

  it('ne demande que des exercices ouverts', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    servirAnnees();
    fixture.detectChanges();

    // Le tableau de bord charge le périmètre consulté et, pour l'histogramme
    // d'évolution, chaque exercice ouvert : plusieurs agrégats sont donc
    // attendus. Aucun ne doit porter d'année étrangère à la liste, ni en être
    // dépourvu — c'est par là que passait la somme de toutes les années.
    const ouverts = ANNEES.map(a => String(a.valeur));
    const demandes = agregats().map(d => d.request.params.get('year'));

    expect(demandes.length).toBeGreaterThan(0);
    expect(demandes.every(annee => annee !== null && ouverts.includes(annee))).toBe(true);
    expect(demandes).toContain('2026');
  });
});
