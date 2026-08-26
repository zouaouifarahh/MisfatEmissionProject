import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { EntityContextService, EntityFilter } from './entity-context.service';
import { AnneeReference } from '../models/organization.model';

/**
 * Amorçage du filtre global : aucune vue ne part sans son exercice.
 *
 * <p>Le filtre se compose de trois {@link BehaviorSubject}, qui émettent tous
 * dès leur création. Le premier filtre sortait donc avec {@code year: null} —
 * non parce que l'utilisateur demandait tous les exercices, mais parce que la
 * liste des exercices n'était pas encore revenue.</p>
 *
 * <p>Les deux s'écrivent pareil et ne veulent pas dire la même chose. Le
 * serveur, lui, lit un exercice absent comme « tous les exercices » : le
 * tableau de bord affichait la somme de toutes les années sous le millésime en
 * cours, avant de se corriger à la réponse suivante. Sur le rendu serveur, où
 * il n'y a pas de seconde réponse, ce total faux était le seul que la page
 * portait.</p>
 */
describe('Filtre global — amorçage de l\'exercice', () => {

  const ANNEES: AnneeReference[] = [
    { id: 1, valeur: 2024, statut: 'CLOTUREE' },
    { id: 2, valeur: 2025, statut: 'CLOTUREE' },
    { id: 3, valeur: 2026, statut: 'EN_COURS' }
  ] as AnneeReference[];

  let httpMock: HttpTestingController;
  let service: EntityContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EntityContextService]
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EntityContextService);
  });

  /** Recueille tout ce que le filtre émet, depuis l'abonnement. */
  const observer = (): EntityFilter[] => {
    const recus: EntityFilter[] = [];
    service.filter$.subscribe(filtre => recus.push(filtre));
    return recus;
  };

  /** Sert la liste des exercices, comme le fait organization-service. */
  const servirAnnees = (annees: AnneeReference[] = ANNEES) => {
    httpMock.expectOne(r => r.url.includes('/annees')).flush(annees);
  };

  /** Écarte les appels que le service passe en propre. */
  const ignorerLeReste = () => {
    httpMock.match(() => true).forEach(r => r.flush([]));
  };

  it('n\'émet aucun filtre tant que les exercices ne sont pas revenus', () => {
    const recus = observer();

    // C'est ici que partaient les requêtes sans année.
    expect(recus).toHaveLength(0);
    expect(service.amorce).toBe(false);

    ignorerLeReste();
  });

  it('émet un premier filtre déjà porteur de l\'exercice en cours', () => {
    const recus = observer();
    servirAnnees();

    expect(recus).toHaveLength(1);
    expect(recus[0].year).toBe(2026);
    expect(service.amorce).toBe(true);

    ignorerLeReste();
  });

  it('ne fait jamais lire un exercice nul comme premier filtre', () => {
    const recus = observer();
    servirAnnees();
    ignorerLeReste();

    // La distinction tient à cela : `null` ne doit jamais désigner « pas
    // encore su », seulement « tous les exercices », et jamais d'office.
    expect(recus.every(filtre => filtre.year !== null)).toBe(true);
  });

  it('retient le dernier exercice quand aucun n\'est en cours', () => {
    const recus = observer();
    servirAnnees([
      { id: 1, valeur: 2024, statut: 'CLOTUREE' },
      { id: 2, valeur: 2025, statut: 'CLOTUREE' }
    ] as AnneeReference[]);

    expect(recus[0].year).toBe(2025);

    ignorerLeReste();
  });

  it('sert le filtre courant à un abonné tardif', () => {
    servirAnnees();
    ignorerLeReste();

    // Le flux est rejoué : un écran ouvert après l'amorçage reçoit le filtre
    // sans attendre qu'il change.
    const recus = observer();
    expect(recus).toHaveLength(1);
    expect(recus[0].year).toBe(2026);
  });

  describe('serveur d\'organisation muet', () => {

    it('laisse tout de même partir les vues', () => {
      const recus = observer();
      httpMock.expectOne(r => r.url.includes('/annees'))
        .flush('indisponible', { status: 503, statusText: 'Service Unavailable' });

      // Sans quoi un serveur d'organisation en panne figerait l'application
      // sur un écran vide, là où elle sait afficher un bilan consolidé.
      expect(service.amorce).toBe(true);
      expect(recus).toHaveLength(1);
      expect(recus[0].year).toBeNull();

      ignorerLeReste();
    });
  });

  describe('changements postérieurs', () => {

    it('laisse passer un exercice choisi explicitement', () => {
      const recus = observer();
      servirAnnees();
      ignorerLeReste();

      service.selectYear(2024);

      expect(recus).toHaveLength(2);
      expect(recus[1].year).toBe(2024);
    });

    it('laisse passer « tous les exercices » demandé par l\'utilisateur', () => {
      const recus = observer();
      servirAnnees();
      ignorerLeReste();

      // La retenue ne vaut qu'à l'amorçage : un exercice nul choisi à l'écran
      // est une consolidation demandée, et doit atteindre les vues.
      service.selectYear(null);

      expect(recus).toHaveLength(2);
      expect(recus[1].year).toBeNull();
    });

    it('conserve l\'exercice consulté quand la liste est rafraîchie', () => {
      const recus = observer();
      servirAnnees();
      ignorerLeReste();

      service.selectYear(2024);
      service.refreshYears();
      httpMock.expectOne(r => r.url.includes('/annees')).flush(ANNEES);

      // Un ajout d'exercice ne doit pas déplacer le périmètre de travail.
      expect(recus[recus.length - 1].year).toBe(2024);
    });
  });
});
