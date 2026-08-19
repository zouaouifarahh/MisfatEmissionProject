import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { TauxChangeService } from './taux-change.service';

/**
 * Table des cours partagée par les écrans.
 *
 * <p>Ce banc protège deux choses : que tous les écrans convertissent avec la
 * même table — deux chargements séparés donneraient deux résultats pour la même
 * ligne —, et qu'un facteur libellé en devise étrangère soit bien ramené au
 * dinar avant d'être appliqué à un montant en dinars.</p>
 */
describe('Table des cours de change', () => {

  const URL = 'http://localhost:8080/api/v1/currencies/exchange-rates';

  let service: TauxChangeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TauxChangeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Cours tels que la base MISFAT les porte : rien avant 2024. */
  const REPONSE = [
    { code: 'EUR', label: 'Euro', rate: 3.30, validFrom: '2024-01-01',
      validTo: '2024-12-31', pivot: false },
    { code: 'EUR', label: 'Euro', rate: 3.42, validFrom: '2025-01-01',
      validTo: null, pivot: false },
    { code: 'USD', label: 'Dollar', rate: 3.10, validFrom: '2024-01-01',
      validTo: null, pivot: false }
  ];

  const charger = (reponse: unknown[] = REPONSE) => {
    service.charger().subscribe();
    http.expectOne(URL).flush(reponse);
  };

  describe('chargement', () => {

    it('reprend les cours publiés', () => {
      charger();

      expect(service.taux).toHaveLength(3);
      expect(service.devises).toEqual(['EUR', 'TND', 'USD']);
    });

    it('ne rappelle pas le serveur au second appel', () => {
      // Deux chargements séparés donneraient deux tables, donc deux résultats
      // possibles pour la même ligne selon l'écran consulté.
      charger();
      service.charger().subscribe();

      http.expectNone(URL);
    });

    it('reste vide et réessayable après une erreur réseau', () => {
      service.charger().subscribe();
      http.expectOne(URL).flush('panne', { status: 500, statusText: 'Erreur' });

      expect(service.taux).toEqual([]);

      // L'échec ne condamne pas la session.
      service.charger().subscribe();
      http.expectOne(URL).flush(REPONSE);
      expect(service.taux).toHaveLength(3);
    });

    it('annonce la période réellement couverte', () => {
      charger();

      expect(service.premiereAnneeCouverte).toBe(2024);
      expect(service.derniereAnneeCouverte).toBe(2025);
    });

    it('n\'annonce aucune couverture sans cours', () => {
      expect(service.premiereAnneeCouverte).toBeNull();
      expect(service.derniereAnneeCouverte).toBeNull();
    });
  });

  describe('conversion d\'un montant', () => {

    it('applique le cours de la date demandée', () => {
      charger();

      expect(service.convertir(1_000, 'EUR', 'TND', '2024-06-15').montant)
        .toBeCloseTo(3_300, 6);
      expect(service.convertir(1_000, 'EUR', 'TND', '2025-06-15').montant)
        .toBeCloseTo(3_420, 6);
    });

    it('échoue proprement tant que la table n\'est pas chargée', () => {
      // Un montant faussement converti serait pire qu'une conversion refusée.
      const r = service.convertir(1_000, 'EUR', 'TND', '2024-06-15');

      expect(r.statut).toBe('DEVISE_INCONNUE');
      expect(r.montant).toBe(1_000);
    });
  });

  describe('facteur monétaire ramené au dinar', () => {

    it('laisse intact un facteur déjà en dinars', () => {
      charger();
      const r = service.facteurEnDinars(0.31, 'TND', 2024);

      expect(r.converti).toBe(false);
      expect(r.facteur).toBe(0.31);
      expect(r.avertissement).toBe('');
    });

    it('laisse intact un facteur sans devise déclarée', () => {
      charger();

      expect(service.facteurEnDinars(0.31, null, 2024).facteur).toBe(0.31);
    });

    it('divise un facteur en euros par le cours de l\'exercice', () => {
      // 0,42 kgCO₂e par euro, à 3,30 TND l'euro, fait 0,127 kgCO₂e par dinar.
      charger();
      const r = service.facteurEnDinars(0.42, 'EUR', 2024);

      expect(r.converti).toBe(true);
      expect(r.cours).toBe(3.30);
      expect(r.facteur).toBeCloseTo(0.42 / 3.30, 9);
    });

    it('suit le cours de l\'exercice, non celui du dernier connu', () => {
      charger();

      expect(service.facteurEnDinars(0.42, 'EUR', 2024).cours).toBe(3.30);
      expect(service.facteurEnDinars(0.42, 'EUR', 2025).cours).toBe(3.42);
    });

    it('conserve le facteur et avertit quand l\'exercice n\'est pas couvert', () => {
      // La base ne porte aucun cours avant 2024 : 2022 et 2023 sont concernés.
      charger();
      const r = service.facteurEnDinars(0.42, 'EUR', 2023);

      expect(r.converti).toBe(false);
      expect(r.facteur).toBe(0.42);
      expect(r.avertissement).toContain('2023');
      expect(r.avertissement).toContain('EUR');
    });

    it('avertit aussi pour une devise absente du référentiel', () => {
      charger();
      const r = service.facteurEnDinars(0.42, 'JPY', 2024);

      expect(r.converti).toBe(false);
      expect(r.avertissement).toContain('JPY');
    });
  });
});
