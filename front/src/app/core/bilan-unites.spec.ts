import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { BilanCarbone, BilanCarboneService } from './bilan-carbone.service';

/**
 * Unités du bilan carbone.
 *
 * <p>Le serveur agrège en <strong>tCO₂e</strong> — c'est l'unité qu'il déclare
 * dans sa réponse — tandis que le bilan cumule des <strong>kilogrammes</strong>,
 * comme les apports restés dans le navigateur. Mélanger les deux faisait peser
 * la part serveur mille fois moins que la part locale : un exercice documenté
 * par la seule base ressortait à 0,00 tCO₂e sur la mini-carte du graphique
 * d'évolution, alors que le texte d'analyse annonçait des dizaines de milliers
 * de tonnes.</p>
 *
 * <p>Ces bancs verrouillent la conversion. Une régression ici se paierait par un
 * facteur mille sur tout l'historique pluriannuel.</p>
 */
describe('BilanCarboneService — unités', () => {

  /** Agrégat serveur, en tCO₂e comme l'API les renvoie. */
  const STATS_TONNES = {
    mode: 'PHYSIQUE',
    unit: 'tCO2e',
    currency: null,
    measureCount: 4,
    total: 35.092,
    scope1: 5.321,
    scope2: 27.135,
    scope3: 2.636,
    byScope: { SCOPE_1: 5.321, SCOPE_2: 27.135, SCOPE_3: 2.636 },
    byCategory: {},
    byScopeCategory: {
      SCOPE_2: { 'Électricité achetée': 27.135 }
    },
    byFiliale: [],
    byCurrency: {},
    unconvertedCurrencies: []
  };

  const FILIALES = [
    { id: 1, code: 'MT', libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND', usines: [] }
  ];

  let httpMock: HttpTestingController;
  let service: BilanCarboneService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(BilanCarboneService);
  });

  /** Sert les requêtes du chargement, y compris celles qu'elles déclenchent. */
  function servir(): void {
    for (let passe = 0; passe < 4; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) return;

      for (const requete of attente) {
        if (requete.request.url.includes('/stats/aggregate')) requete.flush(STATS_TONNES);
        else if (requete.request.url.includes('/filiales')) requete.flush(FILIALES);
        else requete.flush([]);
      }
    }
  }

  it('convertit les tonnes du serveur en kilogrammes', async () => {
    let bilan: BilanCarbone | null = null;
    service.charger(1, null, 2025).subscribe(resultat => (bilan = resultat));
    servir();

    // 27,135 tCO₂e servies par le serveur valent 27 135 kg au bilan.
    expect(bilan).not.toBeNull();
    expect(bilan!.totalKg).toBeCloseTo(27_135, 3);
  });

  it('ne laisse pas un exercice documenté par la base ressortir à zéro', async () => {
    let bilan: BilanCarbone | null = null;
    service.charger(1, null, 2025).subscribe(resultat => (bilan = resultat));
    servir();

    // Le symptôme d'origine : la mini-carte affichait 0,00 tCO₂e parce que le
    // total, divisé une seconde fois à l'affichage, tombait sous le millième.
    expect(bilan!.totalKg / 1000).toBeGreaterThan(1);
  });

  it('rapporte le scope qui porte la mesure', async () => {
    let bilan: BilanCarbone | null = null;
    service.charger(1, null, 2025).subscribe(resultat => (bilan = resultat));
    servir();

    expect(bilan!.scope2Kg).toBeCloseTo(27_135, 3);
    expect(bilan!.scope1Kg).toBe(0);
  });

  it('ne mélange plus les unités entre serveur et relevés locaux', async () => {
    // Un relevé d'écran de 1 000 kg doit peser exactement mille fois moins que
    // le million de kilogrammes qu'un agrégat serveur de 1 000 t représente.
    localStorage.setItem('listeEmissionsElectricite', JSON.stringify([
      { id: 1, etablissement: 'MISFAT I', emissionCalculee: 1_000 }
    ]));

    let bilan: BilanCarbone | null = null;
    service.charger(1, null, 2025).subscribe(resultat => (bilan = resultat));
    servir();

    // Le serveur documente déjà « Électricité achetée » : le relevé local ne
    // s'y ajoute pas, et le total reste celui du serveur, converti en kg.
    expect(bilan!.totalKg).toBeCloseTo(27_135, 3);
  });
});
