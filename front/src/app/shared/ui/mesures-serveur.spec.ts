import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MesuresServeurComponent } from './mesures-serveur';
import { mesureDuPerimetre, MesureServeur } from '../../services/mesures-serveur.service';
import { PerimetreOrganisation } from '../../core/perimetre';

/**
 * Mesures de la base rendues visibles sur les écrans de saisie.
 *
 * <p>Le tableau de bord agrège deux gisements — les saisies du navigateur et
 * les mesures du serveur — quand les écrans de saisie ne lisaient que le
 * premier. « Actifs loués en amont » pesait 28 346 tCO₂e au bilan et affichait
 * « aucun actif loué enregistré » sur son propre écran : le chiffre existait,
 * l'écran chargé de le documenter le niait, et rien ne disait lequel des deux
 * avait tort.</p>
 */
describe('Mesures serveur — panneau des écrans de saisie', () => {

  /** Mesure telle que l'API la sérialise, réduite à ce qui sert ici. */
  const brute = (p: {
    id: number; label: string; categorie: string; scope?: string;
    total: number; date: string; filiale?: number | null;
  }) => ({
    id: p.id, label: p.label, quantity: 100, unit: 'TND',
    totalCo2e: p.total, measureDate: p.date, filialeId: p.filiale ?? 1,
    origin: 'EXCEL_IMPORT',
    emissionFactor: {
      databaseSource: 'MISFAT_INTERNE',
      carbonReference: {
        category: { name: p.categorie, scope: { code: p.scope ?? 'SCOPE_3' } }
      }
    }
  });

  /** Le jeu réel de la base, pour les catégories qui en portent. */
  const REPONSE = [
    brute({ id: 8, label: 'Achats matières premières étrangers',
            categorie: 'Category 8: Upstream leased assets',
            total: 27_937_303.45, date: '2025-12-31' }),
    brute({ id: 9, label: 'Location entrepôt', total: 408_744,
            categorie: 'Category 8: Upstream leased assets', date: '2025-06-30' }),
    brute({ id: 1, label: 'Achats consommables', total: 1_990_267,
            categorie: 'Category 1: PG&S - GCP', date: '2025-12-31' }),
    brute({ id: 15, label: 'Immobilisation', total: 500,
            categorie: 'Category 15: Investments', date: '2025-12-31' }),
    brute({ id: 4, label: 'Gasoil camions', categorie: 'Company owned cars',
            scope: 'SCOPE_1', total: 3_986, date: '2026-01-31' })
  ];

  const TUNISIE: PerimetreOrganisation = {
    entityId: 1, etablissements: ['MISFAT I'], societeUnique: false
  };

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MesuresServeurComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  /** Monte le panneau et lui sert la réponse de la base. */
  function monter(config: Partial<MesuresServeurComponent>): MesuresServeurComponent {
    const fixture = TestBed.createComponent(MesuresServeurComponent);
    fixtures.push(fixture);

    Object.assign(fixture.componentInstance, config);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (const requete of httpMock.match(() => true)) requete.flush(REPONSE);
    fixture.detectChanges();

    return fixture.componentInstance;
  }

  describe('rattachement par le numéro de catégorie GHG', () => {

    it('rend les mesures que la base porte pour l\'écran', () => {
      // Le cas signalé : le bilan annonce 28 346 t, l'écran affichait le vide.
      const panneau = monter({ numeroGhg: 8, exercice: 2025, organisation: TUNISIE });

      expect(panneau.mesures).toHaveLength(2);
      expect(panneau.totalTonnes).toBeCloseTo(28_346.05, 1);
    });

    it('n\'emprunte pas les mesures d\'une catégorie voisine', () => {
      const panneau = monter({ numeroGhg: 8, exercice: 2025, organisation: TUNISIE });

      expect(panneau.mesures.map(m => m.libelle)).not.toContain('Achats consommables');
    });

    it('ne confond pas la catégorie 1 avec la 15', () => {
      // Sans frontière après le numéro, « Category 1 » capterait « Category 15 »
      // et les investissements grossiraient les biens et services achetés.
      const panneau = monter({ numeroGhg: 1, exercice: 2025, organisation: TUNISIE });

      expect(panneau.mesures).toHaveLength(1);
      expect(panneau.mesures[0].libelle).toBe('Achats consommables');
    });

    it('retrouve la catégorie 15 par son propre numéro', () => {
      const panneau = monter({ numeroGhg: 15, exercice: 2025, organisation: TUNISIE });

      expect(panneau.mesures.map(m => m.libelle)).toEqual(['Immobilisation']);
    });
  });

  describe('rattachement par libellé, pour les Scopes 1 et 2', () => {

    it('reconnaît un intitulé sans numéro GHG', () => {
      const panneau = monter({
        categories: ['Combustion des véhicules', 'Company owned cars'],
        exercice: 2026, organisation: TUNISIE
      });

      expect(panneau.mesures.map(m => m.libelle)).toEqual(['Gasoil camions']);
    });

    it('rapproche sans accents ni ponctuation', () => {
      const panneau = monter({
        categories: ['company-owned CARS'], exercice: 2026, organisation: TUNISIE
      });

      expect(panneau.mesures).toHaveLength(1);
    });
  });

  describe('cloisonnement', () => {

    it('écarte les mesures d\'un autre exercice', () => {
      const panneau = monter({ numeroGhg: 8, exercice: 2026, organisation: TUNISIE });

      expect(panneau.mesures).toEqual([]);
    });

    it('écarte les mesures d\'une autre société', () => {
      const maroc: PerimetreOrganisation = {
        entityId: 2, etablissements: [], societeUnique: false
      };
      const panneau = monter({ numeroGhg: 8, exercice: 2025, organisation: maroc });

      expect(panneau.mesures).toEqual([]);
    });
  });

  describe('règle de périmètre, prise isolément', () => {

    const mesure = (p: Partial<MesureServeur>): MesureServeur => ({
      id: 1, libelle: 'X', categorie: 'X', scope: 'SCOPE_3', quantite: 1,
      unite: 'TND', emissionKg: 10, date: '2025-12-31', filialeId: 1,
      origine: 'SAISIE', baseAppliquee: 'X', ...p
    });

    it('retient tout quand aucun exercice n\'est demandé', () => {
      expect(mesureDuPerimetre(mesure({}), null, TUNISIE)).toBe(true);
    });

    it('écarte une mesure sans date dès qu\'un exercice est demandé', () => {
      // La rattacher d'office lui prêterait une année qu'elle n'a pas.
      expect(mesureDuPerimetre(mesure({ date: '' }), 2025, TUNISIE)).toBe(false);
    });

    it('ne rattache une mesure sans filiale que si le groupe n\'en a qu\'une', () => {
      const seule: PerimetreOrganisation = {
        entityId: 1, etablissements: [], societeUnique: true
      };

      expect(mesureDuPerimetre(mesure({ filialeId: null }), 2025, TUNISIE)).toBe(false);
      expect(mesureDuPerimetre(mesure({ filialeId: null }), 2025, seule)).toBe(true);
    });
  });
});
