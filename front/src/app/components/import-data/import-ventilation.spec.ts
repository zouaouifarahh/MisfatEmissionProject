import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { ImportDataComponent } from './import-data.component';
import { DispatchStore, CLE_STOCKAGE } from '../../shared/dispatch/dispatch-store';
import { lireClasseurDispatch } from '../../shared/dispatch/dispatch-excel';

/** Balance générale, telle qu'elle est structurée en production. */
const BALANCE = [
  ['MainAccount', 'Nom', 'Débit', 'Catégorie Carbone'],
  ['602100', 'Achats matières combustibles Gasoil', '1 209 099,633', 0],
  ['606500', 'Matières consommables électrique', 8242480.356, 0],
  ['624000', 'Frêt et transport sur ventes', 8185529.555, 'Deep Sea Freight Transportation'],
  ['640100', 'Salaires et appointements', 51037008.974, 0]
];

const classeurBalance = (): ArrayBuffer => {
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(BALANCE), 'Sheet1');
  return XLSX.write(classeur, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

describe('Import d\'un classeur comptable', () => {
  let composant: ImportDataComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ImportDataComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    const fixture = TestBed.createComponent(ImportDataComponent);
    composant = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Dépose la balance et joue la ventilation, sans passer par le FileReader. */
  const ventiler = () => {
    const store = TestBed.inject(DispatchStore);
    store.chargerFacteurs().subscribe();
    httpMock.match(r => r.url.includes('emission-factors')).forEach(r => r.flush([]));

    composant.fichier = new File([classeurBalance()], 'BG MISFAT 2025.xlsx');
    // Le lecteur de fichiers n'est pas rejouable sous jsdom : la ventilation
    // est appelée sur le contenu déjà résolu, par le même chemin.
    (composant as any).appliquerVentilation(classeurBalance());
  };

  it('ventile le classeur et publie les lignes dans le magasin', () => {
    ventiler();

    expect(composant.resumeVentilation).toContain('ligne(s) ventilée(s) dans');
    expect(composant.resumeVentilation).toContain('SCOPE 1');
    expect(composant.resumeVentilation).toContain('SCOPE 3');

    const store = TestBed.inject(DispatchStore);
    expect(store.instantane.lignes.length).toBeGreaterThan(0);
    expect(store.totalPour('combustion-etablissements')).toBeGreaterThan(0);
  });

  it('absorbe le refus 422 du serveur quand la ventilation a abouti', () => {
    ventiler();

    // Le serveur n'accepte que les gabarits de référentiel : son refus est
    // légitime et ne doit pas contredire une ventilation réussie.
    (composant as any).rejetServeurEnAttente = { status: 422, error: { message: 'Fichier illisible' } };
    (composant as any).arbitrerResultat();

    expect(composant.etat).toBe('succes');
    expect(composant.message).toContain('Importation et ventilation réussies');
    expect(composant.message).toMatch(/\d+ lignes traitées/);
    expect(composant.message).not.toContain('illisible');
  });

  it('rapporte le refus du serveur quand rien n\'a été ventilé', () => {
    // Un classeur de référentiel mal formé n'a pas de ligne comptable : le
    // refus du serveur reste alors la seule information utile.
    (composant as any).etatVentilation = 'sans-objet';
    (composant as any).rejetServeurEnAttente = { status: 422, error: { message: 'Colonnes manquantes' } };
    (composant as any).arbitrerResultat();

    expect(composant.etat).toBe('erreur');
    expect(composant.message).toContain('illisible');
  });

  it('attend le verdict de la ventilation avant de trancher', () => {
    (composant as any).etatVentilation = 'en-cours';
    (composant as any).rejetServeurEnAttente = { status: 422 };
    (composant as any).arbitrerResultat();

    // Annoncer un échec pour le démentir une seconde plus tard serait pire
    // que d'attendre : l'écran reste en traitement.
    expect(composant.etat).toBe('traitement');
    expect(composant.message).toBe('');
  });

  it('inscrit la ventilation à l\'historique avec son compte réel', () => {
    ventiler();

    const entree = composant.historiqueComplet[0];
    expect(entree.status).toBe('SUCCESS');
    expect(composant.estEntreeLocale(entree)).toBe(true);
    expect(entree.fileName).toBe('BG MISFAT 2025.xlsx');

    // Le serveur journalise zéro ligne ; l'entrée locale porte le compte réel.
    expect(composant.lignesTraitees(entree)).toBeGreaterThan(0);
    expect(composant.lignesTraitees(entree)).toBe(
      composant.ventilation!.lignes.filter(l => l.ecran).length
    );
  });

  it('conserve l\'historique local après un rafraîchissement', () => {
    ventiler();
    const attendu = composant.lignesTraitees(composant.historiqueComplet[0]);

    // Un rechargement : nouveau composant, aucune donnée réinjectée à la main.
    const rejoue = TestBed.createComponent(ImportDataComponent);
    rejoue.componentInstance.ngOnInit();
    httpMock.match(() => true).forEach(r => r.flush([]));

    const entree = rejoue.componentInstance.historiqueComplet[0];
    expect(entree.status).toBe('SUCCESS');
    expect(entree.fileName).toBe('BG MISFAT 2025.xlsx');
    expect(rejoue.componentInstance.lignesTraitees(entree)).toBe(attendu);
  });

  it('masque le rejet du serveur pour un classeur déjà ventilé', () => {
    ventiler();

    // Le serveur journalise son propre refus : l'afficher à côté de la
    // ventilation réussie du même fichier ne dirait rien de vrai.
    composant.historique = [{
      id: 7, fileName: 'BG MISFAT 2025.xlsx', importDate: '2026-08-09T10:00:00Z',
      totalRows: 0, createdReferences: 0, createdSources: 0, createdFactors: 0,
      errorCount: 1, status: 'FAILED', errorDetail: 'Fichier illisible', importedBy: null
    }, {
      id: 6, fileName: 'referentiel-misfat.xlsx', importDate: '2026-08-08T10:00:00Z',
      totalRows: 120, createdReferences: 5, createdSources: 2, createdFactors: 12,
      errorCount: 0, status: 'SUCCESS', errorDetail: null, importedBy: null
    }];

    const noms = composant.historiqueComplet.map(l => `${l.fileName}:${l.status}`);
    expect(noms).toContain('BG MISFAT 2025.xlsx:SUCCESS');
    expect(noms).not.toContain('BG MISFAT 2025.xlsx:FAILED');

    // Les dépôts de référentiel, eux, restent intacts.
    expect(noms).toContain('referentiel-misfat.xlsx:SUCCESS');
  });

  it('efface la trace locale à la demande', () => {
    ventiler();
    expect(composant.historiqueVentilation.length).toBe(1);

    composant.viderHistoriqueLocal();

    expect(composant.historiqueVentilation).toEqual([]);
    expect(localStorage.getItem('misfat_import_history_local')).toBeNull();
  });

  it('signale un classeur sans ligne comptable sans crier à l\'échec', () => {
    const vide = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(vide, XLSX.utils.aoa_to_sheet([['Note'], ['rien']]), 'Notes');

    composant.fichier = new File([''], 'referentiel.xlsx');
    (composant as any).appliquerVentilation(XLSX.write(vide, { type: 'array', bookType: 'xlsx' }));

    expect(composant.resumeVentilation).toBe('');
    expect(composant.diagnosticVentilation).toBeTruthy();
    expect(composant.historiqueVentilation).toHaveLength(0);
  });
});

describe('Persistance de la répartition', () => {

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DispatchStore]
    });
  });

  /** Publie une répartition minimale dans un magasin donné. */
  const publier = (store: DispatchStore) => {
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(BALANCE), 'Sheet1');
    const rapport = lireClasseurDispatch(classeur);

    store.publier({
      lignes: store.valoriser(rapport.lignes),
      fichier: 'BG MISFAT 2025.xlsx',
      importeLe: '09/08/2026 10:00',
      exclues: rapport.exclues,
      nonVentilees: rapport.nonVentilees,
      exercice: 2025, entityId: null
    });
  };

  it('écrit la répartition sous la clé attendue', () => {
    const store = TestBed.inject(DispatchStore);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));

    publier(store);

    expect(CLE_STOCKAGE).toBe('misfat_dispatched_lines');
    const brut = localStorage.getItem(CLE_STOCKAGE);
    expect(brut).toBeTruthy();
    expect(JSON.parse(brut!).lignes.length).toBeGreaterThan(0);
  });

  it('relit la répartition au démarrage, comme après un rafraîchissement', () => {
    const premier = TestBed.inject(DispatchStore);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    publier(premier);

    const attendu = premier.totalPour('transport-aval');
    expect(attendu).toBeGreaterThan(0);

    // Une nouvelle instance simule le rechargement de la page.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DispatchStore]
    });

    const apresF5 = TestBed.inject(DispatchStore);
    expect(apresF5.instantane.lignes.length).toBe(premier.instantane.lignes.length);
    expect(apresF5.instantane.fichier).toBe('BG MISFAT 2025.xlsx');
    expect(apresF5.totalPour('transport-aval')).toBeCloseTo(attendu, 6);
  });

  it('reprend une répartition écrite sous l\'ancienne clé', () => {
    const heritee = {
      lignes: [{
        cle: 'x', feuille: 'Sheet1', ligneSource: 2, mainAccount: '606500',
        nom: 'Matières consommables électrique', categorieCarboneTexte: '0',
        categorieAbsente: true, reference: '', quantite: 1000, colonneValeur: 'Débit',
        colonnesEcartees: [], ecran: 'electricite-achetee', scope: 'SCOPE_2',
        motif: '', origineRoutage: 'compte', motCle: '606500', exclu: false,
        facteur: 1.443, uniteFacteur: 'TND', libelleFacteur: '', baseAppliquee: 'ADEME Fallback',
        origineFacteur: 'ADEME Fallback', emissionKg: 1443
      }],
      fichier: 'ancien.xlsx', importeLe: '', exclues: 0, nonVentilees: 0, exercice: 2025, entityId: null
    };
    localStorage.setItem('repartitionGlobaleMisfat', JSON.stringify(heritee));

    const store = TestBed.inject(DispatchStore);

    // La reprise se fait sous la nouvelle clé, et l'ancienne est retirée.
    expect(store.instantane.lignes).toHaveLength(1);
    expect(store.totalPour('electricite-achetee')).toBeCloseTo(1443, 3);
    expect(localStorage.getItem(CLE_STOCKAGE)).toBeTruthy();
    expect(localStorage.getItem('repartitionGlobaleMisfat')).toBeNull();
  });

  it('conserve les lignes ventilées quand le quota est atteint', () => {
    const store = TestBed.inject(DispatchStore);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));

    // Le premier appel échoue comme un quota dépassé, le repli doit passer.
    const vraiSetItem = Storage.prototype.setItem;
    let appels = 0;
    const espion = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage, cle: string, valeur: string
    ) {
      if (++appels === 1) throw new DOMException('QuotaExceededError');
      return vraiSetItem.call(this, cle, valeur);
    });

    publier(store);
    espion.mockRestore();

    // La répartition reste vivante et l'utilisateur est averti de la perte.
    expect(store.instantane.lignes.length).toBeGreaterThan(0);
    expect(store.avertissementPersistance).toContain('lignes ventilées');

    const conserve = JSON.parse(localStorage.getItem(CLE_STOCKAGE)!);
    expect(conserve.lignes.every((l: { ecran: string | null }) => l.ecran)).toBe(true);
  });
});
