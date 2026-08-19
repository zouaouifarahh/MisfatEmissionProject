import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DispatchStore } from './dispatch-store';
import { LigneDispatchee } from './dispatch-excel';

/**
 * Import : traduction des libellés et routage nominal.
 *
 * <p>Le libellé français d'une ligne comptable désigne un facteur du
 * référentiel anglais, ce qu'aucune comparaison directe ne permettait : c'est
 * la table de traduction qui fait ce pont.</p>
 *
 * <p>Le second volet garde le routage d'origine de toute redirection : chaque
 * ligne porte une destination et une seule, ce qui exclut qu'une donnée de
 * gazole pèse à la fois au Scope 1 et dans les achats.</p>
 */
describe('Ventilation — traduction et routage', () => {

  const brut = (
    referenceCode: string, typeName: string, categorie: string,
    factorValue: number, dataType = 'MONETAIRE'
  ) => ({
    id: referenceCode.length, factorValue, unit: 'TND', dataType,
    currency: 'TND', databaseSource: 'Base carbone interne',
    referenceYear: 2024, validityLabel: null,
    carbonReference: {
      referenceCode, typeName,
      category: { name: categorie, scope: { code: 'SCOPE_3' } }
    }
  });

  const FACTEURS = [
    brut('MS3C1DI', 'market for diesel', 'Category 1: PG&S - GCP', 0.4),
    brut('MS3C1M', 'Metals', 'Category 1: PG&S - GCP', 0.0821),
    brut('MS3C1CP', 'All Other Converted Paper Product Manufacturing',
         'Category 1: PG&S - GCP', 0.1011)
  ];

  const ligneDe = (sur: Partial<LigneDispatchee> = {}): LigneDispatchee => ({
    cle: 'BG#1', feuille: 'BG MISFAT 2025', ligneSource: 2,
    mainAccount: '602100', nom: 'Achats matières combustibles Gasoil',
    categorieCarboneTexte: '0', categorieAbsente: true, reference: '',
    quantite: 100_000, colonneValeur: 'Débit', colonnesEcartees: [],
    ecran: 'combustion-etablissements', scope: 'SCOPE_1',
    motif: 'Compte 602100', origineRoutage: 'compte', motCle: '602100',
    exclu: false, ...sur
  });

  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    magasin = TestBed.inject(DispatchStore);

    magasin.chargerFacteurs().subscribe();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(FACTEURS));
  });

  describe('traduction du libellé', () => {

    it('rattache « Achats matières combustibles Gasoil » à market for diesel', () => {
      const [ligne] = magasin.valoriser([ligneDe()]);

      expect(ligne.referenceCarbone).toBe('MS3C1DI');
      expect(ligne.facteur).toBeCloseTo(0.4, 10);
      expect(ligne.origineFacteur).toBe('MS SQL BDD');
    });

    it('rattache « Achats matières premières » aux métaux', () => {
      const [ligne] = magasin.valoriser([ligneDe({
        nom: 'Achats Matières.Premières.Local', mainAccount: '601000',
        ecran: 'biens-services', scope: 'SCOPE_3'
      })]);

      expect(ligne.referenceCarbone).toBe('MS3C1M');
      expect(ligne.facteur).toBeCloseTo(0.0821, 10);
    });

    it('valorise l\'émission avec le facteur traduit', () => {
      const [ligne] = magasin.valoriser([ligneDe({ quantite: 1_000 })]);

      // 1 000 TND × 0,4 kgCO₂e/TND.
      expect(ligne.emissionKg).toBeCloseTo(400, 6);
    });

    it('retombe sur la règle par destination quand le libellé ne dit rien', () => {
      const [ligne] = magasin.valoriser([ligneDe({
        nom: 'Écritures de régularisation', ecran: 'biens-services', scope: 'SCOPE_3'
      })]);

      // Aucune entrée de la table ne couvre ce libellé : la destination reprend
      // la main, sans que rien ne soit inventé.
      expect(ligne.referenceCarbone).toBe('MS3C1CP');
    });

  });

  describe('référentiel ne portant que des facteurs physiques', () => {

    let magasinPhysique: DispatchStore;

    beforeEach(() => {
      localStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()]
      });

      magasinPhysique = TestBed.inject(DispatchStore);
      magasinPhysique.chargerFacteurs().subscribe();
      TestBed.inject(HttpTestingController).match(() => true).forEach(r =>
        r.flush([brut('MS3C1DI', 'market for diesel', 'Category 1: PG&S - GCP', 3.29, 'PHYSIQUE')]));
    });

    it('n\'emprunte jamais un facteur au litre pour valoriser un montant', () => {
      // Le libellé désigne bien MS3C1DI, mais ce facteur vaut 3,29 kgCO₂e par
      // litre : l'appliquer à des dinars produirait un chiffre dénué de sens.
      const [ligne] = magasinPhysique.valoriser([ligneDe()]);

      expect(ligne.referenceCarbone).not.toBe('MS3C1DI');
      expect(ligne.origineFacteur).toBe('ADEME Fallback');
    });
  });

  describe('routage nominal, sans doublon', () => {

    it('laisse la ligne de gazole sur sa destination d\'origine', () => {
      const [ligne] = magasin.valoriser([ligneDe()]);

      // Le routage d'origine est rétabli : brûler un carburant que l'on possède
      // reste une émission directe, quelle que soit la donnée d'activité.
      expect(ligne.ecran).toBe('combustion-etablissements');
      expect(ligne.scope).toBe('SCOPE_1');
    });

    it('ne compte chaque ligne qu\'une seule fois', () => {
      const valorisees = magasin.valoriser([
        ligneDe({ cle: 'BG#1' }),
        ligneDe({ cle: 'BG#2', nom: 'Achats Matières.Premières.Local',
                  mainAccount: '601000', ecran: 'biens-services', scope: 'SCOPE_3' })
      ]);

      // Chaque ligne porte une destination et une seule : une donnée de gazole
      // importée au Scope 1 ne peut pas peser aussi dans les achats.
      expect(valorisees).toHaveLength(2);
      expect(valorisees.map(l => l.ecran))
        .toEqual(['combustion-etablissements', 'biens-services']);

      const destinations = valorisees.map(l => l.ecran);
      expect(new Set(destinations).size).toBe(destinations.length);
    });

    it('conserve le motif de routage tel que la règle l\'a écrit', () => {
      const [ligne] = magasin.valoriser([ligneDe()]);

      // Aucune mention de reclassement ne doit subsister.
      expect(ligne.motif).toBe('Compte 602100');
      expect(ligne.motif).not.toContain('hors Scope 1');
    });

    it('laisse intacte une ligne sans destination', () => {
      const [ligne] = magasin.valoriser([ligneDe({ ecran: null, scope: null })]);

      expect(ligne.ecran).toBeNull();
      expect(ligne.facteur).toBe(0);
      expect(ligne.referenceCarbone).toBe('');
    });
  });
});
