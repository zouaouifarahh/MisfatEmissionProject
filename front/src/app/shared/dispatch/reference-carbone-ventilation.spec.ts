import { describe, it, expect } from 'vitest';

import { LigneValorisee } from './dispatch-store';
import {
  adapterVersMesure, adapterVersAchat, adapterVersImmobilisation
} from './adaptateurs-mesure';

/**
 * Séparation du compte comptable et de la référence carbone.
 *
 * <p>Les lignes issues de la ventilation d'une balance portaient leur compte
 * comptable — 601000, 625000 — dans le champ que la colonne « Référence
 * carbone » affiche. Un compte identifie une écriture ; il ne dit rien du
 * facteur appliqué. Les confondre ôtait au rapport toute traçabilité du calcul,
 * et donnait à un vérificateur l'illusion d'une référence là où il n'y en avait
 * aucune.</p>
 *
 * <p>Ces bancs tiennent la séparation sur les trois adaptateurs. Une régression
 * ici ne casserait rien de visible : elle remettrait simplement des numéros de
 * compte dans une colonne qui prétend documenter le référentiel.</p>
 */
describe('Ventilation — référence carbone et compte comptable', () => {

  /** Ligne de balance valorisée, telle que le magasin la publie. */
  const ligneDe = (sur: Partial<LigneValorisee> = {}): LigneValorisee => ({
    cle: 'BG-2025-601000',
    feuille: 'BG MISFAT 2025',
    ligneSource: 42,
    mainAccount: '601000',
    nom: 'Achats de matières premières',
    categorieCarboneTexte: 'Category 1: PG&S - GCP',
    categorieAbsente: false,
    reference: 'FA-2025-0117',
    quantite: 250_000,
    colonneValeur: 'Solde débit',
    colonnesEcartees: [],
    ecran: 'biens-services',
    scope: 'SCOPE_3',
    motif: 'compte 601000 reconnu',
    origineRoutage: 'compte',
    motCle: '601000',
    exclu: false,
    facteur: 0.0492281568,
    uniteFacteur: 'TND',
    libelleFacteur: 'Category 1: PG&S - GCP',
    baseAppliquee: 'EPA-ORD 2024',
    origineFacteur: 'MS SQL BDD',
    emissionKg: 12_307,
    referenceCarbone: 'MS3C1AAA',
    ...sur
  } as LigneValorisee);

  describe('mesure standard — Scopes 1, 2 et achats', () => {

    it('met la référence du référentiel dans « reference »', () => {
      const mesure = adapterVersMesure(ligneDe(), 0, 'Biens et services achetés', 'MISFAT I');

      expect(mesure.reference).toBe('MS3C1AAA');
      // Et surtout : jamais le compte comptable.
      expect(mesure.reference).not.toBe('601000');
      expect(mesure.reference).not.toMatch(/^\d{6}$/);
    });

    it('met le compte comptable dans « codeArticle »', () => {
      const mesure = adapterVersMesure(ligneDe(), 0, 'Biens et services achetés');

      // Le compte reste accessible : il permet de retrouver l'écriture.
      expect(mesure.codeArticle).toBe('601000');
    });

    it('retombe sur la référence du document quand le compte manque', () => {
      const mesure = adapterVersMesure(ligneDe({ mainAccount: '' }), 0, 'Achats');

      expect(mesure.codeArticle).toBe('FA-2025-0117');
      expect(mesure.reference).toBe('MS3C1AAA');
    });

    it('laisse la référence vide sur un repli, sans en inventer', () => {
      // Un ratio monétaire moyen n'a pas de référence au référentiel. Lui en
      // fabriquer une la rendrait indiscernable d'une valeur documentée.
      const repli = adapterVersMesure(
        ligneDe({ referenceCarbone: '', origineFacteur: 'ADEME Fallback' }), 0, 'Achats'
      );

      expect(repli.reference).toBe('');
      // Le compte, lui, reste renseigné : la ligne demeure traçable.
      expect(repli.codeArticle).toBe('601000');
    });

    it('n\'utilise jamais « VENT » comme référence carbone', () => {
      // « VENT » est le repli d'identification d'une ligne sans compte ni
      // document ; il n'a rien à faire dans une colonne de référentiel.
      const anonyme = adapterVersMesure(
        ligneDe({ mainAccount: '', reference: '', referenceCarbone: '' }), 0, 'Achats'
      );

      expect(anonyme.codeArticle).toBe('VENT');
      expect(anonyme.reference).not.toBe('VENT');
      expect(anonyme.reference).toBe('');
    });
  });

  describe('achat ventilé', () => {

    it('hérite de la séparation', () => {
      const achat = adapterVersAchat(ligneDe(), 0, 'MISFAT I');

      expect(achat.reference).toBe('MS3C1AAA');
      expect(achat.codeArticle).toBe('601000');
      expect(achat.categorieCarbone).toBe('Category 1: PG&S - GCP');
    });

    it('conserve le compte même quand la catégorie du classeur manque', () => {
      const achat = adapterVersAchat(ligneDe({ categorieAbsente: true }), 0);

      expect(achat.categorieCarbone).toBe('Ventilation comptable');
      expect(achat.codeArticle).toBe('601000');
      expect(achat.reference).toBe('MS3C1AAA');
    });
  });

  describe('immobilisation ventilée', () => {

    it('distingue les trois identifiants', () => {
      const immo = adapterVersImmobilisation(
        ligneDe({ mainAccount: '215400', referenceCarbone: 'MS3C15EQ' }), 0
      );

      // Trois rôles, trois champs : l'actif comptable, le code de gestion, et
      // le facteur d'émission.
      expect(immo.numeroImmo).toBe('215400');
      expect(immo.codeArticle).toBe('215400');
      expect(immo.referenceCarbone).toBe('MS3C15EQ');
    });

    it('laisse la référence carbone vide sur un repli', () => {
      const immo = adapterVersImmobilisation(
        ligneDe({ referenceCarbone: '', categorieAbsente: true }), 0
      );

      expect(immo.referenceCarbone).toBe('');
      expect(immo.categorieCarbone).toBe('Équipements Ind. (Fallback #N/A)');
      // Le numéro d'immobilisation ne doit pas migrer vers la référence.
      expect(immo.numeroImmo).toBe('601000');
    });
  });

  describe('aucun numéro de compte ne franchit la colonne du référentiel', () => {

    it('vaut pour tous les comptes rencontrés sur la balance', () => {
      // Les comptes que l'utilisateur a vus apparaître dans la colonne.
      for (const compte of ['601000', '601110', '625000', '626000', '613200']) {
        const mesure = adapterVersMesure(
          ligneDe({ mainAccount: compte, referenceCarbone: 'MS3C1AAA' }), 0, 'Achats'
        );

        expect(mesure.reference).toBe('MS3C1AAA');
        expect(mesure.codeArticle).toBe(compte);
      }
    });
  });
});
