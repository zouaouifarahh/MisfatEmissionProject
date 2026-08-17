import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';

/**
 * Intégration du tableau de bord et de l'onglet « Transport en amont ».
 *
 * <p>Reproduit le clic sur la catégorie du menu latéral et vérifie que l'écran
 * correspondant est bien déployé : c'est le chemin exact dont dépend
 * l'affichage, et le seul que ne couvre pas le test unitaire du composant.</p>
 */
describe('DashboardComponent — onglet transport-amont', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  it('déploie le composant Transport en amont quand la catégorie est activée', () => {
    const fixture = TestBed.createComponent(DashboardComponent);

    // Chemin emprunté par le clic sur le menu latéral. L'activation précède la
    // première passe : muter activeSub entre deux passes ferait remonter un
    // NG0100 propre au banc d'essai, présent jusque sur les onglets sans écran
    // de mesure, et sans équivalent au clic dans le navigateur.
    fixture.componentInstance.setActive('transport-amont');
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('transport-amont');

    const hote: HTMLElement = fixture.nativeElement;

    // Le symptôme rapporté était un <main class="dash-main"> vide : on vérifie
    // qu'il est peuplé, pas seulement que le composant existe quelque part.
    const principal = hote.querySelector('main.dash-main');
    expect(principal).toBeTruthy();
    expect(principal!.children.length).toBeGreaterThan(0);

    const ecran = principal!.querySelector('app-transport-amont');
    expect(ecran).toBeTruthy();
    expect(ecran?.querySelector('.emission-header h2')?.textContent).toContain('Transport en amont');
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(12);
  });

  it('reconnaît transport-amont comme une catégorie du Scope 3', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));

    expect(fixture.componentInstance.isCategory('transport-amont')).toBe(true);
  });
});
