import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EmissionFactorsComponent } from './emission-factors.component';

/**
 * Affectation d'un facteur depuis une source dépourvue.
 *
 * <p>Le formulaire reprenait l'unité de la source mais laissait le type de
 * donnée sur sa valeur d'ouverture — « Physique ». Affecter un facteur à une
 * source en dinars ouvrait donc un formulaire qui se contredisait lui-même :
 * unité « TND », type « Physique », et une alerte le disant. L'utilisateur
 * devait corriger à la main un décalage que rien ne justifiait.</p>
 *
 * <p>Le type se déduit de l'unité, sans ambiguïté possible : une devise ne
 * documente qu'un ratio monétaire, une grandeur qu'un ratio physique.</p>
 */
describe('Affectation d\'un facteur — accord de l\'unité et du type', () => {

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmissionFactorsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  function monter(): EmissionFactorsComponent {
    const fixture = TestBed.createComponent(EmissionFactorsComponent);
    fixtures.push(fixture);
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

  /** Source déjà rattachée au référentiel : l'affectation ouvre le formulaire. */
  const source = (unite: string) => ({
    referenceCode: 'INVEST1', sourceName: 'Immobilisations',
    category: 'Category 15: Investments', scope: 'SCOPE_3',
    defaultUnit: unite, carbonReferenceId: 42
  });

  it('bascule en monétaire sur une source libellée en dinars', () => {
    const ecran = monter();
    ecran.affecterUnFacteur(source('TND') as never);

    expect(ecran.nouveau.unit).toBe('TND');
    expect(ecran.nouveau.dataType).toBe('MONETAIRE');
    expect(ecran.nouveau.currency).toBe('TND');
  });

  it('reconnaît les autres devises', () => {
    const ecran = monter();
    ecran.affecterUnFacteur(source('EUR') as never);

    expect(ecran.nouveau.dataType).toBe('MONETAIRE');
    expect(ecran.nouveau.currency).toBe('EUR');
  });

  it('reste physique sur une source libellée en grandeur', () => {
    const ecran = monter();
    ecran.affecterUnFacteur(source('kg') as never);

    expect(ecran.nouveau.unit).toBe('kg');
    expect(ecran.nouveau.dataType).toBe('PHYSIQUE');
    expect(ecran.nouveau.currency).toBe('');
  });

  it('n\'annonce plus de contradiction entre unité et type', () => {
    // C'est l'alerte signalee : « TND est une devise, mais ce facteur est
    // declare physique ». Elle ne doit plus se declencher a l'ouverture.
    const ecran = monter();
    ecran.affecterUnFacteur(source('TND') as never);

    expect(ecran.alerteUnite).toBe('');
  });

  it('ouvre le formulaire sur la référence de la source', () => {
    const ecran = monter();
    ecran.affecterUnFacteur(source('TND') as never);

    expect(ecran.formulaireOuvert).toBe(true);
    expect(ecran.nouveau.carbonReferenceId).toBe(42);
  });
});
