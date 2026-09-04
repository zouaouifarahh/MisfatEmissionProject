import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';
import { DispatchStore } from '../../../shared/dispatch/dispatch-store';

/**
 * Répartition par filiale : les apports locaux sont en kilos, les parts serveur
 * en tonnes.
 *
 * <p>`reventilerParFiliale` ajoutait les deux sans conversion. Chaque
 * kilogramme local comptait donc pour une tonne : la répartition par filiale
 * pesait mille fois trop, ses quotes-parts étaient fausses, et le garde-fou
 * d'invraisemblance se déclenchait sur des bilans parfaitement normaux — d'où
 * le bandeau « Empreinte invraisemblable détectée » sur un exercice de
 * 38 000 tCO₂e.</p>
 *
 * <p>Les deux autres fusions du tableau de bord convertissaient déjà, et le
 * disaient en commentaire. Celle-ci l'avait oublié.</p>
 */
describe('Tableau de bord — unités de la répartition par filiale', () => {

  const vide: EmissionStats = {
    mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: 0,
    total: 0, scope1: 0, scope2: 0, scope3: 0,
    byScope: {}, byCategory: {}, byScopeCategory: {}, byFiliale: [],
    byCurrency: {}, unconvertedCurrencies: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  /** Monte la console et absorbe ses appels, sans en servir aucun de particulier. */
  function composant(): DashboardComponent {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) requete.flush([]);
      fixture.detectChanges();
    }
    return fixture.componentInstance;
  }

  /** Impose les lignes ventilées, sans passer par la valorisation. */
  function ventiler(emissionsKg: number[]): void {
    const store = TestBed.inject(DispatchStore);
    Object.defineProperty(store, 'lignesActives', {
      configurable: true,
      get: () => emissionsKg.map(emissionKg => ({ ecran: 'dechets', scope: 'SCOPE_3', emissionKg }))
    });
  }

  /** Appelle la reventilation, qui n'est pas exposée. */
  const reventiler = (dash: DashboardComponent, stats: EmissionStats): EmissionStats =>
    (dash as unknown as { reventilerParFiliale(s: EmissionStats): EmissionStats })
      .reventilerParFiliale(stats);

  it('convertit les apports ventilés en tonnes avant de les ajouter', () => {
    const dash = composant();
    ventiler([5_300]);                                   // 5 300 kg, soit 5,3 t

    const sortie = reventiler(dash, {
      ...vide, byFiliale: [{ filialeId: null, value: 30_000, share: 100, measureCount: 5 }]
    });

    // 30 000 t + 5,3 t. Sans conversion, la part valait 35 300 : les kilos
    // s'ajoutaient comme des tonnes.
    expect(sortie.byFiliale[0].value).toBeCloseTo(30_005.3, 1);
  });

  it('ne fait pas peser un apport local mille fois son poids', () => {
    const dash = composant();
    ventiler([1_000]);                                   // 1 000 kg, soit 1 t

    const sortie = reventiler(dash, { ...vide, byFiliale: [] });

    expect(sortie.byFiliale[0].value).toBeCloseTo(1, 6);
  });

  it('laisse les parts serveur intactes quand rien n\'est ventilé', () => {
    const dash = composant();
    ventiler([]);

    const parts = [{ filialeId: 1, value: 32_919.331, share: 100, measureCount: 38_016 }];
    const sortie = reventiler(dash, { ...vide, byFiliale: parts });

    expect(sortie.byFiliale[0].value).toBeCloseTo(32_919.331, 3);
  });

  describe('garde-fou d\'invraisemblance', () => {

    it('se tait sur un bilan légitime de 38 000 tonnes', () => {
      // Le cas signalé : un exercice de 37 936 tCO₂e déclenchait l'alerte parce
      // que la répartition était mille fois trop lourde.
      const dash = composant();
      dash.filiales = [{ id: 1, libelle: 'MISFAT Tunisie', pays: 'Tunisie' }] as never;
      dash.statsReelles = {
        ...vide, total: 37_936,
        byFiliale: [{ filialeId: 1, value: 37_936, share: 100, measureCount: 38_016 }]
      };

      expect(dash.filialesInvraisemblables).toHaveLength(0);
    });

    it('se déclenche encore au-delà du million de tonnes', () => {
      // Le garde-fou reste utile : un facteur saisi dans la mauvaise unité doit
      // toujours se voir.
      const dash = composant();
      dash.filiales = [{ id: 1, libelle: 'MISFAT Tunisie', pays: 'Tunisie' }] as never;
      dash.statsReelles = {
        ...vide, total: 2_000_000,
        byFiliale: [{ filialeId: 1, value: 2_000_000, share: 100, measureCount: 3 }]
      };

      expect(dash.filialesInvraisemblables).toHaveLength(1);
      expect(dash.filialesInvraisemblables[0].nom).toBe('MISFAT Tunisie');
    });

    it('conserve le seuil en tonnes', () => {
      expect(DashboardComponent.SEUIL_EMPREINTE_INVRAISEMBLABLE).toBe(1_000_000);
    });
  });
});
