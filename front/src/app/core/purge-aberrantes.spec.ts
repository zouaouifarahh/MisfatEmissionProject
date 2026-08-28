import { describe, it, expect, beforeEach } from 'vitest';

import {
  jouerMigrationsDeDemarrage, messagePurge, bilanPurge,
  MARQUEUR_PURGE_ABERRANTES, EMISSION_LIGNE_MAX
} from './migrations-demarrage';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';

/**
 * Neutralisation des émissions résiduelles impossibles.
 *
 * <p>Une correction de formule ne corrige que les calculs à venir : une ligne
 * enregistrée avant garde l'émission calculée à la saisie. Une seule suffisait à
 * porter le bilan à trente-sept millions de tonnes et à laisser le bandeau
 * d'invraisemblance allumé sur une cause pourtant réparée.</p>
 *
 * <p>La reprise ne recalcule pas : chaque écran a sa formule — tonne-kilomètre,
 * kilowattheure, montant, pouvoir de réchauffement — et rejouer partout une
 * formule unique rendrait des chiffres faux là où elle ne s'applique pas. Elle
 * remet à zéro l'émission et le facteur, et laisse intact tout ce qui a été
 * saisi, si bien que la ligne se revalorise dès qu'un facteur juste lui est
 * affecté.</p>
 */
describe('Reprise — émissions résiduelles impossibles', () => {

  // Volontairement hors transport amont : la reprise d'échelle massique y
  // rejoue la formule, et recalculerait la ligne avant que ce banc l'observe.
  const CLE = CLES_PAR_CATEGORIE['biens-services'];
  const CLE_ACHATS = CLES_PAR_CATEGORIE['franchises'];

  const relire = (cle: string) => JSON.parse(localStorage.getItem(cle) ?? '[]');

  /** Ligne résiduelle : trente-sept millions de tonnes sur une seule écriture. */
  const aberrante = () => ({
    id: 1, designation: 'Fret usine', poidsKg: 12_000, distanceKm: 340,
    montant: 8_400, facteur: 9_999, uniteFacteur: 'kgCO2e/t',
    emissionCalculee: 3.7e10, dateDebut: '2025-01-01', dateFin: '2025-12-31'
  });

  beforeEach(() => {
    localStorage.clear();
    bilanPurge.lignes = 0;
    bilanPurge.kgRetires = 0;
  });

  describe('lignes impossibles', () => {

    it('remet leur émission à zéro', () => {
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].emissionCalculee).toBe(0);
    });

    it('retire le facteur qui les a produites', () => {
      // Laisser le facteur en place ferait revenir la même valeur au premier
      // recalcul : c'est lui, et non l'émission, qui porte l'erreur.
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].facteur).toBeNull();
    });

    it('conserve tout ce qui a été saisi', () => {
      // La quantité, le poids, la distance et le montant sont de la donnée
      // d'entrée : les perdre obligerait à ressaisir la ligne entière.
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));

      jouerMigrationsDeDemarrage();

      const ligne = relire(CLE)[0];
      expect(ligne.designation).toBe('Fret usine');
      expect(ligne.poidsKg).toBe(12_000);
      expect(ligne.distanceKm).toBe(340);
      expect(ligne.montant).toBe(8_400);
      expect(ligne.dateDebut).toBe('2025-01-01');
    });

    it('balaie toutes les catégories', () => {
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));
      localStorage.setItem(CLE_ACHATS, JSON.stringify([aberrante()]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].emissionCalculee).toBe(0);
      expect(relire(CLE_ACHATS)[0].emissionCalculee).toBe(0);
      expect(bilanPurge.lignes).toBe(2);
    });
  });

  describe('lignes plausibles', () => {

    it('laisse intacte une grosse ligne légitime', () => {
      // Dix-neuf mille tonnes sur un poste d'immobilisations est un chiffre
      // élevé mais possible : le seuil ne doit arbitrer aucun cas discutable.
      const legitime = { ...aberrante(), emissionCalculee: 19_628_000 };
      localStorage.setItem(CLE, JSON.stringify([legitime]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].emissionCalculee).toBe(19_628_000);
      expect(relire(CLE)[0].facteur).toBe(9_999);
      expect(bilanPurge.lignes).toBe(0);
    });

    it('laisse intacte une ligne juste au seuil', () => {
      const auSeuil = { ...aberrante(), emissionCalculee: EMISSION_LIGNE_MAX };
      localStorage.setItem(CLE, JSON.stringify([auSeuil]));

      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].emissionCalculee).toBe(EMISSION_LIGNE_MAX);
    });
  });

  describe('compte rendu', () => {

    it('dit ce qui a été retiré, et que la saisie est conservée', () => {
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));

      jouerMigrationsDeDemarrage();

      const message = messagePurge();
      expect(message).toContain('1 ligne(s)');
      expect(message).toContain('tCO₂e');
      expect(message).toContain('conservées');
    });

    it('ne dit rien quand rien n\'a été neutralisé', () => {
      jouerMigrationsDeDemarrage();

      expect(messagePurge()).toBe('');
    });
  });

  describe('rejeu', () => {

    it('ne repasse pas une fois le marqueur posé', () => {
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));
      jouerMigrationsDeDemarrage();

      // Une ligne aberrante réapparue après coup relève d'un défaut vivant, que
      // la reprise masquerait au lieu de le laisser voir.
      localStorage.setItem(CLE, JSON.stringify([aberrante()]));
      jouerMigrationsDeDemarrage();

      expect(relire(CLE)[0].emissionCalculee).toBe(3.7e10);
      expect(localStorage.getItem(MARQUEUR_PURGE_ABERRANTES)).toBe('fait');
    });
  });
});
