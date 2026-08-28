import { describe, it, expect } from 'vitest';

import { sourcesDuReferentiel, sourcesHorsReferentiel } from './sources-emission';
import { FacteurDetaille } from '../../services/referential.service';

/**
 * Sources d'émission proposées à la saisie.
 *
 * <p>Les écrans de combustion proposaient une liste écrite dans le code. Une
 * source créée au référentiel — avec son facteur — n'y figurait donc jamais, et
 * rien à l'écran ne disait pourquoi : la saisie restait impossible sur une
 * donnée pourtant complète en base.</p>
 *
 * <p>L'écran des véhicules faisait pire : il interrogeait la base, puis
 * <em>intersectait</em> sa réponse avec la liste écrite. Tout ce que le
 * référentiel apportait de neuf était éliminé par la liste qu'il devait
 * remplacer — un appel réseau dont le seul effet possible était de retirer des
 * options.</p>
 */
describe('Sources d\'émission relevées au référentiel', () => {

  /** Facteur tel que le référentiel le rend, réduit à ce qui sert ici. */
  const facteur = (p: Partial<FacteurDetaille>): FacteurDetaille => ({
    id: 1, referenceCode: 'X', typeName: 'X', categoryName: 'X', scopeCode: 'SCOPE_1',
    factorValue: 1, unit: 'L', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'MISFAT_INTERNE', referenceYear: 2026, validityLabel: null, ...p
  });

  /**
   * Le référentiel tel qu'il répond réellement pour le Scope 1.
   *
   * <p>Deux nomenclatures y cohabitent pour un même poste : le libellé français
   * et les intitulés anglais hérités de l'import.</p>
   */
  const REFERENTIEL = [
    facteur({ id: 1, referenceCode: 'FFFFT', typeName: 'Farah',
              categoryName: 'Combustion dans les établissements' }),
    facteur({ id: 2, referenceCode: 'ETABVEH', typeName: 'ETAB22FF',
              categoryName: 'Combustion des véhicules' }),
    facteur({ id: 3, referenceCode: 'MM342', typeName: 'gazole F543-DF',
              categoryName: 'Combustion des véhicules' }),
    facteur({ id: 4, referenceCode: 'MS1COC', typeName: 'Diesel medium and heavy duty truck',
              categoryName: 'Company owned cars' }),
    facteur({ id: 5, referenceCode: 'EMSref22', typeName: '320REF',
              categoryName: 'Émissions de réfrigérants' })
  ];

  const ETABLISSEMENTS = /combustion.*(etablissement|installation|fixe|stationnaire)|stationary combustion/i;
  const VEHICULES = /combustion.*(vehicul|mobile)|mobile combustion|company owned (car|vehicle)/i;

  /** Rapprochement insensible aux accents, comme les écrans le pratiquent. */
  const dans = (motif: RegExp) => (nom: string) =>
    motif.test(nom) || motif.test(nom.normalize('NFD').replace(/[̀-ͯ]/g, ''));

  describe('sources documentées par la base', () => {

    it('propose la source créée au référentiel', () => {
      // Le cas signalé : « FFFFT » a un facteur en base et n'apparaissait pas.
      const sources = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sources.map(s => s.nom)).toEqual(['Farah']);
    });

    it('affiche le code qui désigne la source en base', () => {
      // L'exploitant nomme ses sources par leur code ; la liste n'affichait que
      // le type, et il ne pouvait pas reconnaître celle qu'il venait de créer.
      const [source] = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(source.libelle).toBe('Farah — FFFFT');
    });

    it('retient la valeur du type, non le libellé affiché', () => {
      // C'est sur le type que l'appariement du facteur se fait : retenir le
      // libellé romprait le rattachement des lignes déjà saisies.
      const [source] = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(source.nom).toBe('Farah');
    });

    it('réunit les deux nomenclatures d\'un même poste', () => {
      // La base porte « Combustion des véhicules » et « Company owned cars » :
      // n'en retenir qu'une laisserait la moitié des facteurs hors du menu.
      const sources = sourcesDuReferentiel(REFERENTIEL, dans(VEHICULES));

      expect(sources.map(s => s.nom).sort())
        .toEqual(['Diesel medium and heavy duty truck', 'ETAB22FF', 'gazole F543-DF']);
    });

    it('écarte les sources d\'une autre catégorie', () => {
      const sources = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sources.map(s => s.nom)).not.toContain('320REF');
    });

    it('ne propose qu\'une fois un type porté par plusieurs facteurs', () => {
      // Plusieurs bases documentent le même type : le choix de la variante
      // appartient au sélecteur de base, en aval.
      const plusieurs = [
        facteur({ id: 6, referenceCode: 'A1', typeName: 'Farah', databaseSource: 'DEFRA',
                  categoryName: 'Combustion dans les établissements' }),
        ...REFERENTIEL
      ];

      const sources = sourcesDuReferentiel(plusieurs, dans(ETABLISSEMENTS));

      expect(sources).toHaveLength(1);
      expect(sources[0].libelle).toBe('Farah — A1, FFFFT');
    });

    it('ne rend rien quand le référentiel est vide', () => {
      expect(sourcesDuReferentiel([], dans(ETABLISSEMENTS))).toEqual([]);
    });
  });

  describe('sources hors référentiel', () => {

    const SECOURS = ['Gaz naturel', 'Gazole/Fioul'];

    it('conserve les sources de secours qu\'aucun facteur ne documente', () => {
      const duReferentiel = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sourcesHorsReferentiel(SECOURS, [], duReferentiel))
        .toEqual(['Gaz naturel', 'Gazole/Fioul']);
    });

    it('ne redouble pas une source que la base documente déjà', () => {
      const duReferentiel = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sourcesHorsReferentiel([...SECOURS, 'Farah'], [], duReferentiel))
        .not.toContain('Farah');
    });

    it('garde les sources employées par les lignes déjà saisies', () => {
      // Les retirer rendrait ces lignes inéditables : leur source aurait
      // disparu du menu à la réouverture.
      const duReferentiel = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sourcesHorsReferentiel([], ['Biomasse / Bois'], duReferentiel))
        .toEqual(['Biomasse / Bois']);
    });

    it('rapproche sans tenir compte des accents ni de la casse', () => {
      const duReferentiel = sourcesDuReferentiel(REFERENTIEL, dans(ETABLISSEMENTS));

      expect(sourcesHorsReferentiel([], ['FARAH'], duReferentiel)).toEqual([]);
    });

    it('écarte les valeurs vides des lignes sans source', () => {
      expect(sourcesHorsReferentiel([], ['', '   '], [])).toEqual([]);
    });
  });
});
