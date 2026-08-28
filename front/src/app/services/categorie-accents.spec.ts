import { describe, it, expect } from 'vitest';

import { correspondALaCategorie } from './referential.service';

/**
 * Rapprochement d'une catégorie au motif de son écran de saisie.
 *
 * <p>Les écrans écrivent leurs motifs sur les intitulés GHG anglais du
 * classeur — « Refrigerant gas loss and other fugitive emissions », « Category
 * 4: Upstream transportation ». Une catégorie créée depuis l'application porte
 * en revanche le libellé français.</p>
 *
 * <p>« Émissions de réfrigérants » ne contient pas la suite de lettres
 * « refrigerant » : le é et le è n'en sont pas. La source EMSref22 y était
 * rangée, avec son facteur valide, et n'apparaissait dans aucune liste
 * déroulante du Scope 1. Un accent suffisait à la rendre invisible — et rien à
 * l'écran ne pouvait le laisser deviner.</p>
 */
describe('Catégorie — rapprochement malgré les accents', () => {

  /** Le motif réellement porté par l'écran des réfrigérants. */
  const MOTIF_REFRIGERANTS = /refrigerant|fugitive/i;

  describe('le cas qui a motivé la correction', () => {

    it('rapproche « Émissions de réfrigérants » du motif anglais', () => {
      expect(correspondALaCategorie(MOTIF_REFRIGERANTS, 'Émissions de réfrigérants')).toBe(true);
    });

    it('rapproche toujours l\'intitulé GHG d\'origine', () => {
      // La correction ne doit pas déplacer ce qui fonctionnait.
      expect(correspondALaCategorie(
        MOTIF_REFRIGERANTS, 'Refrigerant gas loss and other fugitive emissions')).toBe(true);
    });
  });

  describe('autres libellés français du référentiel', () => {

    it('rapproche « Combustion dans les établissements »', () => {
      expect(correspondALaCategorie(/etablissement|combustion/i,
        'Combustion dans les établissements')).toBe(true);
    });

    it('rapproche « Électricité achetée » du motif énergie', () => {
      expect(correspondALaCategorie(/energy|electric/i, 'Électricité achetée')).toBe(true);
    });

    it('rapproche « Réseaux de chaleur / Froid »', () => {
      expect(correspondALaCategorie(/reseaux|chaleur/i, 'Réseaux de chaleur / Froid')).toBe(true);
    });
  });

  describe('ce que le rapprochement refuse', () => {

    it('n\'élargit pas au-delà des accents', () => {
      // La casse est déjà gérée par le drapeau i des motifs ; élargir aux
      // espaces ou à la ponctuation ferait accepter des rapprochements que
      // personne n'a demandés.
      expect(correspondALaCategorie(/^Category 4:/i, 'Category  4 : Upstream')).toBe(false);
    });

    it('ne rapproche pas une catégorie étrangère au motif', () => {
      expect(correspondALaCategorie(MOTIF_REFRIGERANTS, 'Category 15: Investments')).toBe(false);
      expect(correspondALaCategorie(/^Category 1:/i, 'Category 10: Processing')).toBe(false);
    });

    it('écarte une catégorie absente ou vide', () => {
      expect(correspondALaCategorie(MOTIF_REFRIGERANTS, null)).toBe(false);
      expect(correspondALaCategorie(MOTIF_REFRIGERANTS, undefined)).toBe(false);
      expect(correspondALaCategorie(MOTIF_REFRIGERANTS, '   ')).toBe(false);
    });
  });

  describe('motifs numérotés du Scope 3', () => {

    it('distingue la catégorie 1 de la catégorie 10', () => {
      // Le deux-points du motif est ce qui les sépare : sans lui, la
      // catégorie 1 avalerait les catégories 10 à 15.
      expect(correspondALaCategorie(/^Category 1:/i, 'Category 1: PG&S - GCP')).toBe(true);
      expect(correspondALaCategorie(/^Category 1:/i, 'Category 15: Investments')).toBe(false);
    });
  });
});
