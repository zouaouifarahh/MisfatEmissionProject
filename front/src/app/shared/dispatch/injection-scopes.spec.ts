import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

import { DashboardComponent } from '../../backoffice/components/dashboard/dashboard';
import { DispatchStore } from './dispatch-store';
import { lireClasseurDispatch } from './dispatch-excel';
import { adapterVersMesure, estLigneVentilee, SOURCE_VENTILATION } from './adaptateurs-mesure';
import { EmissionListComponent } from '../../components/emission-list/emission-list';
import { CombustionVehiculesComponent } from '../../components/combustion-vehicules/combustion-vehicules';

/**
 * Les lignes ventilées rejoignent la grille de leur catégorie.
 *
 * <p>Le bandeau ne suffisait pas : l'utilisateur attend ses lignes dans le
 * tableau, aux côtés de ses saisies, et les totaux doivent en tenir compte.</p>
 */
describe('Injection des lignes ventilées dans les scopes', () => {

  /** Balance réduite, une ligne par destination éprouvée. */
  const BALANCE = [
    ['MainAccount', 'Nom', 'Débit', 'Catégorie Carbone'],
    ['602100', 'Achats matières combustibles Gasoil', '1 209 099,633', 0],
    ['602120', 'Achats matières combust huiles PDR', 253808.696, 0],
    ['606500', 'Matières consommables électrique', 8242480.356, 0],
    ['601000', 'Achats Matières.Premières.Local', 17822675.43, 0],
    ['223600', 'Outillages d\'usine', 39135.87, 'Metals'],
    ['640100', 'Salaires et appointements', 51037008.974, 0]
  ];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  }, 30_000);

  const repartir = () => {
    const store = TestBed.inject(DispatchStore);
    const httpMock = TestBed.inject(HttpTestingController);

    store.chargerFacteurs().subscribe();
    httpMock.match(r => r.url.includes('emission-factors')).forEach(r => r.flush([]));

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

    return store;
  };

  const monter = (onglet: string) => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive(onglet);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /** Lignes de données de la grille, en-tête et pied exclus. */
  const lignesGrille = (hote: Element): HTMLElement[] =>
    Array.from(hote.querySelectorAll<HTMLElement>('.data-table tbody tr'))
      .filter(l => !l.querySelector('.empty-table-msg, .empty-row'));

  it('affiche les lignes ventilées dans la grille de combustion usines', () => {
    repartir();
    const fixture = monter('combustion-etablissements');
    const ecran: Element = fixture.nativeElement.querySelector('app-emission-list')!;

    // Deux comptes de combustibles sont ventilés vers cet écran, et n'y sont
    // comptés qu'une fois : chaque ligne porte une destination et une seule.
    expect(lignesGrille(ecran).length).toBe(2);

    const texte = lignesGrille(ecran).map(l => l.textContent ?? '').join(' | ');
    expect(texte).toContain('Achats matières combustibles Gasoil');

    // Le compte 602100 reste visible, mais dans la colonne « Code article ERP »
    // et non plus dans celle du référentiel carbone : un numéro de compte
    // identifie une écriture, il ne documente aucun facteur d'émission.
    expect(texte).toContain('602100');

    const entetes = Array.from(ecran.querySelectorAll('.data-table thead th'))
      .map(th => th.textContent?.trim() ?? '');
    expect(entetes.some(e => e.startsWith('Référence carbone'))).toBe(true);
    expect(entetes).toContain('Code article ERP');

    expect(ecran.querySelector('.empty-table-msg')).toBeNull();
  }, 30_000);

  it('alimente l\'électricité, les achats et la CAPEX du même dépôt', () => {
    repartir();

    for (const [onglet, balise, extrait] of [
      ['electricite-achetee', 'app-electricite-achetee', 'Matières consommables électrique'],
      ['biens-services', 'app-biens-services', 'Achats Matières.Premières.Local'],
      ['investissements', 'app-investissements', 'Outillages d\'usine']
    ]) {
      const ecran: Element = monter(onglet).nativeElement.querySelector(balise)!;
      const lignes = lignesGrille(ecran);

      expect(lignes.length, onglet).toBeGreaterThan(0);
      expect(lignes.map(l => l.textContent).join(' '), onglet).toContain(extrait);
    }
  }, 30_000);

  it('compte les lignes ventilées dans les indicateurs de la catégorie', () => {
    const store = repartir();
    const ecran: Element = monter('combustion-etablissements')
      .nativeElement.querySelector('app-emission-list')!;

    const cartes = Array.from(ecran.querySelectorAll('.kpi-carte'));
    const lignesCarte = cartes.find(c => (c.textContent ?? '').includes('Nombre de lignes'));
    expect(lignesCarte?.textContent).toContain('2');

    // Le total affiché est celui que le magasin a calculé.
    const attendu = store.totalPour('combustion-etablissements');
    expect(attendu).toBeGreaterThan(0);

    const emissionsCarte = cartes.find(c => (c.textContent ?? '').includes('Total émissions'));
    const chiffres = (emissionsCarte?.textContent ?? '').replace(/[\s ]/g, '');
    expect(chiffres).toContain(Math.round(attendu).toLocaleString('fr-FR').replace(/[\s ]/g, ''));
  }, 30_000);

  it('n\'écrit jamais les lignes ventilées dans le stockage de l\'écran', () => {
    repartir();
    monter('combustion-etablissements');

    // La grille les affiche, mais elles n'appartiennent pas à l'écran : un
    // second import les dupliquerait si elles y étaient recopiées.
    const sauvegarde = localStorage.getItem('listeEmissions');
    expect(sauvegarde === null || JSON.parse(sauvegarde).length === 0).toBe(true);
  }, 30_000);

  it('instancie les écrans du Scope 1 hors du tableau de bord', async () => {
    // Montés seuls, sans le tableau de bord pour fournir un contexte : c'est
    // le cas qui révèle un jeton d'injection non résolu.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EmissionListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    const usines = TestBed.createComponent(EmissionListComponent);
    expect(() => usines.detectChanges()).not.toThrow();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    expect(Array.isArray(usines.componentInstance.lignesVentilees)).toBe(true);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CombustionVehiculesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    const vehicules = TestBed.createComponent(CombustionVehiculesComponent);
    expect(() => vehicules.detectChanges()).not.toThrow();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    expect(Array.isArray(vehicules.componentInstance.lignesVentilees)).toBe(true);
  }, 30_000);

  it('rattache les lignes ventilées à l\'usine du périmètre', () => {
    repartir();
    const fixture = monter('combustion-etablissements');
    const ecran: Element = fixture.nativeElement.querySelector('app-emission-list')!;

    const premiere = lignesGrille(ecran)[0];
    const cellules = premiere.querySelectorAll('td');

    // La colonne « Usine » ne porte plus que le nom de l'usine : l'étiquette
    // métier a sa propre colonne, la provenance la sienne.
    expect(cellules[0].querySelector('.type-badge')).toBeNull();
    expect(cellules[0].querySelector('.prov-badge')).toBeNull();

    expect(cellules[1].querySelector('.type-badge')?.textContent?.trim())
      .toBe(SOURCE_VENTILATION);

    const provenance = premiere.querySelector('.prov-badge');
    expect(provenance?.textContent?.trim()).toBe('📄 Import Excel');
    expect(provenance?.closest('td')).not.toBe(cellules[0]);
  }, 30_000);

  it('distingue une ligne ventilée d\'une saisie par son identifiant', () => {
    const ligne = {
      cle: 'Sheet1#2', feuille: 'Sheet1', ligneSource: 2, mainAccount: '602100',
      nom: 'Achats matières combustibles Gasoil', categorieCarboneTexte: '0',
      categorieAbsente: true, reference: '', quantite: 1000, colonneValeur: 'Débit',
      colonnesEcartees: [], ecran: 'combustion-etablissements' as const, scope: 'SCOPE_1' as const,
      motif: 'Compte 602100', origineRoutage: 'compte' as const, motCle: '602100', exclu: false,
      facteur: 0.45, uniteFacteur: 'TND', libelleFacteur: '', baseAppliquee: 'ADEME Fallback',
      origineFacteur: 'ADEME Fallback' as const, emissionKg: 450,
      // Un repli n'a pas de référence au référentiel : le champ reste vide, et
      // le compte 602100 part dans « codeArticle ».
      referenceCarbone: ''
    };

    const mesure = adapterVersMesure(ligne, 0, 'Combustion dans les usines', 'MISFAT 1');

    expect(estLigneVentilee(mesure)).toBe(true);
    expect(estLigneVentilee({ id: 12 })).toBe(false);

    // L'usine du périmètre, et la provenance dans son propre champ.
    expect(mesure.etablissement).toBe('MISFAT 1');
    expect(mesure.sourceData).toBe(SOURCE_VENTILATION);

    // Le montant tient lieu de quantité : le facteur est un ratio monétaire.
    expect(mesure.quantite).toBe(1000);
    expect(mesure.unite).toBe('TND');
    expect(mesure.typeDonnee).toBe('Monetaire');
    expect(mesure.emissionCalculee).toBe(450);
    // Un ratio moyen reste une estimation, jamais un relevé.
    expect(mesure.hypothese).toBe('Estimation');
    expect(mesure.databaseSource).toBe('ADEME Fallback');
  });

  it('retrouve les lignes dans les grilles après un rafraîchissement', () => {
    repartir();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });

    const ecran: Element = monter('combustion-etablissements')
      .nativeElement.querySelector('app-emission-list')!;

    expect(lignesGrille(ecran).length).toBe(2);
  }, 30_000);
});
