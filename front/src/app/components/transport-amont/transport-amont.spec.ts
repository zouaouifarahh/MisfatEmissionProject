import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { TransportAmontComponent } from './transport-amont';

/**
 * Fumigation du composant : instanciation, cycle de vie et rendu du tableau.
 *
 * <p>Une exception levée à l'initialisation ou pendant le rendu laisse l'écran
 * vide sans rien signaler à l'utilisateur ; ce test la fait remonter.</p>
 */
describe('TransportAmontComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportAmontComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  it('s\'initialise et rend son tableau sans lever d\'exception', () => {
    const fixture = TestBed.createComponent(TransportAmontComponent);
    fixture.detectChanges();

    const ctrl = TestBed.inject(HttpTestingController);
    // Le composant interroge le référentiel puis l'organisation : on répond à
    // tout ce qui se présente, la réponse importe moins que l'absence de crash.
    ctrl.match(() => true).forEach(requete => requete.flush([]));
    fixture.detectChanges();

    const hote: HTMLElement = fixture.nativeElement;
    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Transport en amont');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(14);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('ouvre la modale de saisie sans lever d\'exception', () => {
    const fixture = TestBed.createComponent(TransportAmontComponent);
    fixture.detectChanges();

    const ctrl = TestBed.inject(HttpTestingController);
    ctrl.match(() => true).forEach(requete => requete.flush([]));
    fixture.detectChanges();

    fixture.componentInstance.ouvrirModale();
    fixture.detectChanges();

    const hote: HTMLElement = fixture.nativeElement;
    expect(hote.querySelector('.modal-card')).toBeTruthy();
  });
});
