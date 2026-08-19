import { describe, it, expect } from 'vitest';

import {
  TRADUCTIONS_LIBELLE, referenceDepuisLibelle, correspondancePourLibelle
} from './traduction-libelles';
import { apparier } from './appariement-referentiel';
import { FacteurDetaille } from '../services/referential.service';

/**
 * Passage du français des classeurs à l'anglais du référentiel.
 *
 * <p>Le référentiel est rédigé en anglais, les classeurs de l'ERP et la balance
 * générale en français. « Achats matières premières » ne ressemble à aucun
 * {@code typeName}, et aucun degré d'appariement ne pouvait le rattacher : ces
 * lignes restaient sans référence quoi qu'on fasse.</p>
 *
 * <p>Ces bancs tiennent la table. Ce qu'ils protègent n'est pas l'orthographe
 * mais l'ordre : « papier kraft » doit trouver le kraft et non le papier
 * générique, faute de quoi une matière précise serait valorisée par un facteur
 * approximatif sans que rien ne le signale.</p>
 */
describe('Traduction des libellés vers le référentiel', () => {

  describe('correspondances métier', () => {

    const attendus: Array<[string, string]> = [
      // Matières premières de la filtration : le cœur de l'activité MISFAT.
      ['Achats matières premières', 'MS3C1M'],
      ['Achats Matières.Premières.Local', 'MS3C1M'],
      ['Achats matières premières meules', 'MS3C1M'],
      ['Média filtrant', 'MS3C1CP'],
      ['Fibre de cellulose', 'MS3C1CF'],
      ['Papier kraft en bobine', 'MS3C1KP'],
      ['Carton d\'emballage', 'MS3C1CBB'],

      // Métaux.
      ['Tôle acier galvanisé', 'MS3C1RS'],
      ['Achat aluminium', 'MS3C1AL'],
      ['Fil de cuivre', 'MS3C1CR'],
      ['Visserie et boulonnerie', 'MS3C1B'],

      // Chimie.
      ['Colle industrielle', 'MS3C1AD'],
      ['Résine époxy', 'MS3C1EPX'],
      ['Peinture de finition', 'MS3C1PCM'],
      ['Encre d\'impression', 'MS3C1PI'],

      // Plastiques et caoutchoucs.
      ['Joint caoutchouc', 'MS3C1NR'],
      ['Pièces plastique injectées', 'MS3C1PP'],
      ['Mousse polyuréthane', 'MS3C1PU'],

      // Énergie et carburants achetés.
      ['Achats matières combustibles Gasoil', 'MS3C1DI'],
      ['Gazole véhicules', 'MS3C1DI'],
      ['Huiles et lubrifiants', 'MS3C1PL'],

      // Services.
      ['Fournitures de bureau', 'MS3C1OS'],
      ['Frais bancaires', 'MS3C1CB'],
      ['Prime d\'assurance', 'MS3C1IA'],
      ['Gardiennage des sites', 'MS3C1SG'],
      ['Honoraires juridiques', 'MS3C1LS'],
      ['Entretien véhicules', 'MS3C1GAR']
    ];

    for (const [libelle, code] of attendus) {
      it(`« ${libelle} » → ${code}`, () => {
        expect(referenceDepuisLibelle(libelle)).toBe(code);
      });
    }
  });

  describe('robustesse de la lecture', () => {

    it('ignore accents, casse et ponctuation', () => {
      // Les extractions comptables ponctuent au point, à la virgule ou au tiret.
      expect(referenceDepuisLibelle('ACHATS MATIERES PREMIERES')).toBe('MS3C1M');
      expect(referenceDepuisLibelle('Achats-Matières.Premières')).toBe('MS3C1M');
      expect(referenceDepuisLibelle('  matières   premières  ')).toBe('MS3C1M');
    });

    it('ne rend rien pour un libellé vide', () => {
      expect(referenceDepuisLibelle('')).toBeNull();
      expect(referenceDepuisLibelle(null)).toBeNull();
      expect(referenceDepuisLibelle('   ')).toBeNull();
    });

    it('ne rend rien plutôt qu\'une approximation', () => {
      // Un libellé qu'aucune entrée ne couvre doit rester visible comme tel,
      // pour être ajouté à la table en connaissance de cause.
      expect(referenceDepuisLibelle('Écritures de régularisation')).toBeNull();
      expect(referenceDepuisLibelle('Dotation aux amortissements')).toBeNull();
    });

    it('explique le rapprochement retenu', () => {
      const trouve = correspondancePourLibelle('Média filtrant');
      expect(trouve?.code).toBe('MS3C1CP');
      expect(trouve?.documente).toContain('paper');
    });
  });

  describe('ordre des entrées', () => {

    it('préfère le libellé le plus spécifique', () => {
      // « papier kraft » contient « papier » : sans l'ordre, l'entrée générique
      // l'emporterait et une matière précise perdrait son facteur propre.
      expect(referenceDepuisLibelle('papier kraft')).toBe('MS3C1KP');
      expect(referenceDepuisLibelle('papier')).toBe('MS3C1PA');

      expect(referenceDepuisLibelle('mousse polyuréthane')).toBe('MS3C1PU');
      expect(referenceDepuisLibelle('mousse')).toBe('MS3C1UF');

      expect(referenceDepuisLibelle('joint caoutchouc')).toBe('MS3C1NR');
      expect(referenceDepuisLibelle('caoutchouc')).toBe('MS3C1RP');
    });

    it('ne comporte aucun code en double', () => {
      // Deux entrées pointant le même facteur ne seraient pas fautives, mais
      // signaleraient une table à relire : chaque code documente une matière.
      const codes = TRADUCTIONS_LIBELLE.map(e => e.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('cite un code de la nomenclature MISFAT pour chaque entrée', () => {
      for (const entree of TRADUCTIONS_LIBELLE) {
        expect(entree.code).toMatch(/^MS[0-9]/);
        expect(entree.documente.length).toBeGreaterThan(3);
      }
    });
  });

  describe('degré LIBELLE dans l\'appariement', () => {

    const facteur = (referenceCode: string, typeName: string, valeur: number): FacteurDetaille => ({
      id: referenceCode.length, referenceCode, typeName, categoryName: 'Category 1: PG&S - GCP',
      scopeCode: 'SCOPE_3', factorValue: valeur, unit: 'TND', dataType: 'MONETAIRE',
      currency: 'TND', databaseSource: 'Base carbone interne', referenceYear: 2024,
      validityLabel: null
    });

    const FACTEURS = [
      facteur('MS3C1M', 'Metals', 0.0821),
      facteur('MS3C1CP', 'All Other Converted Paper Product Manufacturing', 0.1011),
      facteur('MS3C1DI', 'market for diesel', 0.4)
    ];

    it('rattache un libellé français à son facteur anglais', () => {
      const trouve = apparier(FACTEURS, { libelle: 'Achats matières premières' });

      expect(trouve?.rapprochement).toBe('LIBELLE');
      expect(trouve?.facteur.referenceCode).toBe('MS3C1M');
      expect(trouve?.facteur.factorValue).toBeCloseTo(0.0821, 10);
    });

    it('intervient en dernier, après tous les autres degrés', () => {
      // Une référence explicite doit primer : le libellé ne sert qu'à défaut.
      const trouve = apparier(FACTEURS, {
        referenceCarbone: 'MS3C1CP',
        libelle: 'Achats matières premières'
      });

      expect(trouve?.rapprochement).toBe('REFERENCE');
      expect(trouve?.facteur.referenceCode).toBe('MS3C1CP');
    });

    it('reste sans effet si le référentiel chargé ne porte pas le code traduit', () => {
      // La table peut désigner un facteur absent de la catégorie que l'écran
      // interroge : mieux vaut aucun rapprochement qu'un facteur hors sujet.
      const trouve = apparier([FACTEURS[2]], { libelle: 'Média filtrant' });
      expect(trouve).toBeNull();
    });

    it('est nommé distinctement des degrés exacts', () => {
      const trouve = apparier(FACTEURS, { libelle: 'Gasoil' });
      expect(trouve?.rapprochement).toBe('LIBELLE');
      expect(trouve?.rapprochement).not.toBe('REFERENCE');
    });
  });
});
