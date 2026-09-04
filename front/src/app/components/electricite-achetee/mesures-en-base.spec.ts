import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ElectriciteAcheteeComponent } from './electricite-achetee';
import { MesureServeur } from '../../services/mesures-serveur.service';
import { ORGANISATION_GROUPE } from '../../core/perimetre';

/**
 * Électricité achetée : les mesures de la base dans le tableau lui-même.
 *
 * <p>L'écran portait un panneau annonçant « 1 mesure(s) enregistrée(s) en
 * base », puis, deux lignes plus bas, un tableau disant « aucune consommation
 * d'électricité enregistrée sur ce périmètre ». Les deux décrivaient la même
 * donnée — « Diesel groupe électrogène », 800 L, 2 635 kgCO₂e — et se
 * contredisaient.</p>
 *
 * <p>Le panneau est supprimé ; le tableau lit la base. La règle de filtrage est
 * celle du panneau qu'il remplace, de sorte que rien n'apparaisse ni ne
 * disparaisse au passage.</p>
 */
describe('Électricité achetée — mesures de la base', () => {

  let composant: ElectriciteAcheteeComponent;

  /** La mesure réellement en base pour cette catégorie. */
  const DIESEL: MesureServeur = {
    id: 5, libelle: 'Diesel groupe électrogène', categorie: 'Energy',
    scope: 'SCOPE_2', quantite: 800, unite: 'L', emissionKg: 2_635.578371,
    date: '2026-02-10', filialeId: 1, origine: 'SAISIE',
    baseAppliquee: 'MISFAT_INTERNE'
  };

  /** Mesure d'une autre catégorie : elle ne doit pas remonter ici. */
  const AUTRE: MesureServeur = {
    ...DIESEL, id: 6, libelle: 'Achats consommables',
    categorie: 'Category 1: PG&S - GCP', scope: 'SCOPE_3'
  };

  /** Alimente le composant sans passer par le réseau. */
  const servir = (mesures: MesureServeur[]) => {
    (composant as unknown as { mesuresServeur: MesureServeur[] }).mesuresServeur = mesures;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    composant = TestBed.createComponent(ElectriciteAcheteeComponent).componentInstance;
    composant.exerciceActif = 2026;
    // Aucune societe n'est selectionnee : le perimetre reste celui du groupe,
    // et seul l'exercice discrimine les mesures.
    expect(composant.perimetreAffiche.entityId).toBe(ORGANISATION_GROUPE.entityId);
  });

  it('verse la mesure de la base dans les lignes du tableau', () => {
    servir([DIESEL]);

    const lignes = composant.lignesServeur;
    expect(lignes).toHaveLength(1);
    expect(lignes[0].emissionSource).toBe('Diesel groupe électrogène');
    expect(lignes[0].quantite).toBe(800);
    expect(lignes[0].unite).toBe('L');
    expect(lignes[0].emissionCalculee).toBeCloseTo(2_635.578371, 5);
  });

  it('fait apparaître la mesure dans le tableau principal', () => {
    // C'est tout l'objet du changement : le tableau ne doit plus annoncer
    // « aucune consommation » alors que la base en porte une.
    servir([DIESEL]);

    expect(composant.toutesLignes.length).toBeGreaterThan(0);
    expect(composant.toutesLignes.some(l => l.emissionSource === 'Diesel groupe électrogène'))
      .toBe(true);
  });

  it('déduit le facteur du rapport émissions / quantité', () => {
    servir([DIESEL]);
    expect(composant.lignesServeur[0].facteur).toBeCloseTo(2_635.578371 / 800, 6);
  });

  it('ne divise pas par zéro sur une quantité nulle', () => {
    servir([{ ...DIESEL, quantite: 0 }]);
    expect(composant.lignesServeur[0].facteur).toBe(0);
  });

  it('écarte les mesures d\'une autre catégorie', () => {
    // « Energy » et « Category 1 » cohabitent en base ; melanger les deux
    // ferait compter des achats comme de l'electricite.
    servir([DIESEL, AUTRE]);

    expect(composant.lignesServeur).toHaveLength(1);
    expect(composant.lignesServeur[0].id).toBe(5);
  });

  it('écarte les mesures d\'un autre exercice', () => {
    composant.exerciceActif = 2025;
    servir([DIESEL]);

    expect(composant.lignesServeur).toHaveLength(0);
  });

  it('marque ces lignes en lecture seule', () => {
    // La base n'offre pas de chemin d'ecriture depuis cet ecran : les boutons
    // de modification ne doivent pas s'afficher sur ces lignes.
    servir([DIESEL]);
    expect(composant.lignesServeur[0].lectureSeule).toBe(true);
  });

  it('laisse le tableau vide quand le serveur ne rend rien', () => {
    servir([]);
    expect(composant.lignesServeur).toHaveLength(0);
  });
});
