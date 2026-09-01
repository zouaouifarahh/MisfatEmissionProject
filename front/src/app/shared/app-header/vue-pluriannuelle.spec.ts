import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AppHeaderComponent } from './app-header.component';
import { EntityContextService } from '../../core/entity-context.service';

/**
 * Vue pluriannuelle : consulter tous les exercices d'un coup.
 *
 * <p>Le cloisonnement tient `null` pour « tous les exercices » depuis toujours
 * — les règles de périmètre, le magasin de répartition et les écrans de mesure
 * le traitent tous ainsi. Mais le sélecteur de l'en-tête ne listait que les
 * millésimes déclarés : rien dans l'interface ne pouvait produire ce `null`.</p>
 *
 * <p>Un classeur couvrant plusieurs années n'était donc consultable qu'un
 * exercice à la fois. Ses 4 350 immobilisations réparties sur 2024, 2025 et
 * 2026 existaient bien, mais aucun écran ne pouvait les montrer ensemble.</p>
 */
describe('En-tête — vue pluriannuelle', () => {

  const ANNEES = [
    { id: 1, valeur: 2024, statut: 'CLOTUREE' },
    { id: 2, valeur: 2025, statut: 'CLOTUREE' },
    { id: 3, valeur: 2026, statut: 'EN_COURS' }
  ];

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppHeaderComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  function monter() {
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixtures.push(fixture);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) {
        requete.flush(requete.request.url.includes('/annees') ? ANNEES : []);
      }
      fixture.detectChanges();
    }

    return fixture;
  }

  it('offre « Tous les exercices » en tête du sélecteur', () => {
    const fixture = monter();
    const options = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.filter select option');

    expect(options.length).toBe(ANNEES.length + 1);
    expect(options[0].textContent?.trim()).toBe('Tous les exercices');
  });

  it('liste ensuite chaque exercice déclaré', () => {
    const fixture = monter();
    const options = [...(fixture.nativeElement as HTMLElement)
      .querySelectorAll('.filter select option')]
      .map(o => o.textContent?.trim());

    expect(options).toContain('2024');
    expect(options).toContain('2026 · en cours');
  });

  it('porte le périmètre sur « tous » quand on la choisit', () => {
    // C'est ce `null` que rien ne pouvait produire : sans lui, un inventaire
    // pluriannuel restait consultable un millésime à la fois.
    const fixture = monter();
    const service = TestBed.inject(EntityContextService);

    fixture.componentInstance.changerAnnee(null);

    expect(service.filter.year).toBeNull();
  });

  it('revient à un exercice précis sans rien casser', () => {
    const fixture = monter();
    const service = TestBed.inject(EntityContextService);

    fixture.componentInstance.changerAnnee(null);
    fixture.componentInstance.changerAnnee(2025);

    expect(service.filter.year).toBe(2025);
  });
});
