import { describe, it, expect } from 'vitest';

import { classerFacteursCapex, CATEGORIES } from './investissements-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/**
 * Catégories et facteurs de la catégorie 15, relevés du référentiel.
 *
 * <p>La liste des catégories était écrite dans le code : cinq familles, et rien
 * d'autre. L'appariement du facteur passait par leurs motifs de reconnaissance.
 * Une source créée au référentiel — « INVEST1 » — n'y figurant pas, elle était
 * introuvable au menu, et aucun facteur ne pouvait la viser. Le référentiel
 * pouvait s'enrichir ; cet écran, non.</p>
 *
 * <p>Les familles subsistent en second degré : elles rangent les cellules d'un
 * classeur importé, où « Aluminium metal products » doit tomber sur la bonne
 * famille sans que le référentiel ait à la nommer.</p>
 */
describe('Investissements — catégories et facteurs du référentiel', () => {

  const facteur = (p: Partial<FacteurDetaille>): FacteurDetaille => ({
    id: 1, referenceCode: 'X', typeName: 'X', categoryName: 'Category 15: Investments',
    scopeCode: 'SCOPE_3', factorValue: 0.25, unit: 'TND', dataType: 'MONETAIRE',
    currency: 'TND', databaseSource: 'MISFAT_INTERNE', referenceYear: 2026,
    validityLabel: null, ...p
  });

  /** Le référentiel tel que la base le rend pour la catégorie 15. */
  const REFERENTIEL = [
    facteur({ id: 235, referenceCode: 'MS3C15AL', typeName: 'Alum / Aluminium, monetary' }),
    facteur({ id: 239, referenceCode: 'MS3C15EQ', typeName: 'Industrial equipment, default monetary' }),
    facteur({ id: 300, referenceCode: 'INVEST1', typeName: 'Investissements', factorValue: 0.00245 })
  ];

  describe('appariement par le libellé du référentiel', () => {

    it('vise une source créée au référentiel par son propre nom', () => {
      // Le cas signale : « INVEST1 » n'etait pas selectionnable, aucun motif
      // ecrit dans le code ne le prevoyant.
      const retenus = classerFacteursCapex(REFERENTIEL, {
        categorie: 'Investissements', devise: 'TND'
      });

      expect(retenus.map(f => f.referenceCode)).toEqual(['INVEST1']);
    });

    it('rapproche sans tenir compte des accents ni de la casse', () => {
      const retenus = classerFacteursCapex(REFERENTIEL, {
        categorie: 'INVESTISSEMENTS', devise: 'TND'
      });

      expect(retenus.map(f => f.referenceCode)).toEqual(['INVEST1']);
    });

    it('n\'emprunte pas le facteur d\'une autre source', () => {
      const retenus = classerFacteursCapex(REFERENTIEL, {
        categorie: 'Investissements', devise: 'TND'
      });

      expect(retenus.map(f => f.referenceCode)).not.toContain('MS3C15AL');
    });
  });

  describe('repli sur la famille de reconnaissance', () => {

    it('range une famille importée sur son motif', () => {
      // Une ligne de classeur ne nomme pas une source du referentiel : c'est la
      // famille qui la rattache.
      const retenus = classerFacteursCapex(REFERENTIEL, {
        categorie: 'Alum / Aluminium', devise: 'TND'
      });

      expect(retenus.map(f => f.referenceCode)).toContain('MS3C15AL');
    });

    it('garde les cinq familles disponibles', () => {
      expect(CATEGORIES).toHaveLength(5);
      expect(CATEGORIES).toContain('Équipements Ind. (Fallback #N/A)');
    });
  });

  describe('ce qu\'il refuse de retenir', () => {

    it('écarte les facteurs physiques', () => {
      // Une immobilisation se valorise a la depense : un facteur au kilogramme
      // ne la documente pas.
      const avecPhysique = [
        ...REFERENTIEL,
        facteur({ id: 400, referenceCode: 'PHYS', typeName: 'Investissements',
                  dataType: 'PHYSIQUE', unit: 'kg' })
      ];

      const retenus = classerFacteursCapex(avecPhysique, {
        categorie: 'Investissements', devise: 'TND'
      });

      expect(retenus.map(f => f.referenceCode)).toEqual(['INVEST1']);
    });

    it('ne rend rien sur une catégorie qu\'aucun facteur ne documente', () => {
      expect(classerFacteursCapex(REFERENTIEL, {
        categorie: 'Poste inexistant', devise: 'TND'
      })).toEqual([]);
    });

    it('ne rend rien sur un référentiel vide', () => {
      expect(classerFacteursCapex([], { categorie: 'Investissements', devise: 'TND' }))
        .toEqual([]);
    });
  });
});
