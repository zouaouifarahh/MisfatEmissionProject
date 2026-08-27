import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ReferentialService, FacteurDetaille, FactorRow } from '../services/referential.service';
import { apparier } from './appariement-referentiel';
import { posteDepuisIntitule, scopeDuPoste, posteParId } from './nomenclature-scopes';

/**
 * Banc référentiel : un facteur ajouté aujourd'hui doit compter dès aujourd'hui.
 *
 * <p>Le référentiel carbone n'est pas figé. L'ADEME publie, l'EPA révise, et
 * MISFAT saisit ses propres facteurs pour les postes que personne ne documente.
 * Chaque ajout pose deux questions auxquelles ce banc répond :</p>
 *
 * <ul>
 *   <li>le facteur atterrit-il dans la catégorie GHG qu'on lui a désignée, ou
 *       se perd-il dans une catégorie voisine ?</li>
 *   <li>une source rattachée à ce couple scope + catégorie remonte-t-elle
 *       immédiatement dans les écrans métier et les recalculs, ou faut-il
 *       purger un cache pour la voir apparaître ?</li>
 * </ul>
 *
 * <p>Un facteur qui se range mal fausse un scope entier sans rien signaler :
 * le total reste plausible, seule sa ventilation est fausse. C'est la panne la
 * plus coûteuse à découvrir tard, d'où ce banc.</p>
 */
