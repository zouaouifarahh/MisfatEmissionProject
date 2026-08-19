import { describe, it, expect } from 'vitest';

import {
  consoliderGroupe, ecartMediane, EmpreinteFiliale, DenominateursFiliale
} from './consolidation-groupe';

/**
 * Consolidation Groupe : comparer sans fausser le classement.
 *
 * <p>Ce banc défend une règle contre-intuitive mais décisive : un dénominateur
 * absent ne vaut pas zéro. Une filiale dont l'effectif n'est pas renseigné doit
 * apparaître sans intensité — jamais avec une intensité infinie, qui la
 * placerait en tête du palmarès des mauvais élèves, ni nulle, qui l'en
 * sortirait.</p>
 */
describe('Consolidation Groupe', () => {

  /** Les cinq sociétés du Groupe, empreintes en tonnes. */
  const empreintes = (): EmpreinteFiliale[] => ([
    { entityId: 1, libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND',
      scope1: 3_041, scope2: 9_905, scope3: 70_425, total: 83_371 },
    { entityId: 2, libelle: 'MISFAT MAROC', pays: 'Maroc', devise: 'MAD',
      scope1: 420, scope2: 1_100, scope3: 6_200, total: 7_720 },
    { entityId: 3, libelle: 'SOLAUFIL FRANCE', pays: 'France', devise: 'EUR',
      scope1: 110, scope2: 90, scope3: 1_400, total: 1_600 },
    { entityId: 4, libelle: 'SOLAUFIL TUNISIE', pays: 'Tunisie', devise: 'TND',
      scope1: 260, scope2: 610, scope3: 3_100, total: 3_970 },
    { entityId: 5, libelle: 'AZUR TUNISIE', pays: 'Tunisie', devise: 'TND',
      scope1: 95, scope2: 240, scope3: 900, total: 1_235 }
  ]);

  const denominateurs = (): DenominateursFiliale[] => ([
    { entityId: 1, effectif: 1_200, chiffreAffairesM: 180, production: 12_000_000 },
    { entityId: 2, effectif: 220, chiffreAffairesM: 40, production: 1_800_000 },
    { entityId: 3, effectif: 45, chiffreAffairesM: 22, production: 300_000 },
    { entityId: 4, effectif: 130, chiffreAffairesM: 15, production: 900_000 },
    { entityId: 5, effectif: 60, chiffreAffairesM: 8, production: 400_000 }
  ]);

  describe('agrégation', () => {

    it('additionne les scopes de toutes les filiales', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());

      expect(g.scope1).toBe(3_926);
      expect(g.scope2).toBe(11_945);
      expect(g.scope3).toBe(82_025);
      expect(g.total).toBe(97_896);
      expect(g.filiales).toBe(5);
    });

    it('classe les filiales par empreinte décroissante', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());

      expect(g.lignes.map(l => l.libelle)).toEqual([
        'MISFAT TUNISIE', 'MISFAT MAROC', 'SOLAUFIL TUNISIE',
        'SOLAUFIL FRANCE', 'AZUR TUNISIE'
      ]);
    });

    it('rapporte chaque filiale au total Groupe', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());
      const somme = g.lignes.reduce((s, l) => s + l.partGroupe, 0);

      expect(somme).toBeCloseTo(100, 6);
      expect(g.lignes[0].partGroupe).toBeCloseTo((83_371 / 97_896) * 100, 6);
    });

    it('rend une consolidation vide sans filiale', () => {
      const g = consoliderGroupe([], []);

      expect(g.total).toBe(0);
      expect(g.lignes).toEqual([]);
      expect(g.serveurJoignable).toBe(false);
    });
  });

  describe('intensités', () => {

    it('rapporte l\'empreinte à l\'effectif de chaque filiale', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());
      const tunisie = g.lignes.find(l => l.entityId === 1)!;

      expect(tunisie.intensiteEffectif).toBeCloseTo(83_371 / 1_200, 6);
    });

    it('rapporte l\'empreinte au chiffre d\'affaires', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());
      const maroc = g.lignes.find(l => l.entityId === 2)!;

      expect(maroc.intensiteChiffreAffaires).toBeCloseTo(7_720 / 40, 6);
    });

    it('exprime l\'intensité produit en kilogrammes', () => {
      // Une pièce de filtration pèse quelques centaines de grammes de CO₂ :
      // en tonnes, la colonne n'afficherait que des zéros.
      const g = consoliderGroupe(empreintes(), denominateurs());
      const tunisie = g.lignes.find(l => l.entityId === 1)!;

      expect(tunisie.intensiteProduction).toBeCloseTo((83_371 * 1_000) / 12_000_000, 9);
    });

    it('calcule filiale par filiale, sans redistribuer le ratio Groupe', () => {
      // Redistribuer supposerait la même productivité carbone partout,
      // c'est-à-dire supposer ce qu'on cherche à mesurer.
      const g = consoliderGroupe(empreintes(), denominateurs());
      const intensites = g.lignes.map(l => l.intensiteEffectif!);

      expect(new Set(intensites.map(i => i.toFixed(4))).size).toBe(5);
    });

    it('consolide l\'intensité Groupe sur l\'effectif total', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());

      expect(g.effectif).toBe(1_655);
      expect(g.intensiteEffectif).toBeCloseTo(97_896 / 1_655, 6);
    });
  });

  describe('dénominateurs manquants', () => {

    it('laisse l\'intensité vide plutôt que de la calculer sur zéro', () => {
      const partiels: DenominateursFiliale[] = [
        { entityId: 1, effectif: null, chiffreAffairesM: 180, production: null }
      ];
      const g = consoliderGroupe([empreintes()[0]], partiels);

      expect(g.lignes[0].intensiteEffectif).toBeNull();
      expect(g.lignes[0].intensiteProduction).toBeNull();
      expect(g.lignes[0].intensiteChiffreAffaires).not.toBeNull();
    });

    it('traite un dénominateur nul ou négatif comme absent', () => {
      const abimes: DenominateursFiliale[] = [
        { entityId: 1, effectif: 0, chiffreAffairesM: -5, production: 0 }
      ];
      const g = consoliderGroupe([empreintes()[0]], abimes);

      expect(g.lignes[0].intensiteEffectif).toBeNull();
      expect(g.lignes[0].intensiteChiffreAffaires).toBeNull();
    });

    it('nomme ce qui manque, filiale par filiale', () => {
      const partiels: DenominateursFiliale[] = [
        { entityId: 1, effectif: null, chiffreAffairesM: 180, production: 12_000_000 }
      ];
      const g = consoliderGroupe([empreintes()[0]], partiels);

      expect(g.lignes[0].denominateursManquants).toEqual(['effectif']);
      expect(g.filialesIncompletes).toEqual(['MISFAT TUNISIE']);
    });

    it('refuse l\'intensité Groupe dès qu\'un effectif manque', () => {
      // Sommer les effectifs connus donnerait une intensité flatteuse, calculée
      // sur un dénominateur amputé.
      const partiels = denominateurs();
      partiels[2] = { ...partiels[2], effectif: null };
      const g = consoliderGroupe(empreintes(), partiels);

      expect(g.effectif).toBeNull();
      expect(g.intensiteEffectif).toBeNull();
    });

    it('laisse tout vide quand aucun dénominateur n\'est fourni', () => {
      const g = consoliderGroupe(empreintes(), []);

      expect(g.lignes.every(l => l.intensiteEffectif === null)).toBe(true);
      expect(g.filialesIncompletes).toHaveLength(5);
      // L'empreinte, elle, reste consolidée : l'absence de dénominateur
      // n'empêche pas de totaliser.
      expect(g.total).toBe(97_896);
    });
  });

  describe('regroupement par pays', () => {

    it('réunit les sociétés d\'un même pays', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());
      const tunisie = g.pays.find(p => p.pays === 'Tunisie')!;

      expect(tunisie.filiales).toBe(3);
      expect(tunisie.total).toBe(83_371 + 3_970 + 1_235);
    });

    it('classe les pays par empreinte décroissante', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());

      expect(g.pays.map(p => p.pays)).toEqual(['Tunisie', 'Maroc', 'France']);
    });

    it('consolide l\'effectif du pays', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());
      const tunisie = g.pays.find(p => p.pays === 'Tunisie')!;

      expect(tunisie.effectif).toBe(1_200 + 130 + 60);
      expect(tunisie.intensiteEffectif).toBeCloseTo(88_576 / 1_390, 6);
    });

    it('range une filiale sans pays sous une rubrique nommée', () => {
      // Une filiale muette ne doit pas disparaître de la consolidation.
      const sansPays: EmpreinteFiliale[] = [
        { ...empreintes()[0], pays: '' }
      ];
      const g = consoliderGroupe(sansPays, denominateurs());

      expect(g.pays[0].pays).toBe('Non renseigné');
      expect(g.pays[0].total).toBe(83_371);
    });

    it('somme les parts des pays à cent pour cent', () => {
      const g = consoliderGroupe(empreintes(), denominateurs());

      expect(g.pays.reduce((s, p) => s + p.partGroupe, 0)).toBeCloseTo(100, 6);
    });
  });

  describe('fiabilité de la consolidation', () => {

    it('ne se déclare servie par le serveur que si toutes les filiales le sont', () => {
      // Un rapport consolidé dont une société repose sur les seuls relevés
      // locaux doit le déclarer.
      const mixte = empreintes();
      mixte[2] = { ...mixte[2], serveurJoignable: false };

      expect(consoliderGroupe(mixte, denominateurs()).serveurJoignable).toBe(false);
      expect(consoliderGroupe(empreintes(), denominateurs()).serveurJoignable).toBe(true);
    });
  });

  describe('écart à la médiane', () => {

    it('situe une filiale par rapport à ses pairs', () => {
      // Médiane de [10, 20, 30] = 20 ; 30 est 50 % au-dessus.
      expect(ecartMediane(30, [10, 20, 30])).toBeCloseTo(50, 6);
      expect(ecartMediane(10, [10, 20, 30])).toBeCloseTo(-50, 6);
    });

    it('prend la médiane, non la moyenne', () => {
      // Sur cinq filiales dont une pèse quatre cinquièmes du Groupe, la moyenne
      // ne décrit aucune d'entre elles.
      const serie = [1, 2, 3, 4, 400];

      expect(ecartMediane(3, serie)).toBeCloseTo(0, 6);
    });

    it('moyenne les deux valeurs centrales sur un effectif pair', () => {
      expect(ecartMediane(25, [10, 20, 30, 40])).toBeCloseTo(0, 6);
    });

    it('ignore les comparables absents', () => {
      expect(ecartMediane(30, [10, null, 20, null, 30])).toBeCloseTo(50, 6);
    });

    it('ne situe rien faute de comparables', () => {
      expect(ecartMediane(30, [30])).toBeNull();
      expect(ecartMediane(null, [10, 20, 30])).toBeNull();
      expect(ecartMediane(30, [])).toBeNull();
    });
  });
});
