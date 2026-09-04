import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ImportDataComponent } from './import-data.component';
import { EntityContextService } from '../../core/entity-context.service';
import { ReferentialImportLog } from '../../services/referential-import.service';

/**
 * Cloisonnement de l'écran d'import par société et par exercice.
 *
 * <p>Trois fuites se logeaient ici. L'historique était demandé sans aucun
 * critère : le tableau montrait les dépôts de tout le groupe, et changer de
 * société dans le bandeau n'y changeait rien puisque rien ne le rechargeait.</p>
 *
 * <p>Le dépôt lui-même ne disait pas pour qui il était fait : le journal
 * n'enregistrait ni société ni exercice, si bien qu'un fichier déposé pour
 * MISFAT MAROC était indiscernable d'un fichier déposé pour MISFAT TUNISIE.</p>
 *
 * <p>La troisième était la plus lourde de conséquences. L'écran envoyait la
 * société dans le champ {@code usineId} : les deux séries d'identifiants se
 * recouvrant, la société 2 était lue par le serveur comme l'usine 2 — laquelle
 * appartient à la société 1. Les corrections validées depuis MISFAT MAROC
 * allaient donc grossir le bilan de MISFAT TUNISIE.</p>
 */
describe("Import — cloisonnement par société et exercice", () => {

  const FILIALES = [
    { id: 1, code: 'MT', libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND' },
    { id: 2, code: 'MM', libelle: 'MISFAT MAROC', pays: 'Maroc', devise: 'MAD' }
  ];

  const ANNEES = [
    { id: 1, valeur: 2025, statut: 'CLOTUREE' },
    { id: 2, valeur: 2026, statut: 'EN_COURS' }
  ];

  let httpMock: HttpTestingController;

  /** Option de société portant l'identifiant voulu, prise au catalogue. */
  const societe = (id: number) => {
    let options: { id: number | null }[] = [];
    TestBed.inject(EntityContextService).entities$.subscribe(o => (options = o)).unsubscribe();
    return options.find(o => o.id === id) as never;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ImportDataComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  /**
   * Monte l'écran sur un périmètre donné.
   *
   * <p>Le contexte est amorcé avant la création du composant : ses exercices
   * doivent être arrêtés pour que {@code filter$} émette, faute de quoi l'écran
   * ne verrait jamais de périmètre.</p>
   */
  const monter = (filialeId: number | null, annee: number | null) => {
    const contexte = TestBed.inject(EntityContextService);
    httpMock.match(r => r.url.includes('/filiales')).forEach(r => r.flush(FILIALES));
    httpMock.match(r => r.url.includes('/annees')).forEach(r => r.flush(ANNEES));

    if (filialeId !== null) contexte.selectEntity(societe(filialeId));
    httpMock.match(r => r.url.includes('/usines')).forEach(r => r.flush([]));
    contexte.selectYear(annee);

    const fixture = TestBed.createComponent(ImportDataComponent);
    fixture.detectChanges();
    return fixture;
  };

  /** Requêtes d'historique en attente, la plus récente en dernier. */
  const appelsHistorique = () => httpMock.match(r => r.url.includes('/referential/imports'));

  /** Répond à toutes les demandes d'historique en attente. */
  const repondreHistorique = (logs: ReferentialImportLog[] = []) =>
    appelsHistorique().forEach(r => r.flush(logs));

  describe("historique des imports", () => {

    it("ne demande que les dépôts de la société et de l'exercice consultés", () => {
      monter(1, 2025);

      const appels = appelsHistorique();
      const dernier = appels[appels.length - 1].request;

      expect(dernier.params.get('filialeId')).toBe('1');
      expect(dernier.params.get('annee')).toBe('2025');
    });

    it("redemande l'historique quand le bandeau change de société et d'année", () => {
      const fixture = monter(1, 2025);
      repondreHistorique();

      const contexte = TestBed.inject(EntityContextService);
      contexte.selectEntity(societe(2));
      httpMock.match(r => r.url.includes('/usines')).forEach(r => r.flush([]));
      contexte.selectYear(2026);
      fixture.detectChanges();

      // Passer de MISFAT TUNISIE 2025 à MISFAT MAROC 2026 doit repartir au
      // serveur : sans nouvel appel, le tableau garderait les dépôts du premier
      // périmètre sous le libellé du second.
      const apres = appelsHistorique();
      expect(apres.length).toBeGreaterThan(0);

      const dernier = apres[apres.length - 1].request;
      expect(dernier.params.get('filialeId')).toBe('2');
      expect(dernier.params.get('annee')).toBe('2026');
    });

    it("ne repart pas au serveur pour un simple changement d'usine", () => {
      const fixture = monter(1, 2025);
      repondreHistorique();

      TestBed.inject(EntityContextService).selectUsine(3);
      fixture.detectChanges();

      // L'usine ne cloisonne pas les dépôts : redemander la même liste serait
      // un aller-retour pour rien.
      expect(appelsHistorique().length).toBe(0);
    });
  });

  describe("dépôt d'un classeur", () => {

    it("transmet la société et l'exercice au serveur", () => {
      const fixture = monter(2, 2026);
      repondreHistorique();

      fixture.componentInstance.fichier = new File(['x'], 'base.xlsx');
      fixture.componentInstance.envoyer();

      const depot = httpMock.expectOne(r => r.url.includes('/referential/import')
        && !r.url.includes('/imports'));

      expect(depot.request.params.get('filialeId')).toBe('2');
      expect(depot.request.params.get('annee')).toBe('2026');
    });

    it("reste fermé tant qu'aucune société n'est choisie", () => {
      const fixture = monter(null, 2026);
      repondreHistorique();
      const composant = fixture.componentInstance;

      composant.fichier = new File(['x'], 'base.xlsx');

      // Un classeur déposé depuis la vue Groupe n'appartiendrait à aucune
      // société en particulier, donc à toutes.
      expect(composant.perimetreComplet).toBe(false);
      expect(composant.pretAEnvoyer).toBe(false);
      expect(composant.motifPerimetreIncomplet).toContain('une société');
    });

    it("n'envoie rien quand le périmètre est incomplet", () => {
      const fixture = monter(null, 2026);
      repondreHistorique();

      fixture.componentInstance.fichier = new File(['x'], 'base.xlsx');
      fixture.componentInstance.envoyer();

      httpMock.expectNone(r => r.url.includes('/referential/import')
        && !r.url.includes('/imports'));
    });
  });

  describe("lignes corrigées", () => {

    it("porte la société dans son propre champ, et non dans celui du site", () => {
      const fixture = monter(2, 2026);
      repondreHistorique();

      const charge = (fixture.componentInstance as any).chargeUtilePour({
        cle: 'l1', nom: 'Achat', quantite: 100, facteur: 0.5, uniteFacteur: 'TND'
      });

      // La société 2 envoyée comme usineId était lue par le serveur comme
      // l'usine « MISFAT 2 », qui appartient à la société 1.
      expect(charge.filialeId).toBe(2);
      expect(charge.usineId).toBeNull();
    });

    it("date la mesure de l'exercice consulté", () => {
      const fixture = monter(1, 2025);
      repondreHistorique();

      const charge = (fixture.componentInstance as any).chargeUtilePour({
        cle: 'l1', nom: 'Achat', quantite: 100, facteur: 0.5, uniteFacteur: 'TND'
      });

      expect(charge.measureDate).toBe('2025-12-31');
    });

    it("transmet le site quand le bandeau en désigne un", () => {
      const fixture = monter(1, 2025);
      repondreHistorique();

      TestBed.inject(EntityContextService).selectUsine(3);
      fixture.detectChanges();

      const charge = (fixture.componentInstance as any).chargeUtilePour({
        cle: 'l1', nom: 'Achat', quantite: 100, facteur: 0.5, uniteFacteur: 'TND'
      });

      expect(charge.filialeId).toBe(1);
      expect(charge.usineId).toBe(3);
    });
  });

  describe("historique local des ventilations", () => {

    /** Entrée locale telle que la ventilation l'inscrit. */
    const entreeLocale = (filialeId: number | null, annee: number | null): ReferentialImportLog => ({
      id: -1, fileName: 'BG.xlsx', importDate: new Date().toISOString(),
      totalRows: 3, createdReferences: 0, createdSources: 0, createdFactors: 0,
      errorCount: 0, status: 'SUCCESS', errorDetail: null,
      importedBy: 'Ventilation locale', filialeId, annee
    });

    it("ne montre pas la ventilation d'une autre société", () => {
      const fixture = monter(2, 2026);
      repondreHistorique();
      const composant = fixture.componentInstance;

      composant.historiqueVentilation = [entreeLocale(1, 2026)];

      // Le serveur filtre ses dépôts ; les entrées locales, elles, survivent
      // dans le navigateur et se filtrent ici.
      expect(composant.historiqueComplet).toEqual([]);
    });

    it("ne montre pas la ventilation d'un autre exercice", () => {
      const fixture = monter(1, 2026);
      repondreHistorique();
      const composant = fixture.componentInstance;

      composant.historiqueVentilation = [entreeLocale(1, 2025)];

      expect(composant.historiqueComplet).toEqual([]);
    });

    it("montre la ventilation du périmètre consulté", () => {
      const fixture = monter(1, 2026);
      repondreHistorique();
      const composant = fixture.componentInstance;

      composant.historiqueVentilation = [entreeLocale(1, 2026)];

      expect(composant.historiqueComplet.length).toBe(1);
    });

    it("écarte une ventilation d'avant le cloisonnement plutôt que de l'attribuer", () => {
      const fixture = monter(1, 2026);
      repondreHistorique();
      const composant = fixture.componentInstance;

      // Sans périmètre inscrit, l'entrée ne dit pas à qui elle appartient :
      // l'afficher sous la société consultée lui prêterait une origine.
      composant.historiqueVentilation = [entreeLocale(null, null)];

      expect(composant.historiqueComplet).toEqual([]);
    });
  });
});
