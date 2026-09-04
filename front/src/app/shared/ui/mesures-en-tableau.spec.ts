import { describe, it, expect } from 'vitest';

import { mesuresDeLEcran, ligneDeLaBase } from './mesures-en-tableau';
import { MesureServeur } from '../../services/mesures-serveur.service';
import { ORGANISATION_GROUPE, PerimetreOrganisation } from '../../core/perimetre';

/**
 * Rattachement des mesures de la base aux écrans de saisie.
 *
 * <p>Ce rapprochement décide de ce que chaque écran montre. Une erreur y
 * ferait apparaître les investissements parmi les achats, ou disparaître une
 * mesure que le tableau de bord compte pourtant — c'est précisément la
 * contradiction que ce code existe pour supprimer.</p>
 */
describe('Mesures de la base versées dans un tableau', () => {

  const mesure = (p: Partial<MesureServeur> & { id: number; categorie: string }): MesureServeur => ({
    libelle: 'Mesure', scope: 'SCOPE_3', quantite: 100, unite: 'TND',
    emissionKg: 1_000, date: '2025-06-30', filialeId: 1,
    origine: 'EXCEL_IMPORT', baseAppliquee: 'EPA-ORD 2024', ...p
  });

  const C8 = mesure({ id: 1, categorie: 'Category 8: Upstream leased assets' });
  const C15 = mesure({ id: 2, categorie: 'Category 15: Investments' });
  const C1 = mesure({ id: 3, categorie: 'Category 1: PG&S - GCP' });
  const ENERGIE = mesure({ id: 4, categorie: 'Energy', scope: 'SCOPE_2' });

  const TOUTES = [C8, C15, C1, ENERGIE];

  describe('rattachement par numéro GHG', () => {

    it('retient la seule catégorie portant ce numéro', () => {
      const retenues = mesuresDeLEcran(TOUTES, { numeroGhg: 8 }, 2025, ORGANISATION_GROUPE);
      expect(retenues.map(m => m.id)).toEqual([1]);
    });

    it('ne confond pas « Category 1 » avec « Category 15 »', () => {
      // Sans frontière après le numéro, les investissements viendraient grossir
      // les biens et services achetés.
      const retenues = mesuresDeLEcran(TOUTES, { numeroGhg: 1 }, 2025, ORGANISATION_GROUPE);
      expect(retenues.map(m => m.id)).toEqual([3]);
    });

    it('retient bien la catégorie 15 quand c\'est elle qu\'on demande', () => {
      const retenues = mesuresDeLEcran(TOUTES, { numeroGhg: 15 }, 2025, ORGANISATION_GROUPE);
      expect(retenues.map(m => m.id)).toEqual([2]);
    });
  });

  describe('rattachement par libellé', () => {

    it('retient un libellé déclaré par l\'écran', () => {
      const retenues = mesuresDeLEcran(TOUTES, { categories: ['Energy'] }, 2025, ORGANISATION_GROUPE);
      expect(retenues.map(m => m.id)).toEqual([4]);
    });

    it('ignore les accents et la ponctuation', () => {
      const accentuee = [mesure({ id: 9, categorie: 'Émissions de réfrigérants' })];
      const retenues = mesuresDeLEcran(
        accentuee, { categories: ['Emissions de refrigerants'] }, 2025, ORGANISATION_GROUPE);
      expect(retenues).toHaveLength(1);
    });

    it('ne retient rien quand l\'écran ne déclare aucun critère', () => {
      // Un ecran sans critere ne doit pas tout capter : il vaut mieux qu'il
      // n'affiche rien que d'afficher le bilan entier.
      expect(mesuresDeLEcran(TOUTES, {}, 2025, ORGANISATION_GROUPE)).toHaveLength(0);
    });
  });

  describe('périmètre', () => {

    it('écarte les mesures d\'un autre exercice', () => {
      expect(mesuresDeLEcran(TOUTES, { numeroGhg: 8 }, 2024, ORGANISATION_GROUPE)).toHaveLength(0);
    });

    it('retient tous les exercices en vue pluriannuelle', () => {
      expect(mesuresDeLEcran(TOUTES, { numeroGhg: 8 }, null, ORGANISATION_GROUPE)).toHaveLength(1);
    });

    it('écarte les mesures d\'une autre société', () => {
      const autreSociete: PerimetreOrganisation = { ...ORGANISATION_GROUPE, entityId: 2 };
      expect(mesuresDeLEcran(TOUTES, { numeroGhg: 8 }, 2025, autreSociete)).toHaveLength(0);
    });
  });

  describe('conversion en ligne de tableau', () => {

    it('reprend la quantité, l\'unité et les émissions de la base', () => {
      const ligne = ligneDeLaBase(C8, 'Actifs loués en amont');

      expect(ligne.quantite).toBe(100);
      expect(ligne.unite).toBe('TND');
      expect(ligne.emissionCalculee).toBe(1_000);
    });

    it('porte l\'intitulé de l\'écran, non celui de la base', () => {
      // « Category 8: Upstream leased assets » n'a rien a faire dans une
      // colonne que l'utilisateur lit en francais.
      expect(ligneDeLaBase(C8, 'Actifs loués en amont').categorie).toBe('Actifs loués en amont');
    });

    it('déduit le facteur du rapport émissions / quantité', () => {
      expect(ligneDeLaBase(C8, 'X').facteur).toBe(10);
    });

    it('ne divise pas par zéro sur une quantité nulle', () => {
      expect(ligneDeLaBase(mesure({ id: 5, categorie: 'X', quantite: 0 }), 'X').facteur).toBe(0);
    });

    it('marque la ligne en lecture seule', () => {
      expect(ligneDeLaBase(C8, 'X').lectureSeule).toBe(true);
    });

    it('date la ligne du jour que la mesure documente', () => {
      const ligne = ligneDeLaBase(C8, 'X');
      expect(ligne.dateDebut).toBe('2025-06-30');
      expect(ligne.dateFin).toBe('2025-06-30');
    });
  });
});
