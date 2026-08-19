import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  DispatchStore, REFERENCES_VENTILATION, DERIVATIONS_MONETAIRES, PRIX_KWH_TND
} from './dispatch-store';

/**
 * Référence attribuée aux lignes de ventilation comptable.
 *
 * <p>Deux manques laissaient ces lignes sans référence. Le référentiel ne
 * documente aucun facteur monétaire pour l'électricité, la combustion ou les
 * réfrigérants — seulement des facteurs au litre ou au kilowattheure — de sorte
 * qu'un ratio anonyme leur était appliqué. Et là où il en documente plusieurs
 * dizaines, la catégorie 1 en comptant trente-huit, le facteur était retenu par
 * son année de référence : un achat de matières premières pouvait être valorisé
 * par le facteur du cuivre laminé.</p>
 *
 * <p>Ces bancs tiennent les deux réponses : une référence nommée pour lever le
 * hasard, une dérivation explicite pour l'électricité.</p>
 */
describe('Ventilation — référence du facteur retenu', () => {

  /** Facteur brut, tel que /emission-factors le sert. */
  const brut = (
    referenceCode: string, typeName: string, categorie: string,
    factorValue: number, dataType: string, unit: string, annee = 2024
  ) => ({
    id: referenceCode.length, factorValue, unit, dataType,
    currency: dataType === 'MONETAIRE' ? 'TND' : null,
    databaseSource: 'Base carbone interne', referenceYear: annee, validityLabel: null,
    carbonReference: {
      referenceCode, typeName,
      category: { name: categorie, scope: { code: 'SCOPE_3' } }
    }
  });

  /**
   * Référentiel réduit, fidèle à la base : trente-huit facteurs monétaires en
   * catégorie 1 se ramènent ici à trois, dont celui que la table désigne.
   */
  const FACTEURS = [
    brut('MS3C1CP', 'All Other Converted Paper Product Manufacturing',
         'Category 1: PG&S - GCP', 0.1010948036, 'MONETAIRE', 'TND', 2022),
    brut('MS3C1CR', 'Copper Rolling, Drawing, Extruding, and Alloying',
         'Category 1: PG&S - GCP', 0.1011321683, 'MONETAIRE', 'TND', 2024),
    brut('MS3C1ZZ', 'Autre poste de la catégorie 1',
         'Category 1: PG&S - GCP', 0.9, 'MONETAIRE', 'TND', 2025),
    brut('MS2ENEC', 'Electricity consumption', 'Energy', 0.4212307391, 'PHYSIQUE', 'kWh'),
    brut('MS2ENDI', 'Diesel', 'Energy', 3.2944729635, 'PHYSIQUE', 'L')
  ];

  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    magasin = TestBed.inject(DispatchStore);
  });

  /** Charge le référentiel dans le magasin, comme le fait l'écran d'import. */
  const chargerReferentiel = () => {
    magasin.chargerFacteurs().subscribe();
    TestBed.inject(HttpTestingController).match(() => true)
      .forEach(r => r.flush(FACTEURS));
  };

  describe('référence nommée', () => {

    it('retient le facteur désigné plutôt que le millésime le plus récent', () => {
      chargerReferentiel();
      const facteur = magasin.facteurPour('biens-services');

      // MS3C1ZZ est plus récent (2025) et l'emporterait au tri par année ; la
      // table désigne le papier transformé, qui documente les achats de MISFAT.
      expect(facteur.reference).toBe('MS3C1CP');
      expect(facteur.valeur).toBeCloseTo(0.1010948036, 10);
      expect(facteur.origine).toBe('MS SQL BDD');
    });

    it('déclare la référence des achats dans la table', () => {
      // Le choix doit rester lisible et discutable dans le code, non enfoui
      // dans un tri : c'est une décision métier, pas une conséquence.
      expect(REFERENCES_VENTILATION['biens-services']).toBe('MS3C1CP');
    });

    it('retombe sur le tri par année quand aucune référence n\'est nommée', () => {
      chargerReferentiel();

      // Les investissements ne sont pas dans la table : la règle d'origine
      // s'applique, sans facteur monétaire en catégorie 15 dans ce référentiel.
      const facteur = magasin.facteurPour('investissements');
      expect(facteur.origine).toBe('ADEME Fallback');
      expect(facteur.reference).toBe('');
    });
  });

  describe('ratio déduit d\'un facteur physique', () => {

    it('nomme la référence source de l\'électricité', () => {
      chargerReferentiel();
      const facteur = magasin.facteurPour('electricite-achetee');

      // La colonne affichait un tiret : le référentiel ne documente
      // l'électricité qu'au kilowattheure, jamais au dinar.
      expect(facteur.reference).toBe('MS2ENEC');
    });

    it('calcule le ratio par division, non par un littéral', () => {
      chargerReferentiel();
      const facteur = magasin.facteurPour('electricite-achetee');

      // 0,4212307391 kgCO₂e/kWh ÷ 0,291 TND/kWh.
      expect(facteur.valeur).toBeCloseTo(0.4212307391 / PRIX_KWH_TND, 10);
      expect(facteur.unite).toBe('TND');
    });

    it('reste annoncé comme approximation', () => {
      chargerReferentiel();
      const facteur = magasin.facteurPour('electricite-achetee');

      // Diviser par un prix moyen ne fait pas d'un ratio un relevé : l'origine
      // doit continuer de le dire, sans quoi la référence nommée ferait croire à
      // un facteur monétaire documenté.
      expect(facteur.origine).toBe('ADEME Fallback');
    });

    it('explique la division dans son libellé', () => {
      chargerReferentiel();
      const facteur = magasin.facteurPour('electricite-achetee');

      expect(facteur.libelle).toContain('Electricity consumption');
      expect(facteur.libelle).toContain('0.4212');
      expect(facteur.libelle).toContain('0.291');
      expect(facteur.libelle).toContain('TND/kWh');
    });

    it('cite la base documentaire de la référence source', () => {
      chargerReferentiel();
      expect(magasin.facteurPour('electricite-achetee').base).toBe('Base carbone interne');
    });

    it('déclare la dérivation dans la table', () => {
      const derivation = DERIVATIONS_MONETAIRES['electricite-achetee'];
      expect(derivation?.code).toBe('MS2ENEC');
      expect(derivation?.prix).toBeCloseTo(PRIX_KWH_TND, 10);
    });

    it('retombe sur le ratio anonyme si la référence source manque', () => {
      // Référentiel sans MS2ENEC : la division est impossible, et inventer une
      // référence serait pire qu'un tiret.
      magasin.chargerFacteurs().subscribe();
      TestBed.inject(HttpTestingController).match(() => true)
        .forEach(r => r.flush([FACTEURS[0]]));

      const facteur = magasin.facteurPour('electricite-achetee');
      expect(facteur.reference).toBe('');
      expect(facteur.origine).toBe('ADEME Fallback');
    });
  });

  describe('destinations que le référentiel ne documente pas en monétaire', () => {

    it('laisse la référence vide plutôt que d\'en emprunter une', () => {
      chargerReferentiel();

      // La combustion n'a que des facteurs au litre. Lui attribuer MS2ENDI
      // laisserait croire qu'un facteur de 3,29 kgCO₂e/L a été appliqué à des
      // dinars — ce qui est faux, et fausserait la vérification du rapport.
      for (const ecran of ['combustion-etablissements', 'combustion-vehicules',
                           'emissions-refrigerants', 'dechets'] as const) {
        const facteur = magasin.facteurPour(ecran);
        expect(facteur.reference).toBe('');
        expect(facteur.origine).toBe('ADEME Fallback');
      }
    });
  });
});
