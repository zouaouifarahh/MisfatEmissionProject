import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  MesuresPageService, LigneImportBrute, ProgressionImport, TAILLE_LOT_IMPORT
} from './mesures-page.service';

/**
 * Import d'un classeur par lots successifs.
 *
 * <p>Trente-sept mille lignes en une requête tiennent le serveur plusieurs
 * minutes dans une seule transaction, et la connexion expire avant la réponse.
 * L'import échoue alors sans qu'on sache ce qui a été écrit — le pire des deux
 * mondes : ni succès, ni certitude d'échec.</p>
 *
 * <p>Découpé, chaque lot se valide seul : une coupure laisse les lots
 * précédents en base plutôt que de tout perdre, et le compte des lignes déjà
 * enregistrées permet de reprendre sans doubler.</p>
 */
describe('Import par lots', () => {

  const BULK = 'http://localhost:8082/api/v1/emissions/bulk-import';

  let service: MesuresPageService;
  let http: HttpTestingController;

  /** Un lot de lignes brutes, réduites à ce qui sert ici. */
  const lignes = (nombre: number): LigneImportBrute[] =>
    Array.from({ length: nombre }, (_, i) => ({
      dateDocument: '2025-06-15', label: 'Achat ' + i, rawAmount: 100,
      rawCurrency: 'TND', categoryCode: 'MS3C1CP', sourceCode: null,
      filialeId: 1, unit: 'TND', sourceRowNumber: i + 1
    }));

  /** Sert un lot en annonçant ce qu'il a accepté. */
  const servir = (acceptees: number, refusees = 0, motifs = '') => {
    const requete = http.expectOne(BULK);
    requete.flush(null, {
      status: 201, statusText: 'Created',
      headers: {
        'X-Imported-Count': String(acceptees),
        'X-Skipped-Count': String(refusees),
        'X-Skipped-Reasons': motifs
      }
    });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(MesuresPageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('découpe le classeur en lots de mille', () => {
    const avancements: ProgressionImport[] = [];
    service.importerParLots(lignes(2_500)).subscribe(a => avancements.push(a));

    servir(1_000);
    servir(1_000);
    servir(500);

    expect(avancements.map(a => a.lot)).toEqual([1, 2, 3]);
    expect(avancements[0].lots).toBe(3);
    expect(TAILLE_LOT_IMPORT).toBe(1_000);
  });

  it('envoie les lots l\'un après l\'autre, jamais en parallèle', () => {
    // Trente-huit requetes simultanees sur la meme table se disputeraient les
    // verrous, et le gain de temps se paierait en interblocages.
    service.importerParLots(lignes(2_500)).subscribe();

    http.expectOne(BULK).flush(null, {
      status: 201, statusText: 'Created', headers: { 'X-Imported-Count': '1000' }
    });
    // Le deuxieme lot ne part qu'une fois le premier revenu : une seule requete
    // est en vol a chaque instant.
    http.expectOne(BULK).flush(null, {
      status: 201, statusText: 'Created', headers: { 'X-Imported-Count': '1000' }
    });
    http.expectOne(BULK).flush(null, {
      status: 201, statusText: 'Created', headers: { 'X-Imported-Count': '500' }
    });
  });

  it('cumule les lignes enregistrées d\'un lot à l\'autre', () => {
    const avancements: ProgressionImport[] = [];
    service.importerParLots(lignes(2_500)).subscribe(a => avancements.push(a));

    servir(1_000);
    servir(900, 100);
    servir(500);

    expect(avancements.map(a => a.importees)).toEqual([1_000, 1_900, 2_400]);
    expect(avancements[2].ecartees).toBe(100);
  });

  it('ne signale la fin qu\'au dernier lot', () => {
    const avancements: ProgressionImport[] = [];
    service.importerParLots(lignes(2_500)).subscribe(a => avancements.push(a));

    servir(1_000);
    servir(1_000);
    servir(500);

    expect(avancements.map(a => a.termine)).toEqual([false, false, true]);
  });

  it('ne répète pas un motif d\'écart identique', () => {
    // Meme colonne absente, meme facteur introuvable : les dedoubler rendrait
    // le message illisible sans rien apprendre de plus.
    const avancements: ProgressionImport[] = [];
    service.importerParLots(lignes(2_000)).subscribe(a => avancements.push(a));

    servir(900, 100, 'facteur introuvable');
    servir(900, 100, 'facteur introuvable');

    expect(avancements[1].motifs).toBe('facteur introuvable');
  });

  it('laisse les lots déjà acceptés en base quand un lot échoue', () => {
    // Le compte des lignes acquises permet de reprendre sans doubler ce qui
    // est passe.
    const avancements: ProgressionImport[] = [];
    let echoue = false;

    service.importerParLots(lignes(2_500))
      .subscribe({ next: a => avancements.push(a), error: () => (echoue = true) });

    servir(1_000);
    http.expectOne(BULK).flush('', { status: 503, statusText: 'Service Unavailable' });

    expect(avancements).toHaveLength(1);
    expect(avancements[0].importees).toBe(1_000);
    expect(echoue).toBe(true);
  });

  it('ne fait aucun appel sur un classeur vide', () => {
    const avancements: ProgressionImport[] = [];
    service.importerParLots([]).subscribe(a => avancements.push(a));

    expect(avancements).toEqual([
      { lot: 0, lots: 0, importees: 0, ecartees: 0, motifs: '', termine: true }
    ]);
  });
});
