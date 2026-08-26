import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';

/**
 * Unités à la fusion des trois sources du tableau de bord.
 *
 * <p>Le tableau de bord additionne les agrégats du serveur, la ventilation d'un
 * classeur et les saisies des écrans. Le serveur compte en <strong>tCO₂e</strong>,
 * le navigateur en <strong>kgCO₂e</strong> : additionner les deux tels quels
 * multipliait chaque apport local par mille, et portait l'empreinte affichée à
 * 3,78 milliards de tonnes.</p>
 *
 * <p>Ces bancs verrouillent le contrat : mille kilogrammes saisis dans un écran
 * pèsent exactement une tonne au total.</p>
 */
describe('DashboardComponent — unités à la fusion des sources', () => {

  /** Clé de stockage de l'écran « Électricité achetée ». */
  const CLE_ECRAN_ELECTRICITE = 'listeEmissionsElectricite';

  /** Clé de stockage de la ventilation d'un classeur importé. */
  const CLE_VENTILATION = 'misfat_dispatched_lines';

  /** Nomenclature de la catégorie, telle que le tableau de bord la nomme. */
  const CATEGORIE = 'Électricité achetée';

  /**
   * Agrégat serveur de référence : 5 tCO₂e sur le Scope 1.
   *
   * <p>Le Scope 2 est laissé vide pour que l'apport local s'y applique — le
   * repli ne surcharge jamais un poste que le serveur documente déjà.</p>
   */
  const reponseServeur: EmissionStats = {
    mode: 'PHYSIQUE',
    unit: 'tCO2e',
    currency: null,
    measureCount: 1,
    total: 5,
    scope1: 5,
    scope2: 0,
    scope3: 0,
    byScope: { SCOPE_1: 5 },
    byCategory: {},
    byScopeCategory: {},
    byFiliale: [],
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

  /**
   * Monte la console et répond à ses appels réseau.
   *
   * <p>Seul l'agrégat porte une charge utile : les autres requêtes n'ont pas de
   * part dans ce que ces bancs vérifient — hors les exercices, sans lesquels le
   * filtre global n'émet pas et l'agrégat n'est jamais demandé.</p>
   *
   * <p>Les requêtes sont servies en plusieurs passes : la console n'appelle
   * l'agrégat qu'une fois l'exercice connu, donc dans une vague postérieure à
   * celle du premier rendu.</p>
   */
  function monter() {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);

    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;

      for (const requete of attente) {
        if (requete.request.url.includes('/emissions/stats/aggregate')) {
          requete.flush(reponseServeur);
        } else if (requete.request.url.includes('/annees')) {
          requete.flush([{ id: 1, valeur: 2024, statut: 'EN_COURS' }]);
        } else {
          requete.flush([]);
        }
      }

      fixture.detectChanges();
    }

    fixture.detectChanges();
    return fixture;
  }

  it('convertit une saisie d\'écran de 1 000 kg en 1 t', () => {
    // La ligne porte sa période : une saisie qu'aucune date ne rattache à un
    // exercice est écartée dès qu'un exercice est consulté, pour ne pas prêter
    // au millésime affiché des mesures qui documentent un autre.
    localStorage.setItem(CLE_ECRAN_ELECTRICITE, JSON.stringify([
      {
        id: 1, etablissement: 'MISFAT 1', emissionCalculee: 1_000,
        dateDebut: '2024-01-01', dateFin: '2024-01-31'
      }
    ]));

    const composant = monter().componentInstance;

    // 5 t du serveur + 1 t convertie depuis les 1 000 kg de l'écran.
    expect(composant.stats.totalCO2).toBe(6);
    expect(composant.stats.scope2).toBe(1);
    expect(composant.statsReelles?.byScopeCategory?.['SCOPE_2']?.[CATEGORIE]).toBe(1);
  });

  it('convertit une ligne ventilée de 1 000 kg en 1 t', () => {
    localStorage.setItem(CLE_VENTILATION, JSON.stringify({
      lignes: [{
        ecran: 'electricite-achetee',
        scope: 'SCOPE_2',
        emissionKg: 1_000,
        facteur: 0.5,
        uniteFacteur: 'kWh',
        libelleFacteur: 'Électricité réseau',
        baseAppliquee: 'MISFAT_INTERNE',
        origineFacteur: 'MS SQL BDD'
      }],
      fichier: 'test.xlsx',
      importeLe: '2026-01-01T00:00:00.000Z',
      exclues: 0
    }));

    const composant = monter().componentInstance;

    expect(composant.stats.totalCO2).toBe(6);
    expect(composant.stats.scope2).toBe(1);
  });

  it('n\'altère pas les tonnes venues du serveur', () => {
    // Aucune source locale : le total doit rester celui du serveur, sans
    // conversion parasite dans un sens ni dans l'autre.
    const composant = monter().componentInstance;

    expect(composant.stats.totalCO2).toBe(5);
    expect(composant.stats.scope1).toBe(5);
    expect(composant.stats.scope2).toBe(0);
  });

  it('ne compte pas deux fois une catégorie déjà portée par la ventilation', () => {
    // Même catégorie des deux côtés : la ventilation la renseigne, le relevé
    // d'écran ne doit pas s'y ajouter.
    localStorage.setItem(CLE_VENTILATION, JSON.stringify({
      lignes: [{
        ecran: 'electricite-achetee',
        scope: 'SCOPE_2',
        emissionKg: 1_000,
        facteur: 0.5,
        uniteFacteur: 'kWh',
        libelleFacteur: 'Électricité réseau',
        baseAppliquee: 'MISFAT_INTERNE',
        origineFacteur: 'MS SQL BDD'
      }],
      fichier: 'test.xlsx',
      importeLe: '2026-01-01T00:00:00.000Z',
      exclues: 0
    }));

    localStorage.setItem(CLE_ECRAN_ELECTRICITE, JSON.stringify([
      { id: 1, etablissement: 'MISFAT 1', emissionCalculee: 1_000 }
    ]));

    const composant = monter().componentInstance;

    expect(composant.stats.totalCO2).toBe(6);
    expect(composant.stats.scope2).toBe(1);
  });
});
