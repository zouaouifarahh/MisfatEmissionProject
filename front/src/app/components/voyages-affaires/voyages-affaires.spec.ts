import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { VoyagesAffairesComponent, EmissionVoyage } from './voyages-affaires';

/**
 * Fumigation du composant et vérification de la pagination.
 *
 * <p>Un suivi annuel dépasse la centaine de missions : la pagination doit
 * borner ce qui est rendu, sans jamais perdre de ligne.</p>
 */
describe('VoyagesAffairesComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoyagesAffairesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  /**
   * Monte le composant, en garnissant éventuellement sa liste avant la première
   * passe de détection.
   *
   * <p>Muter l'état entre deux passes ferait remonter un NG0100 : hors d'un vrai
   * événement, la vue n'est pas marquée et la valeur mémorisée diffère de celle
   * relue à la vérification. C'est un artefact du banc d'essai, sans équivalent
   * au clic dans le navigateur.</p>
   */
  const monter = (lignes: EmissionVoyage[] = []) => {
    const fixture = TestBed.createComponent(VoyagesAffairesComponent);
    if (lignes.length) fixture.componentInstance.listeEmissions = lignes;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /** Jeu de missions synthétique, au volume d'un suivi annuel. */
  const missions = (nombre: number): EmissionVoyage[] =>
    Array.from({ length: nombre }, (_, i) => ({
      id: i + 1,
      scope: 'SCOPE_3',
      categorie: 'Voyages d\'affaires',
      etablissement: 'MISFAT 1',
      reference: `2025-${String(i + 1).padStart(4, '0')}`,
      numeroOM: `OE25${String(i + 1).padStart(4, '0')}`,
      personne: i % 2 ? 'RIADH BEN AYED' : 'NAOUFEL MABROUK',
      provenance: 'Excel' as const,
      destination: i % 2 ? 'France' : 'MAROC',
      depart: 'Tunis',
      mode: 'Avion' as const,
      segment: 'Moyen-courrier' as const,
      distanceKm: 2969.02,
      montant: null,
      unite: 'km',
      devise: 'TND',
      participants: 1,
      nbrJours: 4,
      typeFacteur: 'Medium-haul, economy',
      referenceFacteur: 'MS3C6BT',
      facteur: 0.1295238796,
      uniteFacteur: 'pass.Km',
      baseAppliquee: 'DESNZ 2024',
      emissionCalculee: 384.56,
      dateDebut: '2025-01-05',
      dateFin: '2025-01-10',
      creeLe: '01/01/2025 08:00'
    }));

  it('rend ses dix colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Voyages d\'affaires');
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(10);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('borne l\'affichage à la taille de page sans perdre de ligne', () => {
    const fixture = monter(missions(91));
    const composant = fixture.componentInstance;

    // Vingt lignes par page par défaut, pour 91 missions filtrées.
    expect(composant.taillePage).toBe(20);
    expect(composant.emissionsFiltrees.length).toBe(91);
    expect(composant.emissionsPage.length).toBe(20);
    expect(composant.nombrePages).toBe(5);
    expect(composant.premierIndexPage).toBe(1);
    expect(composant.dernierIndexPage).toBe(20);

    expect(fixture.nativeElement.querySelectorAll('.data-table tbody tr').length).toBe(20);
  });

  it('navigue entre les pages et borne la dernière', () => {
    const composant = monter(missions(91)).componentInstance;

    composant.allerPage(3);
    expect(composant.pageCourante).toBe(3);
    expect(composant.emissionsPage[0].numeroOM).toBe('OE250041');

    // La dernière page ne contient que le reste : 91 − 80.
    composant.allerPage(5);
    expect(composant.emissionsPage.length).toBe(11);
    expect(composant.dernierIndexPage).toBe(91);

    // Aucune page au-delà des bornes.
    composant.allerPage(99);
    expect(composant.pageCourante).toBe(5);
    composant.allerPage(-3);
    expect(composant.pageCourante).toBe(1);
  });

  it('change de taille de page et repart de la première', () => {
    const composant = monter(missions(91)).componentInstance;

    composant.allerPage(4);
    composant.taillePage = 50;
    composant.changerTaillePage();

    expect(composant.pageCourante).toBe(1);
    expect(composant.emissionsPage.length).toBe(50);
    expect(composant.nombrePages).toBe(2);
  });

  it('revient en première page quand le filtrage change', () => {
    const composant = monter(missions(91)).componentInstance;

    composant.allerPage(4);
    composant.rechercheTexte = 'RIADH';
    composant.onFiltreChange();

    expect(composant.pageCourante).toBe(1);
    // Une mission sur deux porte ce collaborateur.
    expect(composant.emissionsFiltrees.length).toBe(45);
  });
});
