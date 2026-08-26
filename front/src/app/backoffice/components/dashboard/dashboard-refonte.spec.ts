import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';

/**
 * Refonte du tableau de bord : unification des émissions et mise en page fluide.
 *
 * <p>Une bascule laissait choisir entre valorisation physique et valorisation
 * monétaire. Elle ne donnait pas deux lectures des mêmes émissions : le mode
 * monétaire remplaçait les tCO₂e par les montants d'achat des seules lignes
 * adossées à un facteur monétaire. La carte « Total empreinte carbone »
 * pouvait donc afficher des dinars, et une comptabilité carbone qui change
 * d'unité selon un bouton n'est plus une comptabilité carbone.</p>
 *
 * <p>Ces bancs verrouillent ce qui en résulte : une seule unité, un total qui
 * réunit toutes les mesures de l'exercice, et une distribution par filiale qui
 * ne cache plus personne.</p>
 */
describe('DashboardComponent — refonte du bilan unifié', () => {

  const FILIALES = [
    { id: 1, libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND' },
    { id: 2, libelle: 'MISFAT MAROC', pays: 'Maroc', devise: 'MAD' },
    { id: 3, libelle: 'SOLAUFIL FRANCE', pays: 'France', devise: 'EUR' }
  ];

  /**
   * Agrégat serveur : 120 tCO₂e, dont une seule filiale contributrice.
   *
   * <p>Les deux autres sociétés pèsent zéro : c'est précisément le cas que le
   * dépliant « Voir toutes les sociétés » masquait.</p>
   */
  const reponseServeur: EmissionStats = {
    mode: 'PHYSIQUE',
    unit: 'tCO2e',
    currency: null,
    measureCount: 34,
    total: 120,
    scope1: 50,
    scope2: 30,
    scope3: 40,
    byScope: { SCOPE_1: 50, SCOPE_2: 30, SCOPE_3: 40 },
    byCategory: {},
    byScopeCategory: {},
    byFiliale: [{ filialeId: 1, value: 120, share: 100, measureCount: 34 }],
    byCurrency: {},
    unconvertedCurrencies: []
  };

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  function monter() {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    for (const requete of TestBed.inject(HttpTestingController).match(() => true)) {
      if (requete.request.url.includes('/emissions/stats/aggregate')) {
        requete.flush(reponseServeur);
      } else if (requete.request.url.includes('/filiales')) {
        requete.flush(FILIALES);
      } else {
        requete.flush([]);
      }
    }

    fixture.detectChanges();
    return fixture;
  }

  describe('unification des émissions', () => {

    it('ne demande au serveur que la restitution physique, en tCO₂e', () => {
      TestBed.createComponent(DashboardComponent).detectChanges();

      const appels = TestBed.inject(HttpTestingController)
        .match(r => r.url.includes('/emissions/stats/aggregate'));

      expect(appels.length).toBeGreaterThan(0);
      for (const appel of appels) {
        expect(appel.request.params.get('mode')).toBe('PHYSIQUE');
        // Plus de devise de restitution : il n'y a plus rien à restituer en devise.
        expect(appel.request.params.has('currency')).toBe(false);
        appel.flush(reponseServeur);
      }
    });

    it('restitue toujours en tCO₂eq, sans bascule possible', () => {
      const composant = monter().componentInstance;

      expect(composant.uniteStats).toBe('tCO₂eq');
      // La bascule et son sélecteur de devise n'existent plus sur le composant.
      expect((composant as any).basculerMode).toBeUndefined();
      expect((composant as any).modeStats).toBeUndefined();
      expect((composant as any).deviseMonetaire).toBeUndefined();
    });

    it('affiche le total consolidé et la somme des trois scopes', () => {
      const composant = monter().componentInstance;

      expect(composant.stats.totalCO2).toBe(120);
      expect(composant.stats.scope1).toBe(50);
      expect(composant.stats.scope2).toBe(30);
      expect(composant.stats.scope3).toBe(40);
      expect(composant.stats.scope1 + composant.stats.scope2 + composant.stats.scope3)
        .toBe(composant.stats.totalCO2);
    });

    it('ne rend plus aucun bouton de mode dans le gabarit', () => {
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('.mode-toggle')).toBeNull();
      expect(hote.querySelector('.devise-switch')).toBeNull();
      expect(hote.textContent).not.toContain('Mode Physique');
      expect(hote.textContent).not.toContain('Mode Monétaire');
    });

    it('porte la mention de méthode sous le total', () => {
      const hote: HTMLElement = monter().nativeElement;

      const note = hote.querySelector('.kpi-total .kpi-note');
      expect(note).not.toBeNull();
      expect(note!.textContent).toContain('Total consolidé réunissant les approches physiques et monétaires');
    });
  });

  describe('distribution par filiale', () => {

    it('liste toutes les sociétés, y compris celles à 0 %', () => {
      const composant = monter().componentInstance;

      const noms = composant.filialesAffichees.map(f => f.nom);
      expect(noms).toEqual(['MISFAT TUNISIE', 'MISFAT MAROC', 'SOLAUFIL FRANCE']);

      // Les deux sociétés sans mesure figurent bien, à zéro.
      expect(composant.filialesAffichees.filter(f => f.valeur === 0).length).toBe(2);
    });

    it('ne rend plus de bouton « Voir toutes les sociétés »', () => {
      const fixture = monter();
      const hote: HTMLElement = fixture.nativeElement;

      const boutons = [...hote.querySelectorAll('.btn-voir-tout')]
        .map(b => b.textContent ?? '');

      expect(boutons.some(t => t.includes('sociétés'))).toBe(false);

      // Le dépliant du Scope 3 subsiste : il replie des catégories vides de la
      // nomenclature, non des entités du périmètre de consolidation.
      expect((fixture.componentInstance as any).afficherFilialesZero).toBeUndefined();
      expect((fixture.componentInstance as any).afficherScope3Zero).toBe(false);
    });
  });
});