describe('Référentiel — arrivée d\'un facteur et d\'une source', () => {

  const BASE = 'http://localhost:8082/api/v1';

  let service: ReferentialService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ReferentialService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Facteur brut tel que l'API le renvoie, référence et catégorie imbriquées. */
  const facteurBrut = (over: {
    id: number; code: string; type: string;
    categorie: string; scope: string; valeur: number;
    unite?: string; source?: string;
  }) => ({
    id: over.id,
    factorValue: over.valeur,
    unit: over.unite ?? 'kgCO2e/unit',
    dataType: 'PHYSICAL',
    currency: null,
    databaseSource: over.source ?? 'MISFAT_INTERNE',
    referenceYear: 2026,
    validityLabel: 'Current',
    carbonReference: {
      id: over.id * 10,
      referenceCode: over.code,
      typeName: over.type,
      category: { id: 1, name: over.categorie, scope: { code: over.scope } }
    }
  });

  // ------------------------------------------------------------------
  // 1. Le facteur atterrit dans sa catégorie GHG
  // ------------------------------------------------------------------

  describe('rangement du facteur dans sa catégorie GHG', () => {

    it('rend un facteur nouvellement créé sous la catégorie qu\'il déclare', () => {
      let recus: FacteurDetaille[] = [];
      service.getFactorsByCategory(/^Category 6:/i).subscribe(f => (recus = f));

      http.expectOne(`${BASE}/emission-factors`).flush([
        facteurBrut({ id: 1, code: 'MS3C6AIR', type: 'Air travel, long haul',
                      categorie: 'Category 6: Business travel', scope: 'SCOPE_3', valeur: 0.18 })
      ]);

      expect(recus).toHaveLength(1);
      expect(recus[0].referenceCode).toBe('MS3C6AIR');
      expect(recus[0].categoryName).toBe('Category 6: Business travel');
    });

    it('lui transmet le scope porté par sa catégorie', () => {
      // Sans le scope, la ligne se valorise mais ne s'impute nulle part : elle
      // disparaît de la ventilation tout en gonflant le total.
      let recus: FacteurDetaille[] = [];
      service.getFactorsByCategory(/^Category 6:/i).subscribe(f => (recus = f));

      http.expectOne(`${BASE}/emission-factors`).flush([
        facteurBrut({ id: 1, code: 'MS3C6AIR', type: 'Air travel',
                      categorie: 'Category 6: Business travel', scope: 'SCOPE_3', valeur: 0.18 })
      ]);

      expect(recus[0].scopeCode).toBe('SCOPE_3');
    });

    it('ne le fait pas déborder sur une catégorie voisine', () => {
      // « Category 1 » non ancré capturait Category 10 à 15 : le Scope 3 amont
      // se retrouvait chargé de postes aval sans qu'aucun total ne bouge.
      let recus: FacteurDetaille[] = [];
      service.getFactorsByCategory(/^Category 1:/i).subscribe(f => (recus = f));

      http.expectOne(`${BASE}/emission-factors`).flush([
        facteurBrut({ id: 1, code: 'MS3C1AAA', type: 'Purchased goods',
                      categorie: 'Category 1: Purchased goods and services',
                      scope: 'SCOPE_3', valeur: 0.42 }),
        facteurBrut({ id: 2, code: 'MS3C12EOL', type: 'End of life',
                      categorie: 'Category 12: End-of-life treatment',
                      scope: 'SCOPE_3', valeur: 0.05 }),
        facteurBrut({ id: 3, code: 'MS3C15INV', type: 'Investments',
                      categorie: 'Category 15: Investments', scope: 'SCOPE_3', valeur: 0.01 })
      ]);

      expect(recus.map(f => f.referenceCode)).toEqual(['MS3C1AAA']);
    });

    it('écarte un facteur privé de catégorie plutôt que de l\'imputer au hasard', () => {
      // Dix-huit facteurs sont dans ce cas en base. Les rattacher d'office à la
      // première catégorie venue rendrait leur erreur invisible.
      let recus: FacteurDetaille[] = [];
      service.getFactorsByCategory(/^Category 6:/i).subscribe(f => (recus = f));

      http.expectOne(`${BASE}/emission-factors`).flush([
        { id: 9, factorValue: 1.2, unit: 'kg', dataType: 'PHYSICAL',
          currency: null, databaseSource: 'EPA', referenceYear: 2024,
          carbonReference: { id: 90, referenceCode: 'MSORPH', typeName: 'Orpheline',
                             category: null } }
      ]);

      expect(recus).toEqual([]);
    });

    it('range le facteur manuel dans la même catégorie que les facteurs importés', () => {
      // Un facteur saisi par MISFAT doit se comporter comme les autres : c'est
      // sa provenance qui le distingue, pas son rattachement.
      let recus: FacteurDetaille[] = [];
      service.getFactorsByCategory(/^Category 6:/i).subscribe(f => (recus = f));

      http.expectOne(`${BASE}/emission-factors`).flush([
        facteurBrut({ id: 1, code: 'MS3C6EPA', type: 'Air travel',
                      categorie: 'Category 6: Business travel', scope: 'SCOPE_3',
                      valeur: 0.18, source: 'EPA-ORD 2024' }),
        facteurBrut({ id: 2, code: 'MS3C6MIS', type: 'Navette inter-sites',
                      categorie: 'Category 6: Business travel', scope: 'SCOPE_3',
                      valeur: 0.11, source: 'MISFAT_INTERNE' })
      ]);

      expect(recus.map(f => f.referenceCode)).toEqual(['MS3C6EPA', 'MS3C6MIS']);
      expect(recus.map(f => f.categoryName))
        .toEqual(['Category 6: Business travel', 'Category 6: Business travel']);
    });
  });

  // ------------------------------------------------------------------
  // 2. La source rattachée remonte dans les vues métier
  // ------------------------------------------------------------------

  describe('remontée de la source dans les vues métier', () => {

    it('rattache la catégorie GHG à l\'écran de saisie correspondant', () => {
      // C'est ce rattachement qui décide sur quel écran la source apparaîtra.
      expect(posteDepuisIntitule('Category 6: Business travel')).toBe('voyages-affaires');
      expect(posteDepuisIntitule('Category 1: Purchased goods and services'))
        .toBe('biens-services');
      expect(posteDepuisIntitule('Category 12: End-of-life treatment'))
        .toBe('fin-de-vie-produits');
    });

    it('rend au poste le scope de sa catégorie', () => {
      expect(scopeDuPoste('voyages-affaires')).toBe('SCOPE_3');
      expect(scopeDuPoste('combustion-etablissements')).toBe('SCOPE_1');
      expect(scopeDuPoste('electricite-achetee')).toBe('SCOPE_2');
    });

    it('compte un poste dépourvu d\'écran de saisie plutôt que de l\'omettre', () => {
      // Les procédés industriels n'ont pas d'écran. Les taire ferait passer une
      // absence de collecte pour une émission nulle.
      const poste = posteParId('process-industriels');

      expect(poste?.collecte).toBe(false);
      expect(scopeDuPoste('process-industriels')).toBe('SCOPE_1');
    });

    it('aplatit la source sous son scope et sa catégorie pour le tableau', () => {
      let lignes: any[] = [];
      service.getFactorRows().subscribe(l => (lignes = l));

      http.expectOne(`${BASE}/referential/categories-with-sources`).flush([
        {
          categoryId: 6, categoryName: 'Category 6: Business travel',
          scopeCode: 'SCOPE_3', scopeLabel: 'Scope 3',
          sources: [{
            carbonReferenceId: 61, referenceCode: 'MS3C6NAV',
            typeName: 'Navette inter-sites', unit: 'km',
            defaultFactorId: 900, defaultFactorValue: 0.11, dataType: 'PHYSICAL',
            currency: null, databaseSource: 'MISFAT_INTERNE', referenceYear: 2026,
            uncertaintyPercent: null, validityLabel: 'Current'
          }]
        }
      ]);

      expect(lignes).toHaveLength(1);
      expect(lignes[0].scopeCode).toBe('SCOPE_3');
      expect(lignes[0].categoryName).toBe('Category 6: Business travel');
    });

    it('signale la saisie manuelle sans la traiter à part', () => {
      let lignes: any[] = [];
      service.getFactorRows().subscribe(l => (lignes = l));

      http.expectOne(`${BASE}/referential/categories-with-sources`).flush([
        {
          categoryId: 6, categoryName: 'Category 6: Business travel',
          scopeCode: 'SCOPE_3', scopeLabel: 'Scope 3',
          sources: [
            { carbonReferenceId: 61, referenceCode: 'MS3C6NAV', typeName: 'Navette',
              unit: 'km', defaultFactorId: 900, defaultFactorValue: 0.11,
              dataType: 'PHYSICAL', currency: null, databaseSource: 'MISFAT_INTERNE',
              referenceYear: 2026, uncertaintyPercent: null, validityLabel: 'Current' },
            { carbonReferenceId: 62, referenceCode: 'MS3C6AIR', typeName: 'Air travel',
              unit: 'km', defaultFactorId: 901, defaultFactorValue: 0.18,
              dataType: 'PHYSICAL', currency: null, databaseSource: 'EPA-ORD 2024',
              referenceYear: 2024, uncertaintyPercent: null, validityLabel: 'Current' }
          ]
        }
      ]);

      expect(lignes.map(l => l.origin)).toEqual(['MANUAL_ENTRY', 'EXCEL_IMPORT']);
      // Provenances distinctes, même rattachement : la ventilation ne dépend
      // pas de qui a saisi le facteur.
      expect(lignes.every(l => l.scopeCode === 'SCOPE_3')).toBe(true);
    });

    it('donne une ligne par facteur, non par source', () => {
      // Le tableau n'en montrait qu'une par référence, portant le seul facteur
      // par défaut : ajouter un second facteur à une source existante ne
      // faisait apparaître aucune ligne, et l'ancienne valeur restait seule à
      // l'écran. L'ajout paraissait écraser l'existant.
      let lignes: FactorRow[] = [];
      service.getFactorRows().subscribe(r => (lignes = r));

      http.expectOne(`${BASE}/referential/categories-with-sources`).flush([
        {
          categoryId: 1, categoryName: 'Combustion dans les établissements',
          scopeCode: 'SCOPE_1', scopeLabel: 'Scope 1',
          sources: [{
            carbonReferenceId: 7, referenceCode: 'MS1GZ', typeName: 'Gazole/Fioul',
            unit: 'L', defaultFactorId: 91, defaultFactorValue: 1.5,
            dataType: 'PHYSIQUE', currency: null, databaseSource: 'MISFAT_INTERNE',
            referenceYear: 2026, uncertaintyPercent: null, validityLabel: null,
            variantes: [
              { factorId: 91, factorValue: 1.5, unit: 'L', dataType: 'PHYSIQUE',
                currency: null, databaseSource: 'MISFAT_INTERNE', referenceYear: 2026,
                uncertaintyPercent: null, validityLabel: null },
              { factorId: 42, factorValue: 1.2, unit: 'L', dataType: 'PHYSIQUE',
                currency: null, databaseSource: 'IPCC 2007', referenceYear: 2024,
                uncertaintyPercent: null, validityLabel: 'Current' }
            ]
          }]
        }
      ]);

      expect(lignes).toHaveLength(2);
      expect(lignes.map(l => l.defaultFactorId)).toEqual([91, 42]);
      expect(lignes.map(l => l.defaultFactorValue)).toEqual([1.5, 1.2]);

      // Chaque ligne porte SA provenance : sans cela, modifier l'une
      // reviendrait à modifier l'autre.
      expect(lignes.map(l => l.databaseSource)).toEqual(['MISFAT_INTERNE', 'IPCC 2007']);
      expect(lignes.map(l => l.origin)).toEqual(['MANUAL_ENTRY', 'EXCEL_IMPORT']);

      // Le rattachement, lui, est commun aux deux.
      expect(lignes.every(l => l.referenceCode === 'MS1GZ')).toBe(true);
      expect(lignes.every(l => l.categoryName === 'Combustion dans les établissements')).toBe(true);
    });

    it('retombe sur le facteur par défaut quand le serveur ne déclare pas de variante', () => {
      // Une réponse servie par une version antérieure du serveur ne porte pas
      // la liste : le tableau doit rester peuplé plutôt que de se vider.
      let lignes: FactorRow[] = [];
      service.getFactorRows().subscribe(r => (lignes = r));

      http.expectOne(`${BASE}/referential/categories-with-sources`).flush([
        {
          categoryId: 1, categoryName: 'Combustion dans les établissements',
          scopeCode: 'SCOPE_1', scopeLabel: 'Scope 1',
          sources: [{
            carbonReferenceId: 7, referenceCode: 'MS1GZ', typeName: 'Gazole/Fioul',
            unit: 'L', defaultFactorId: 42, defaultFactorValue: 1.2,
            dataType: 'PHYSIQUE', currency: null, databaseSource: 'IPCC 2007',
            referenceYear: 2024, uncertaintyPercent: null, validityLabel: 'Current'
          }]
        }
      ]);

      expect(lignes).toHaveLength(1);
      expect(lignes[0].defaultFactorId).toBe(42);
      expect(lignes[0].defaultFactorValue).toBe(1.2);
    });

    it('imbrique la référence à la création, faute de quoi le facteur est refusé', () => {
      service.createFactor({
        carbonReferenceId: 61, factorValue: 0.11, unit: 'km', dataType: 'PHYSICAL'
      }).subscribe();

      const requete = http.expectOne(`${BASE}/emission-factors`);

      expect(requete.request.method).toBe('POST');
      expect(requete.request.body.carbonReference).toEqual({ id: 61 });
      expect(requete.request.body.carbonReferenceId).toBeUndefined();
      expect(requete.request.body.databaseSource).toBe('MISFAT_INTERNE');

      requete.flush({});
    });
  });

  // ------------------------------------------------------------------
  // 3. La source est prise en compte dans les recalculs, sans purge
  // ------------------------------------------------------------------

  describe('prise en compte immédiate dans les recalculs', () => {

    /** Référentiel tel qu'un écran le détient après chargement. */
    const referentiel = (): FacteurDetaille[] => ([
      { id: 1, referenceCode: 'MS3C6AIR', typeName: 'Air travel, long haul',
        categoryName: 'Category 6: Business travel', scopeCode: 'SCOPE_3',
        factorValue: 0.18, unit: 'kgCO2e/km', dataType: 'PHYSICAL', currency: null,
        databaseSource: 'EPA-ORD 2024', referenceYear: 2024, validityLabel: 'Current' },
      { id: 2, referenceCode: 'MS3C6NAV', typeName: 'Navette inter-sites',
        categoryName: 'Category 6: Business travel', scopeCode: 'SCOPE_3',
        factorValue: 0.11, unit: 'kgCO2e/km', dataType: 'PHYSICAL', currency: null,
        databaseSource: 'MISFAT_INTERNE', referenceYear: 2026, validityLabel: 'Current' }
    ]);

    it('rattache une ligne à la source du jour dès sa référence connue', () => {
      // Aucune migration, aucun marqueur : la liste chargée suffit.
      const trouve = apparier(referentiel(), { referenceCarbone: 'MS3C6NAV' });

      expect(trouve?.rapprochement).toBe('REFERENCE');
      expect(trouve?.facteur.factorValue).toBe(0.11);
    });

    it('valorise avec le facteur du référentiel, non avec un repli générique', () => {
      // Le repli générique posait 0,31 ou 0,38 là où le référentiel portait la
      // valeur exacte : le total restait crédible et pourtant faux.
      const trouve = apparier(referentiel(), { referenceCarbone: 'MS3C6NAV' });
      const quantite = 1_200; // km

      expect(quantite * (trouve?.facteur.factorValue ?? 0)).toBeCloseTo(132, 6);
    });

    it('rattache par la catégorie une ligne dépourvue de référence', () => {
      // Une source attachée à un couple scope + catégorie doit remonter même
      // quand la ligne saisie ne porte que l'intitulé de sa famille.
      const trouve = apparier(referentiel(), { categorie: 'Navette inter-sites' });

      expect(trouve?.rapprochement).toBe('CATEGORIE');
      expect(trouve?.facteur.referenceCode).toBe('MS3C6NAV');
    });

    it('signale la ligne qu\'aucun degré ne rattache au lieu de la valoriser', () => {
      // Mieux vaut une anomalie visible qu'un chiffre inventé.
      expect(apparier(referentiel(), { referenceCarbone: 'MS9INCONNU' })).toBeNull();
    });

    it('reprend la nouvelle valeur d\'un facteur révisé sans redémarrage', () => {
      // L'ADEME révise, MISFAT corrige : la ligne suit la dernière valeur
      // publiée, sans qu'aucun cache ne la retienne.
      const revise = referentiel();
      revise[1] = { ...revise[1], factorValue: 0.09 };

      expect(apparier(revise, { referenceCarbone: 'MS3C6NAV' })?.facteur.factorValue)
        .toBe(0.09);
    });

    it('achemine la source jusqu\'à l\'écran métier de sa catégorie', () => {
      // Chaîne complète : référence → facteur → catégorie GHG → écran → scope.
      const trouve = apparier(referentiel(), { referenceCarbone: 'MS3C6NAV' });
      const ecran = posteDepuisIntitule(trouve!.facteur.categoryName);

      expect(ecran).toBe('voyages-affaires');
      expect(scopeDuPoste(ecran!)).toBe(trouve!.facteur.scopeCode);
    });
  });
});
