import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ActivityDataService, releveVide } from '../../core/activity-data.service';
import {
  anneeDeCellule, champDeLIntitule, extraireActivite, nombreDeCellule, repererAnnees
} from './extraction-activite';

/**
 * Données d'activité : annuaire et extraction des états financiers.
 *
 * <p>Deux exigences se rejoignent : une donnée absente doit rester absente —
 * jamais convertie en zéro, qui ferait diverger ou s'écraser les ratios — et la
 * lecture d'un classeur doit reposer sur des intitulés, non sur des positions
 * de cellules.</p>
 */
describe('Données d\'activité', () => {

  describe('ActivityDataService', () => {

    let service: ActivityDataService;

    const creer = () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [ActivityDataService] });
      return TestBed.inject(ActivityDataService);
    };

    beforeEach(() => {
      localStorage.clear();
      service = creer();
    });

    const poser = (entityId: number | null, annee: number, champs = {}) =>
      service.enregistrer(entityId, { ...releveVide(annee), ...champs, annee });

    it('enregistre puis relit un exercice', () => {
      poser(null, 2025, { chiffreAffairesM: 45, effectif: 465, production: 9_400_000 });

      const releve = service.pour(null, 2025)!;
      expect(releve.chiffreAffairesM).toBe(45);
      expect(releve.effectif).toBe(465);
      expect(releve.majLe).toBeTruthy();
    });

    it('remplace l\'exercice plutôt que d\'empiler les doublons', () => {
      poser(null, 2025, { effectif: 400 });
      poser(null, 2025, { effectif: 465 });

      expect(service.liste(null)).toHaveLength(1);
      expect(service.pour(null, 2025)!.effectif).toBe(465);
    });

    it('range les exercices du plus ancien au plus récent', () => {
      poser(null, 2026);
      poser(null, 2024);
      poser(null, 2025);

      expect(service.annees(null)).toEqual([2024, 2025, 2026]);
    });

    it('cloisonne les sociétés', () => {
      poser(null, 2025, { effectif: 900 });
      poser(7, 2025, { effectif: 465 });

      // Le chiffre d'affaires d'une filiale n'est pas celui d'une autre : les
      // mélanger fausserait toute intensité.
      expect(service.valeur(null, 2025, 'effectif')).toBe(900);
      expect(service.valeur(7, 2025, 'effectif')).toBe(465);
      expect(service.valeur(9, 2025, 'effectif')).toBeNull();
    });

    it('rend null pour une donnée absente, jamais zéro', () => {
      poser(null, 2025, { effectif: 465 });

      // Un dénominateur à zéro ferait diverger le ratio ; à null, il l'interdit.
      expect(service.valeur(null, 2025, 'production')).toBeNull();
      expect(service.valeur(null, 2030, 'effectif')).toBeNull();
      expect(service.valeur(null, null, 'effectif')).toBeNull();
    });

    it('supprime un exercice sans toucher aux autres', () => {
      poser(null, 2024, { effectif: 400 });
      poser(null, 2025, { effectif: 465 });

      service.supprimer(null, 2024);
      expect(service.annees(null)).toEqual([2025]);
    });

    it('survit à un rafraîchissement de la page', () => {
      poser(7, 2025, { production: 9_400_000 });

      expect(creer().valeur(7, 2025, 'production')).toBe(9_400_000);
    });

    it('repart d\'un annuaire sain si le stockage est illisible', () => {
      localStorage.setItem('misfat_donnees_activite', 'ceci n\'est pas du JSON');
      expect(creer().liste(null)).toEqual([]);
    });
  });

  describe('Lecture des cellules', () => {

    it('lit les nombres quelle que soit la convention locale', () => {
      expect(nombreDeCellule(45000000)).toBe(45_000_000);
      expect(nombreDeCellule('45 000 000,50')).toBeCloseTo(45_000_000.5, 2);
      expect(nombreDeCellule('45,000,000.50')).toBeCloseTo(45_000_000.5, 2);
      expect(nombreDeCellule('45.000.000,50')).toBeCloseTo(45_000_000.5, 2);
      expect(nombreDeCellule('45 000 000 TND')).toBe(45_000_000);
    });

    it('écarte les cellules sans nombre', () => {
      expect(nombreDeCellule('')).toBeNull();
      expect(nombreDeCellule(null)).toBeNull();
      expect(nombreDeCellule('Chiffre d\'affaires')).toBeNull();
    });

    it('reconnaît un millésime plausible', () => {
      expect(anneeDeCellule(2025)).toBe(2025);
      expect(anneeDeCellule('Exercice 2025')).toBe(2025);
      expect(anneeDeCellule('1999')).toBeNull();
      expect(anneeDeCellule('465')).toBeNull();
    });

    it('rattache les intitulés français et anglais', () => {
      expect(champDeLIntitule("Chiffre d'affaires")).toBe('chiffreAffairesM');
      expect(champDeLIntitule('Revenue')).toBe('chiffreAffairesM');
      expect(champDeLIntitule('Effectif moyen')).toBe('effectif');
      expect(champDeLIntitule('Headcount')).toBe('effectif');
      expect(champDeLIntitule('Volume de production')).toBe('production');
      expect(champDeLIntitule('Ventes (unités)')).toBe('ventes');
      expect(champDeLIntitule('Véhicules de fonction')).toBe('vehiculesFonction');
      expect(champDeLIntitule('Total du bilan')).toBeNull();
    });

    it('n\'ouvre un tableau pluriannuel que sur deux millésimes distincts', () => {
      expect(repererAnnees([['Poste', 2024, 2025]])!.size).toBe(2);

      // « Bilan 2025 » seul n'ouvre pas de tableau par année.
      expect(repererAnnees([['Bilan 2025', 'Valeur']])).toBeNull();
    });
  });

  describe('Extraction d\'un état financier', () => {

    it('lit un tableau pluriannuel en colonnes', () => {
      const resultat = extraireActivite([
        ['États financiers MISFAT'],
        ['Poste', 2024, 2025],
        ["Chiffre d'affaires", 41.75, 45],
        ['Effectif moyen', 432, 465],
        ['Volume de production', 8_600_000, 9_400_000]
      ], null);

      expect(resultat.releves.map(r => r.annee)).toEqual([2024, 2025]);

      const deux5 = resultat.releves.find(r => r.annee === 2025)!;
      expect(deux5.chiffreAffairesM).toBe(45);
      expect(deux5.effectif).toBe(465);
      expect(deux5.production).toBe(9_400_000);

      expect(resultat.reconnus).toContain("Chiffre d'affaires");
    });

    it('rattache un relevé sans millésime à l\'exercice consulté', () => {
      const resultat = extraireActivite([
        ["Chiffre d'affaires", '45'],
        ['Effectif', '465']
      ], 2026);

      expect(resultat.releves).toHaveLength(1);
      expect(resultat.releves[0].annee).toBe(2026);
      expect(resultat.releves[0].effectif).toBe(465);
    });

    it('refuse de deviner l\'exercice quand aucun n\'est sélectionné', () => {
      const resultat = extraireActivite([["Chiffre d'affaires", '45']], null);

      expect(resultat.releves).toEqual([]);
      expect(resultat.avertissements[0]).toContain('aucun exercice');
    });

    it('trouve l\'intitulé même précédé d\'une colonne de numérotation', () => {
      const resultat = extraireActivite([['1', "Chiffre d'affaires", '45']], 2025);
      expect(resultat.releves[0].chiffreAffairesM).toBe(45);
    });

    it('ne confond pas les véhicules avec l\'effectif', () => {
      const resultat = extraireActivite([
        ['Nombre de véhicules de fonction', 32],
        ['Effectif', 465]
      ], 2025);

      expect(resultat.releves[0].vehiculesFonction).toBe(32);
      expect(resultat.releves[0].effectif).toBe(465);
    });

    it('signale un classeur dont aucun intitulé n\'est reconnu', () => {
      const resultat = extraireActivite([['Total du bilan', 1000]], 2025);

      expect(resultat.releves).toEqual([]);
      expect(resultat.avertissements[0]).toContain('Aucun intitulé reconnu');
    });

    it('signale un fichier vide plutôt que de rendre un résultat muet', () => {
      expect(extraireActivite([], 2025).avertissements[0]).toContain('aucune donnée lisible');
    });
  });
});
