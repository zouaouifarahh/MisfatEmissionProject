import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { CombustionVehiculesComponent } from './combustion-vehicules';

/**
 * Plusieurs facteurs pour une même source, tous sélectionnables à la saisie.
 *
 * <p>Une source d'émission est documentée par plusieurs bases — l'EPA, l'ADEME,
 * l'IPCC — et un ajout manuel en crée une de plus. Les trois coexistent en
 * base ; la modale doit les proposer toutes, faute de quoi l'utilisateur croit
 * que le dernier ajout a écrasé les précédents.</p>
 *
 * <p>La sélection se fait en deux temps : la base d'abord, le facteur ensuite.
 * C'est ce qui permet de trancher explicitement entre deux valeurs qui
 * documentent la même chose sans dire la même.</p>
 */
describe('Combustion des véhicules — variantes de facteur', () => {

  /** Le cas réel : MS1COC documenté par trois bases distinctes. */
  const FACTEURS = [
    {
      id: 24, factorValue: 3.3213076157, unit: 'L', dataType: 'PHYSIQUE',
      currency: null, databaseSource: 'EPA 2024', referenceYear: 2024,
      validityLabel: 'From 2024-01-01',
      carbonReference: {
        referenceCode: 'MS1COC', typeName: 'Diesel medium and heavy duty truck',
        category: { name: 'Company owned cars', scope: { code: 'SCOPE_1' } }
      }
    },
    {
      id: 252, factorValue: 0.56, unit: 'L', dataType: 'PHYSIQUE',
      currency: null, databaseSource: 'MISFAT_INTERNE', referenceYear: 2026,
      validityLabel: null,
      carbonReference: {
        referenceCode: 'MS1COC', typeName: 'Diesel medium and heavy duty truck',
        category: { name: 'Company owned cars', scope: { code: 'SCOPE_1' } }
      }
    },
    {
      id: 253, factorValue: 2.75, unit: 'L', dataType: 'PHYSIQUE',
      currency: null, databaseSource: 'ADEME 2025', referenceYear: 2025,
      validityLabel: 'From 2025-01-01',
      carbonReference: {
        referenceCode: 'MS1COC', typeName: 'Diesel medium and heavy duty truck',
        category: { name: 'Company owned cars', scope: { code: 'SCOPE_1' } }
      }
    }
  ];

  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CombustionVehiculesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Monte l'écran et lui sert le référentiel, en plusieurs passes. */
  const monter = () => {
    const fixture = TestBed.createComponent(CombustionVehiculesComponent);
    fixture.detectChanges();

    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;

      for (const requete of attente) {
        if (requete.request.url.includes('/emission-factors')) requete.flush(FACTEURS);
        else if (requete.request.url.includes('/annees')) {
          requete.flush([{ id: 1, valeur: 2026, statut: 'EN_COURS' }]);
        } else requete.flush([]);
      }
      fixture.detectChanges();
    }

    return fixture;
  };

  /** Ouvre la modale sur la source MS1COC, comme le ferait la saisie. */
  const choisirLaSource = (composant: CombustionVehiculesComponent) => {
    composant.ouvrirModale();
    composant.formModel.emissionSource = 'Diesel medium and heavy duty truck';
    composant.formModel.typeDonnee = 'Physique';
    composant.onSourceChange();
  };

  it('propose les trois bases documentaires de la source', () => {
    const composant = monter().componentInstance;
    choisirLaSource(composant);

    // Aucune ne doit manquer : c'est là que l'ajout manuel paraissait avoir
    // écrasé le facteur importé.
    expect(composant.basesDisponibles.sort())
      .toEqual(['ADEME 2025', 'EPA 2024', 'MISFAT_INTERNE']);
  });

  it('retient les trois facteurs, avec leurs valeurs distinctes', () => {
    const composant = monter().componentInstance;
    choisirLaSource(composant);

    expect(composant.facteursDisponibles).toHaveLength(3);
    expect(composant.facteursDisponibles.map(f => f.factorValue).sort((a, b) => a - b))
      .toEqual([0.56, 2.75, 3.3213076157]);
  });

  it('donne le facteur de la base choisie, et lui seul', () => {
    const composant = monter().componentInstance;
    choisirLaSource(composant);

    for (const [base, valeur] of [
      ['EPA 2024', 3.3213076157],
      ['ADEME 2025', 2.75],
      ['MISFAT_INTERNE', 0.56]
    ] as const) {
      composant.formModel.databaseSource = base;
      composant.onBaseChange();

      expect(composant.facteursFiltresParBase.map(f => f.factorValue)).toEqual([valeur]);
    }
  });

  it('retient la source quel que soit le millésime des variantes', () => {
    // Trois facteurs du même exercice ne se distinguent que par leur base :
    // les départager sur l'année seule en perdrait deux.
    const memeAnnee = FACTEURS.map(f => ({ ...f, referenceYear: 2026 }));

    const fixture = TestBed.createComponent(CombustionVehiculesComponent);
    fixture.detectChanges();
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) {
        if (requete.request.url.includes('/emission-factors')) requete.flush(memeAnnee);
        else requete.flush([]);
      }
      fixture.detectChanges();
    }

    choisirLaSource(fixture.componentInstance);
    expect(fixture.componentInstance.facteursDisponibles).toHaveLength(3);
  });
});
