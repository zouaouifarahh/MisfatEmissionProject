import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ReferentielCarboneComponent } from './referentiel-carbone';

/**
 * Écran des sources d'émission : unités monétaires et nomenclature complète.
 *
 * <p>La liste des unités n'offrait que des grandeurs physiques — kilogrammes,
 * litres, kilowattheures. Or les catégories monétaires du Scope 3 — achats,
 * biens d'équipement, investissements — se valorisent à la dépense : une source
 * d'achats était donc contrainte au kilogramme, ou créée avec une unité qui ne
 * la documente pas.</p>
 *
 * <p>Le filtre du tableau, lui, ne proposait que les catégories déjà pourvues.
 * Rechercher « Investissements » était impossible tant qu'aucune source n'y
 * figurait — alors que c'est précisément ce qu'on veut vérifier avant d'en
 * créer une.</p>
 */
describe('Sources d\'émission — unités et catégories', () => {

  const SOURCES = [
    {
      id: 1, referenceCode: 'MS1COV', scope: 'SCOPE_1',
      category: 'Combustion des véhicules', sourceName: 'Diesel', defaultUnit: 'L'
    },
    {
      id: 2, referenceCode: 'MS3C1CP', scope: 'SCOPE_3',
      category: 'Biens et services achetés', sourceName: 'Achats', defaultUnit: 'TND'
    }
  ];

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReferentielCarboneComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  function monter(): ReferentielCarboneComponent {
    const fixture = TestBed.createComponent(ReferentielCarboneComponent);
    fixtures.push(fixture);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (const requete of httpMock.match(() => true)) requete.flush(SOURCES);
    fixture.detectChanges();

    return fixture.componentInstance;
  }

  describe('unités monétaires', () => {

    it('propose les devises quand la source se compte en dépense', () => {
      const ecran = monter();
      ecran.nouvelleSource.typeUnite = 'MONETAIRE';
      // La liste est recomposée au changement, non dérivée à chaque lecture :
      // un accesseur rendrait un tableau neuf à chaque cycle de rendu, et la
      // boucle du gabarit le verrait changer sans fin.
      ecran.onTypeUniteChange();

      const valeurs = ecran.unitesDuType.map(u => u.valeur);
      expect(valeurs).toContain('TND');
      expect(valeurs).toContain('EUR');
      expect(valeurs).toContain('USD');
    });

    it('propose les grandeurs quand la source se compte en quantité', () => {
      const ecran = monter();
      ecran.nouvelleSource.typeUnite = 'PHYSIQUE';

      const valeurs = ecran.unitesDuType.map(u => u.valeur);
      expect(valeurs).toContain('kg');
      expect(valeurs).toContain('kWh');
      expect(valeurs).not.toContain('TND');
    });

    it('accorde l\'unité quand la nature change', () => {
      // Basculer en monetaire sans changer l'unite laisserait « kg » sur une
      // source qui se compte en dinars.
      const ecran = monter();
      ecran.nouvelleSource.defaultUnit = 'kg';
      ecran.nouvelleSource.typeUnite = 'MONETAIRE';

      ecran.onTypeUniteChange();

      expect(ecran.nouvelleSource.defaultUnit).toBe('TND');
    });

    it('laisse l\'unité en place quand elle convient déjà', () => {
      const ecran = monter();
      ecran.nouvelleSource.typeUnite = 'MONETAIRE';
      ecran.nouvelleSource.defaultUnit = 'EUR';

      ecran.onTypeUniteChange();

      expect(ecran.nouvelleSource.defaultUnit).toBe('EUR');
    });

    it('retrouve la nature d\'une source enregistrée en dinars', () => {
      // La base ne stocke pas la nature : l'unite la porte. Sans cette
      // deduction, rouvrir une source en TND afficherait les grandeurs
      // physiques et son unite paraitrait vide.
      const ecran = monter();
      ecran.editerSource(SOURCES[1]);

      expect(ecran.nouvelleSource.typeUnite).toBe('MONETAIRE');
      expect(ecran.nouvelleSource.defaultUnit).toBe('TND');
    });
  });

  describe('nomenclature du Scope 3', () => {

    it('propose les quinze catégories au formulaire', () => {
      const ecran = monter();
      ecran.changerOngletScope('SCOPE_3');

      expect(ecran.categoriesDisponibles).toHaveLength(15);
      expect(ecran.categoriesDisponibles.map(c => c.nom)).toContain('Investissements');
      expect(ecran.categoriesDisponibles.map(c => c.nom)).toContain('Actifs loués en aval');
      expect(ecran.categoriesDisponibles.map(c => c.nom)).toContain('Franchises');
    });

    it('propose les quinze au filtre du tableau, pourvues ou non', () => {
      // Une seule source Scope 3 est enregistree : le filtre proposait donc
      // une seule categorie, et les quatorze autres restaient hors de portee.
      const ecran = monter();
      ecran.changerOngletScope('SCOPE_3');

      expect(ecran.categoriesTableau.length).toBeGreaterThanOrEqual(15);
      expect(ecran.categoriesTableau).toContain('Investissements');
      expect(ecran.categoriesTableau).toContain("Biens d'équipement");
    });

    it('garde l\'ordre de la nomenclature, de la première à la quinzième', () => {
      const ecran = monter();
      ecran.changerOngletScope('SCOPE_3');

      expect(ecran.categoriesTableau[0]).toBe('Biens et services achetés');
      expect(ecran.categoriesTableau[14]).toBe('Investissements');
    });

    it('n\'écarte pas une catégorie que la base porte hors nomenclature', () => {
      const ecran = monter();
      ecran.sourcesToutes = [
        ...SOURCES,
        { id: 3, referenceCode: 'X', scope: 'SCOPE_3', category: 'Poste maison',
          sourceName: 'X', defaultUnit: 'kg' }
      ];
      ecran.changerOngletScope('SCOPE_3');

      expect(ecran.categoriesTableau).toContain('Poste maison');
    });
  });
});
