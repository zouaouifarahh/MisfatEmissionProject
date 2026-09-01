import { describe, it, expect } from 'vitest';

import {
  UNITES_MONETAIRES, unitesProposees, uniteCoherente, facteurPlausible,
  FACTEUR_MONETAIRE_MAX
} from './unites-mesure';

/**
 * Unité d'un facteur d'émission, et sa cohérence avec le type de donnée.
 *
 * <p>L'unité était un champ libre. Rien n'empêchait donc d'enregistrer un
 * facteur monétaire libellé « kg », ni un facteur physique libellé « TND » : le
 * calcul multipliait alors une quantité par un ratio qui ne la documente pas, et
 * le résultat n'avait aucune borne. C'est ainsi qu'un poste a pesé quinze
 * millions de tonnes sur un exercice.</p>
 */
describe('Unités d\'un facteur d\'émission', () => {

  describe('suggestions selon le type', () => {

    it('propose des devises pour un facteur monétaire', () => {
      expect(unitesProposees('MONETAIRE')).toEqual(UNITES_MONETAIRES);
      expect(unitesProposees('MONETAIRE')[0]).toBe('TND');
    });

    it('propose les grandeurs essentielles pour un facteur physique', () => {
      // Six unités, arrêtées par l'exploitante : celles que les sources MISFAT
      // emploient réellement. Une liste plus longue allongeait le menu de
      // grandeurs qu'aucune source ne porte.
      expect(unitesProposees('PHYSIQUE')).toEqual(['kg', 't', 'L', 'm3', 'kWh', 'km']);
    });

    it('ne mélange jamais les deux', () => {
      // Les proposer ensemble inviterait a les confondre, ce qui est le defaut
      // que ces listes corrigent.
      const physiques = unitesProposees('PHYSIQUE');

      for (const devise of UNITES_MONETAIRES) expect(physiques).not.toContain(devise);
    });
  });

  describe('cohérence de l\'unité', () => {

    it('accepte une devise sur un facteur monétaire', () => {
      expect(uniteCoherente('TND', 'MONETAIRE')).toBe(true);
      expect(uniteCoherente('eur', 'MONETAIRE')).toBe(true);
    });

    it('refuse une grandeur sur un facteur monétaire', () => {
      // Le cas signale : un ratio par dinar libelle « kg ».
      expect(uniteCoherente('kg', 'MONETAIRE')).toBe(false);
    });

    it('refuse une devise sur un facteur physique', () => {
      expect(uniteCoherente('TND', 'PHYSIQUE')).toBe(false);
    });

    it('accepte une grandeur inhabituelle sur un facteur physique', () => {
      // Le referentiel documente des unites que la liste n'epuise pas : les
      // refuser deciderait aujourd'hui de ce qu'il contiendra demain.
      expect(uniteCoherente('m linéaire', 'PHYSIQUE')).toBe(true);
      expect(uniteCoherente('pièce', 'PHYSIQUE')).toBe(true);
    });

    it('refuse une unité vide', () => {
      expect(uniteCoherente('', 'PHYSIQUE')).toBe(false);
      expect(uniteCoherente(null, 'MONETAIRE')).toBe(false);
    });
  });

  describe('plausibilité du facteur', () => {

    it('borne les facteurs monétaires', () => {
      expect(facteurPlausible(0.25, 'MONETAIRE')).toBe(true);
      expect(facteurPlausible(FACTEUR_MONETAIRE_MAX, 'MONETAIRE')).toBe(true);
      expect(facteurPlausible(9_999, 'MONETAIRE')).toBe(false);
    });

    it('ne borne pas les facteurs physiques', () => {
      // Le pouvoir de rechauffement d'un refrigerant se compte en milliers de
      // kgCO₂e par kilogramme : le brider ecarterait des valeurs justes.
      expect(facteurPlausible(2_088, 'PHYSIQUE')).toBe(true);
    });

    it('refuse une valeur nulle ou négative', () => {
      expect(facteurPlausible(0, 'PHYSIQUE')).toBe(false);
      expect(facteurPlausible(-1, 'MONETAIRE')).toBe(false);
      expect(facteurPlausible(null, 'PHYSIQUE')).toBe(false);
    });
  });
});
