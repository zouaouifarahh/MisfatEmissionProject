import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';

/**
 * Intégration du tableau de bord et de l'onglet « Transformation des produits ».
 *
 * <p>Les écrans de catégorie ne sont pas des routes : la navigation passe par
 * {@code activeSub} et le {@code *ngIf} du tableau de bord. Ce test emprunte
 * exactement le chemin du clic sur le menu latéral.</p>
 */
describe('DashboardComponent — onglet transformation-produits', () => {

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  it('déploie le composant dans main.dash-main quand la catégorie est activée', () => {
    const fixture = TestBed.createComponent(DashboardComponent);

    // L'activation précède la première passe : muter activeSub entre deux
    // passes ferait remonter un NG0100 propre au banc d'essai.
    fixture.componentInstance.setActive('transformation-produits');
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('transformation-produits');

    const hote: HTMLElement = fixture.nativeElement;
    const principal = hote.querySelector('main.dash-main');
    expect(principal).toBeTruthy();
    expect(principal!.children.length).toBeGreaterThan(0);

    const ecran = principal!.querySelector('app-transformation-produits');
    expect(ecran).toBeTruthy();
    expect(ecran?.querySelector('.emission-header h2')?.textContent)
      .toContain('Transformation des produits vendus');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(13);
  });

  it('reconnaît transformation-produits comme une catégorie du Scope 3', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));

    // L'identifiant du menu latéral et celui du *ngIf doivent coïncider.
    expect(fixture.componentInstance.isCategory('transformation-produits')).toBe(true);
    expect(fixture.componentInstance.ecranDisponible('transformation-produits')).toBe(true);
  });

  it('offre désormais un écran à chaque catégorie du menu', () => {
    const composant = TestBed.createComponent(DashboardComponent).componentInstance;

    // La nomenclature GHG Protocol est couverte de bout en bout : plus aucune
    // entrée du menu ne doit retomber sur le panneau « à développer ».
    const orphelines = composant.scopesData
      .flatMap(scope => scope.categories)
      .filter(categorie => !composant.ecranDisponible(categorie.id))
      .map(categorie => categorie.id);

    expect(orphelines).toEqual([]);
    expect(composant.ecranDisponible('investissements')).toBe(true);
  });

  it('réserve le panneau « à développer » aux seules catégories sans écran', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const composant = fixture.componentInstance;

    composant.setActive('investissements');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    const hote: HTMLElement = fixture.nativeElement;
    const principal = hote.querySelector('main.dash-main');

    // Le filet de sécurité reste en place, mais il ne se déclenche plus.
    expect(principal?.querySelector('app-investissements')).toBeTruthy();
    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
    expect(principal!.children.length).toBeGreaterThan(0);
  });

  it('nomme correctement chaque catégorie du menu', () => {
    const composant = TestBed.createComponent(DashboardComponent).componentInstance;

    expect(composant.libelleCategorie('utilisation-produits')).toContain('Utilisation des produits');
    expect(composant.libelleCategorie('fin-de-vie-produits')).toContain('Fin de vie des produits');
    expect(composant.libelleCategorie('investissements')).toContain('Investissements');
  });
});
