import { describe, it, expect } from 'vitest';

import {
  lireReferenceCarbone, lireCodeArticle, valeurPourAlias, normaliserEntete,
  colonnesIdentite, ENTETE_REFERENCE, ENTETE_CODE_ARTICLE,
  ALIAS_REFERENCE, ALIAS_CODE_ARTICLE
} from './colonnes-identite';

/**
 * Lecture des colonnes d'identité carbone dans les classeurs importés.
 *
 * <p>Quinze écrans ont chacun leur parseur, écrit pour la forme du classeur
 * qu'ils reçoivent. Laisser chacun inventer ses orthographes acceptées aurait
 * produit des comportements divergents : « Réf. Carbone » compris ici, ignoré
 * là, sans que rien ne le signale à l'utilisateur.</p>
 *
 * <p>Ce banc tient les intitulés que les modèles téléchargeables emploient à la
 * lettre : l'importateur et le modèle ne peuvent plus diverger sans qu'un test
 * échoue.</p>
 */
describe('Colonnes d\'identité carbone', () => {

  describe('normalisation des entêtes', () => {

    it('écarte accents, ponctuation et casse', () => {
      expect(normaliserEntete('Référence Carbone')).toBe('reference carbone');
      expect(normaliserEntete('RÉF. CARBONE')).toBe('ref carbone');
      expect(normaliserEntete('Code-Article/ERP')).toBe('code article erp');
      expect(normaliserEntete('  Code   Article  ')).toBe('code article');
    });

    it('rend une chaîne vide pour l\'absence', () => {
      expect(normaliserEntete(null)).toBe('');
      expect(normaliserEntete('')).toBe('');
    });
  });

  describe('lecture de la référence carbone', () => {

    it('reconnaît les orthographes courantes', () => {
      for (const entete of ['Référence Carbone', 'Reference Carbone', 'Réf. Carbone',
                            'REFERENCE', 'Ref', 'Carbon Reference']) {
        expect(lireReferenceCarbone({ [entete]: 'MS3C1CP' })).toBe('MS3C1CP');
      }
    });

    it('rend une chaîne vide quand la colonne manque', () => {
      expect(lireReferenceCarbone({ 'Usine': 'MISFAT I' })).toBe('');
      expect(lireReferenceCarbone({})).toBe('');
      expect(lireReferenceCarbone(null)).toBe('');
    });

    it('ignore une cellule vide', () => {
      expect(lireReferenceCarbone({ 'Référence Carbone': '   ' })).toBe('');
      expect(lireReferenceCarbone({ 'Référence Carbone': null })).toBe('');
    });

    it('supprime les espaces autour de la valeur', () => {
      expect(lireReferenceCarbone({ 'Référence Carbone': '  MS1COC  ' })).toBe('MS1COC');
    });
  });

  describe('lecture du code article', () => {

    it('reconnaît les orthographes courantes', () => {
      for (const entete of ['Code Article ERP', 'Code article', 'CODE ERP',
                            'Référence Article', 'Item Code']) {
        expect(lireCodeArticle({ [entete]: 'ART-4417' })).toBe('ART-4417');
      }
    });

    it('ne confond pas le code article avec la référence carbone', () => {
      const ligne = { 'Référence Carbone': 'MS3C1CP', 'Code Article ERP': 'ART-4417' };

      // Les deux cohabitent dans le même classeur : les intervertir ferait
      // valoriser la ligne par un identifiant de gestion.
      expect(lireReferenceCarbone(ligne)).toBe('MS3C1CP');
      expect(lireCodeArticle(ligne)).toBe('ART-4417');
    });
  });

  describe('priorité de l\'égalité sur le préfixe', () => {

    it('préfère la colonne exactement nommée', () => {
      const ligne = {
        'Code Article Fournisseur': 'FRS-99',
        'Code Article': 'ART-4417'
      };

      // Sans cette priorité, « code article » capturerait la colonne
      // fournisseur, arrivée la première dans le classeur.
      expect(valeurPourAlias(ligne, ALIAS_CODE_ARTICLE)).toBe('ART-4417');
    });

    it('accepte un préfixe à défaut d\'égalité', () => {
      expect(valeurPourAlias({ 'Référence Carbone MISFAT': 'MS1RG' }, ALIAS_REFERENCE))
        .toBe('MS1RG');
    });

    it('ignore une colonne exacte mais vide, et poursuit', () => {
      const ligne = { 'Reference': '', 'Reference Carbone MISFAT': 'MS1RG' };
      expect(valeurPourAlias(ligne, ALIAS_REFERENCE)).toBe('MS1RG');
    });
  });

  describe('colonnes produites dans les modèles', () => {

    it('emploie les intitulés que la lecture reconnaît', () => {
      // Le lien entre le modèle et l'importateur : ce qui est écrit doit être
      // relu. Si l'un des deux change, ce banc échoue.
      const colonnes = colonnesIdentite('MS3C1CP', 'ART-4417');

      expect(lireReferenceCarbone(colonnes)).toBe('MS3C1CP');
      expect(lireCodeArticle(colonnes)).toBe('ART-4417');
    });

    it('nomme les colonnes comme le référentiel les nomme', () => {
      expect(ENTETE_REFERENCE).toBe('Référence Carbone');
      expect(ENTETE_CODE_ARTICLE).toBe('Code Article ERP');
    });

    it('accepte des colonnes vides, pour montrer le cas non renseigné', () => {
      const colonnes = colonnesIdentite();
      expect(colonnes[ENTETE_REFERENCE]).toBe('');
      expect(colonnes[ENTETE_CODE_ARTICLE]).toBe('');
    });
  });
});
