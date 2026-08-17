import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';

/**
 * Contrôle : le même scénario appliqué aux catégories déjà en service.
 *
 * <p>Sert à trancher si une anomalie constatée sur une catégorie lui est propre
 * ou si elle frappe indifféremment tout l'écran de mesures.</p>
 */
describe('DashboardComponent — contrôle des catégories', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  /**
   * Active la catégorie <em>avant</em> la première détection de changements.
   *
   * <p>Muter {@code activeSub} entre deux passes fait remonter un NG0100 : hors
   * d'un vrai événement, la vue n'est pas marquée et la valeur mémorisée à la
   * passe précédente diffère de celle relue à la vérification. Le phénomène est
   * un artefact du banc d'essai — il se produit même en basculant vers un onglet
   * sans écran de mesure — et n'a pas d'équivalent au clic dans le navigateur.</p>
   */
  const activer = (categorie: string, selecteur: string) => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive(categorie);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    const hote: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.activeSub).toBe(categorie);

    // Le symptôme rapporté était un <main class="dash-main"> vide.
    const principal = hote.querySelector('main.dash-main');
    expect(principal).toBeTruthy();
    expect(principal!.children.length).toBeGreaterThan(0);
    expect(principal!.querySelector(selecteur)).toBeTruthy();
  };

  it('déploie Biens et services achetés (catégorie 1)', () => {
    activer('biens-services', 'app-biens-services');
  });

  it('déploie Biens d\'équipement (catégorie 2)', () => {
    activer('biens-equipement', 'app-biens-equipement');
  });

  it('déploie Activités liées à l\'énergie (catégorie 3)', () => {
    activer('energie', 'app-activites-energie');
  });
});
