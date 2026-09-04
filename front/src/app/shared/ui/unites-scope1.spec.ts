import { describe, it, expect } from 'vitest';

import {
  UNITES_SCOPE_1, UNITES_PHYSIQUES, unitesAvecCourante
} from './unites-mesure';

/**
 * Unités proposées à la saisie des postes de combustion du Scope 1.
 *
 * <p>L'unité était imposée par le facteur retenu — un champ verrouillé. Il
 * fallait donc convertir la donnée avant de la saisir, et une conversion faite
 * de tête au bord d'un formulaire est une erreur qui attend son tour.</p>
 */
describe('Unités de saisie du Scope 1', () => {

  it('propose les grandeurs des combustibles', () => {
    expect([...UNITES_SCOPE_1]).toEqual(['L', 'kg', 'Tonne', 'm³', 'kWh', 'MWh', 'TJ']);
  });

  it('reste distincte de la liste des écrans de mesure', () => {
    // Les fondre ferait entrer les kilomètres dans une modale de combustion et
    // les térajoules dans un relevé de déplacement.
    const mesure = UNITES_PHYSIQUES.flatMap(g => g.unites);
    expect(mesure).toContain('km');
    expect([...UNITES_SCOPE_1]).not.toContain('km');
    expect(mesure).not.toContain('TJ');
  });

  describe('unité déjà retenue', () => {

    it('conserve la liste telle quelle quand l\'unité y figure', () => {
      expect(unitesAvecCourante('kWh')).toEqual([...UNITES_SCOPE_1]);
    });

    it('ignore la casse pour reconnaître une unité de la liste', () => {
      // « KG » et « kg » désignent la même grandeur : la dédoubler donnerait un
      // menu qui propose deux fois la même chose.
      expect(unitesAvecCourante('KG')).toEqual([...UNITES_SCOPE_1]);
    });

    it('ajoute en tête une unité que la liste n\'a pas', () => {
      // Le référentiel documente des grandeurs que la liste n'épuise pas. Sans
      // ce complément, ouvrir une mesure les ferait disparaître du menu, et le
      // premier enregistrement les remplacerait en silence.
      expect(unitesAvecCourante('Nm³')).toEqual(['Nm³', ...UNITES_SCOPE_1]);
    });

    it('rend la liste seule quand aucune unité n\'est retenue', () => {
      expect(unitesAvecCourante(null)).toEqual([...UNITES_SCOPE_1]);
      expect(unitesAvecCourante('')).toEqual([...UNITES_SCOPE_1]);
      expect(unitesAvecCourante('   ')).toEqual([...UNITES_SCOPE_1]);
    });

    it('accepte une autre liste que celle du Scope 1', () => {
      expect(unitesAvecCourante('EUR', ['TND'])).toEqual(['EUR', 'TND']);
    });
  });
});
