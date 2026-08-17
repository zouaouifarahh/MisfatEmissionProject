import { describe, it, expect, beforeEach } from 'vitest';

import {
  apparier, remigrerLignes, libelleRapprochement, normaliserLibelle,
  migrationFaite, marquerMigration, messagePourMigration, adaptateurStandard,
  AdaptateurLigne, Rapprochement
} from './appariement-referentiel';
import { FacteurDetaille } from '../services/referential.service';

/**
 * Appariement au référentiel carbone, règle commune à tous les scopes.
 *
 * <p>Ces bancs tiennent la règle que dix-sept écrans partagent désormais. Ce qui
 * s'y joue n'est pas cosmétique : un appariement qui se trompe de degré
 * remplace un facteur documenté par un facteur voisin, et l'erreur se propage à
 * l'empreinte de tout un scope sans qu'aucun écran ne la signale.</p>
 */
describe('Appariement au référentiel carbone', () => {

  const facteur = (
    referenceCode: string, typeName: string, factorValue: number, databaseSource: string
  ): FacteurDetaille => ({
    id: Math.abs(referenceCode.length * 7),
    referenceCode, typeName, categoryName: typeName, scopeCode: 'SCOPE_3',
    factorValue, unit: 'kg', dataType: 'PHYSIQUE', currency: null,
    databaseSource, referenceYear: 2024, validityLabel: null
  });

  /** Deux facteurs de la même catégorie : seul le code les distingue. */
  const FACTEURS = [
    facteur('MS3C2ACW', 'Category 2: Capital Goods', 0.0492281568, 'EPA-ORD 2024'),
    facteur('MS3C1AAA', 'Category 1: Purchased goods and services', 2.48, 'Ecoinvent'),
    facteur('MS3C1BBB', 'Category 1: Purchased goods and services', 0.31, 'ADEME')
  ];

  describe('degrés de certitude', () => {

    it('retient la référence carbone avant tout', () => {
      const trouve = apparier(FACTEURS, {
        referenceCarbone: 'MS3C2ACW',
        codeArticle: 'MS3C1AAA',
        categorie: 'Category 1: Purchased goods and services'
      });

      // Les trois critères désignent des facteurs différents : la référence
      // gagne, sans quoi une ligne bien renseignée serait valorisée par sa
      // catégorie.
      expect(trouve?.rapprochement).toBe('REFERENCE');
      expect(trouve?.facteur.referenceCode).toBe('MS3C2ACW');
      expect(trouve?.facteur.factorValue).toBeCloseTo(0.0492281568, 10);
    });

    it('retombe sur le code article quand la référence manque', () => {
      const trouve = apparier(FACTEURS, {
        referenceCarbone: '',
        codeArticle: 'MS3C1AAA',
        categorie: 'Category 1: Purchased goods and services'
      });

      expect(trouve?.rapprochement).toBe('CODE_ARTICLE');
      expect(trouve?.facteur.databaseSource).toBe('Ecoinvent');
    });

    it('retombe sur la catégorie en dernier recours', () => {
      const trouve = apparier(FACTEURS, {
        categorie: 'Category 2: Capital Goods'
      });

      expect(trouve?.rapprochement).toBe('CATEGORIE');
      expect(trouve?.facteur.referenceCode).toBe('MS3C2ACW');
    });

    it('ne rend aucun facteur plutôt qu\'un facteur de repli', () => {
      // Le cœur de la correction : une ligne non documentée doit être signalée,
      // pas valorisée avec un 0,31 pris au hasard dans sa famille.
      expect(apparier(FACTEURS, { referenceCarbone: 'INCONNUE' })).toBeNull();
      expect(apparier(FACTEURS, { categorie: 'Catégorie absente du référentiel' })).toBeNull();
      expect(apparier(FACTEURS, {})).toBeNull();
    });

    it('tient sans référentiel chargé', () => {
      expect(apparier([], { referenceCarbone: 'MS3C2ACW' })).toBeNull();
      expect(apparier(null, { referenceCarbone: 'MS3C2ACW' })).toBeNull();
      expect(apparier(undefined, { referenceCarbone: 'MS3C2ACW' })).toBeNull();
    });
  });

  describe('tolérance de saisie', () => {

    it('ignore la casse et les espaces d\'un identifiant', () => {
      // Les extractions ERP charrient des espaces et des minuscules.
      expect(apparier(FACTEURS, { referenceCarbone: '  ms3c2acw  ' })?.rapprochement)
        .toBe('REFERENCE');
    });

    it('ignore accents et ponctuation d\'une catégorie', () => {
      const accentue = [facteur('MS1COC', 'Combustion dans les usines', 3.32, 'EPA')];
      expect(apparier(accentue, { categorie: 'COMBUSTION  DANS-LES USINES' })?.rapprochement)
        .toBe('CATEGORIE');
    });

    it('ramène un libellé à sa forme comparable', () => {
      expect(normaliserLibelle('Électricité  achetée (kWh)')).toBe('electricite achetee kwh');
      expect(normaliserLibelle(null)).toBe('');
    });
  });

  describe('migration des lignes enregistrées', () => {

    interface Ligne {
      id: number;
      reference: string;
      codeArticle: string;
      categorie: string;
      facteur: number | null;
      base: string;
      rapprochement: Rapprochement | null;
      quantite: number;
      emission: number;
    }

    const ADAPTATEUR: AdaptateurLigne<Ligne> = {
      referenceCarbone: l => l.reference,
      codeArticle: l => l.codeArticle,
      categorie: l => l.categorie,
      facteurActuel: l => l.facteur,
      baseActuelle: l => l.base,
      rapprochementActuel: l => l.rapprochement,
      appliquer: (l, a) => ({
        ...l,
        reference: a.facteur.referenceCode,
        categorie: a.facteur.typeName,
        facteur: a.facteur.factorValue,
        base: a.facteur.databaseSource,
        rapprochement: a.rapprochement,
        emission: l.quantite * a.facteur.factorValue
      })
    };

    const ligneDe = (sur: Partial<Ligne> = {}): Ligne => ({
      id: 1, reference: '', codeArticle: '', categorie: '',
      facteur: null, base: '', rapprochement: null, quantite: 100, emission: 0, ...sur
    });

    it('rattache une ligne au facteur exact de sa référence', () => {
      const avant = [ligneDe({
        reference: 'MS3C1AAA',
        categorie: 'Category 1: Purchased goods and services',
        facteur: 0.31, base: 'ADEME', rapprochement: 'CATEGORIE'
      })];

      const { lignes, corrigees } = remigrerLignes(avant, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(1);
      expect(lignes[0].facteur).toBeCloseTo(2.48, 10);
      expect(lignes[0].base).toBe('Ecoinvent');
      expect(lignes[0].rapprochement).toBe('REFERENCE');
      // L'émission suit le facteur retenu : 100 × 2,48.
      expect(lignes[0].emission).toBeCloseTo(248, 6);
    });

    it('laisse intacte une ligne déjà correctement rattachée', () => {
      const dejaJuste = [ligneDe({
        reference: 'MS3C1AAA', facteur: 2.48, base: 'Ecoinvent', rapprochement: 'REFERENCE'
      })];

      const { lignes, corrigees } = remigrerLignes(dejaJuste, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(0);
      // Même objet : rien n'a été réécrit, donc rien n'a pu être abîmé.
      expect(lignes[0]).toBe(dejaJuste[0]);
    });

    it('laisse intacte une ligne qu\'aucun degré ne rattache', () => {
      const orpheline = [ligneDe({
        reference: 'REFERENCE_ABSENTE', facteur: 0.45, base: 'Saisie manuelle'
      })];

      const { lignes, corrigees } = remigrerLignes(orpheline, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(0);
      expect(lignes[0].facteur).toBeCloseTo(0.45, 10);
      expect(lignes[0].base).toBe('Saisie manuelle');
    });

    it('corrige la base documentaire même à facteur identique', () => {
      // Deux facteurs peuvent porter la même valeur et des bases distinctes :
      // la traçabilité du rapport dépend de la base, pas seulement du chiffre.
      const memeValeur = [ligneDe({
        reference: 'MS3C1BBB', facteur: 0.31, base: 'Source inconnue', rapprochement: 'REFERENCE'
      })];

      const { lignes, corrigees } = remigrerLignes(memeValeur, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(1);
      expect(lignes[0].base).toBe('ADEME');
    });

    it('ne touche à rien sans référentiel chargé', () => {
      const avant = [ligneDe({ reference: 'MS3C1AAA', facteur: 0.31, base: 'ADEME' })];

      const { lignes, corrigees } = remigrerLignes(avant, [], ADAPTATEUR);

      expect(corrigees).toBe(0);
      expect(lignes[0].facteur).toBeCloseTo(0.31, 10);
    });

    it('traite chaque ligne indépendamment', () => {
      const melange = [
        ligneDe({ id: 1, reference: 'MS3C2ACW', facteur: 0.31, base: 'ADEME' }),
        ligneDe({ id: 2, reference: 'INTROUVABLE', facteur: 0.45, base: 'Manuelle' }),
        ligneDe({ id: 3, codeArticle: 'MS3C1BBB', facteur: 0, base: '' })
      ];

      const { lignes, corrigees } = remigrerLignes(melange, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(2);
      expect(lignes[0].rapprochement).toBe('REFERENCE');
      expect(lignes[1].rapprochement).toBeNull();
      expect(lignes[2].rapprochement).toBe('CODE_ARTICLE');
    });

    it('accepte une liste vide', () => {
      expect(remigrerLignes([], FACTEURS, ADAPTATEUR)).toEqual({ lignes: [], corrigees: 0 });
      expect(remigrerLignes(null, FACTEURS, ADAPTATEUR)).toEqual({ lignes: [], corrigees: 0 });
    });
  });

  describe('réajustement par proportion', () => {

    interface LigneEcran {
      id: number;
      reference: string;
      codeArticle: string;
      categorie: string;
      facteur: number | null;
      baseAppliquee: string;
      uniteFacteur: string;
      rapprochement: Rapprochement | null;
      emissionCalculee: number;
    }

    const ADAPTATEUR = adaptateurStandard<LigneEcran>({
      reference: 'reference', codeArticle: 'codeArticle', categorie: 'categorie',
      facteur: 'facteur', base: 'baseAppliquee', uniteFacteur: 'uniteFacteur',
      emission: 'emissionCalculee', rapprochement: 'rapprochement'
    });

    const ligneDe = (sur: Partial<LigneEcran> = {}): LigneEcran => ({
      id: 1, reference: '', codeArticle: '', categorie: '', facteur: null,
      baseAppliquee: '', uniteFacteur: '', rapprochement: null, emissionCalculee: 0, ...sur
    });

    it('réajuste l\'émission au rapport des facteurs', () => {
      // 500 km × 0,31 = 155. Le facteur exact vaut 2,48, soit huit fois plus :
      // l'émission doit suivre, sans que la migration sache qu'il s'agit de km.
      const avant = [ligneDe({
        reference: 'MS3C1AAA', facteur: 0.31, baseAppliquee: 'ADEME', emissionCalculee: 155
      })];

      const { lignes, corrigees } = remigrerLignes(avant, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(1);
      expect(lignes[0].facteur).toBeCloseTo(2.48, 10);
      expect(lignes[0].emissionCalculee).toBeCloseTo(1240, 4);
      expect(lignes[0].uniteFacteur).toBe('kg');
    });

    it('vaut pour une grandeur monétaire comme pour une distance', () => {
      // 10 000 TND × 0,0492281568 attendu ; la ligne portait 0,31.
      const avant = [ligneDe({
        reference: 'MS3C2ACW', facteur: 0.31, baseAppliquee: 'ADEME', emissionCalculee: 3100
      })];

      const { lignes } = remigrerLignes(avant, FACTEURS, ADAPTATEUR);

      expect(lignes[0].emissionCalculee).toBeCloseTo(492.2816, 3);
      expect(lignes[0].baseAppliquee).toBe('EPA-ORD 2024');
    });

    it('laisse l\'émission en place quand l\'ancien facteur est nul', () => {
      // Aucun rapport n'est calculable : réajuster reviendrait à inventer une
      // grandeur. La ligne reçoit son facteur, son émission reste à recalculer.
      const avant = [ligneDe({
        reference: 'MS3C1AAA', facteur: 0, baseAppliquee: '', emissionCalculee: 0
      })];

      const { lignes, corrigees } = remigrerLignes(avant, FACTEURS, ADAPTATEUR);

      expect(corrigees).toBe(1);
      expect(lignes[0].facteur).toBeCloseTo(2.48, 10);
      expect(lignes[0].emissionCalculee).toBe(0);
    });

    it('tolère un écran sans base ni unité de facteur', () => {
      // Trois écrans du Scope 1 et 2 ne portent pas ces champs.
      const reduit = adaptateurStandard<LigneEcran>({
        reference: 'reference', facteur: 'facteur', emission: 'emissionCalculee'
      });

      const avant = [ligneDe({ reference: 'MS3C1BBB', facteur: 1, emissionCalculee: 100 })];
      const { lignes, corrigees } = remigrerLignes(avant, FACTEURS, reduit);

      expect(corrigees).toBe(1);
      expect(lignes[0].facteur).toBeCloseTo(0.31, 10);
      expect(lignes[0].emissionCalculee).toBeCloseTo(31, 4);
      // Les champs absents de la déclaration ne sont pas inventés.
      expect(lignes[0].baseAppliquee).toBe('');
    });

    it('ne modifie pas la ligne d\'origine', () => {
      const origine = ligneDe({
        reference: 'MS3C1AAA', facteur: 0.31, baseAppliquee: 'ADEME', emissionCalculee: 155
      });

      remigrerLignes([origine], FACTEURS, ADAPTATEUR);

      expect(origine.facteur).toBeCloseTo(0.31, 10);
      expect(origine.emissionCalculee).toBe(155);
    });
  });

  describe('marqueur de migration', () => {

    beforeEach(() => localStorage.clear());

    it('n\'est pas posé avant la première exécution', () => {
      expect(migrationFaite('misfat_ref_matching_v2_essai')).toBe(false);
    });

    it('tient une fois posé', () => {
      marquerMigration('misfat_ref_matching_v2_essai');
      expect(migrationFaite('misfat_ref_matching_v2_essai')).toBe(true);
    });

    it('ne confond pas deux écrans', () => {
      marquerMigration('misfat_ref_matching_v2_dechets');
      expect(migrationFaite('misfat_ref_matching_v2_transport_amont')).toBe(false);
    });
  });

  describe('restitution à l\'utilisateur', () => {

    it('nomme le degré de rapprochement', () => {
      expect(libelleRapprochement('REFERENCE')).toBe('Référence carbone');
      expect(libelleRapprochement('CODE_ARTICLE')).toBe('Code article ERP');
      expect(libelleRapprochement('CATEGORIE')).toBe('Catégorie');
      expect(libelleRapprochement(null)).toBe('Non rapproché');
    });

    it('se tait quand rien n\'a été corrigé', () => {
      expect(messagePourMigration(0)).toBe('');
      expect(messagePourMigration(3)).toContain('3 ligne(s)');
    });
  });
});
