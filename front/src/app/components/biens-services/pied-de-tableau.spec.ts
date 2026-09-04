import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { BiensServicesComponent } from './biens-services';
import { PageMesures } from '../../services/mesures-page.service';

/**
 * Pied de tableau des achats, sous pagination serveur.
 *
 * <p>Le pied comptait les lignes montées dans le document — cinquante, celles
 * de la page — et l'annonçait comme un total. Deux lignes plus bas, la barre de
 * pagination disait « sur 38 012 ». Les deux chiffres décrivaient la même
 * catégorie et se contredisaient ; rien ne disait lequel croire.</p>
 *
 * <p>Le pied porte désormais les totaux du serveur, sauf lorsqu'un filtre de
 * l'écran restreint l'affichage : il compte alors ce qu'il montre.</p>
 */
describe('Biens et services — pied de tableau', () => {

  let composant: BiensServicesComponent;

  /** Page serveur telle que l'API la rend, réduite à ce qui sert ici. */
  const PAGE: PageMesures = {
    lignes: [], page: 0, taille: 50,
    totalLignes: 38_012, totalPages: 761,
    totalCo2eKg: 31_011_000, totalQuantite: 208_088_041
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    // Le composant est construit sans detectChanges : ngOnInit lancerait le
    // chargement du referentiel, dont ces cas n'ont que faire.
    composant = TestBed.createComponent(BiensServicesComponent).componentInstance;
    composant.pageServeur = PAGE;
  });

  it('annonce le compte du périmètre entier, non celui de la page', () => {
    expect(composant.lignesDuTotal).toBe(38_012);
  });

  it('annonce les émissions du périmètre entier', () => {
    expect(composant.emissionsDuTotal).toBe(31_011_000);
  });

  it('concorde avec la barre de pagination', () => {
    // Les deux lisent la meme source : le pied ne peut plus contredire la barre.
    expect(composant.lignesDuTotal).toBe(composant.lignesDuServeur);
  });

  it('ne tient aucun filtre pour actif au départ', () => {
    expect(composant.filtreLocalActif).toBe(false);
  });

  it('compte ce qu\'il montre dès qu\'une recherche restreint l\'affichage', () => {
    composant.rechercheTexte = 'papier';

    expect(composant.filtreLocalActif).toBe(true);
    // Il bascule sur la selection : il n'annonce plus les 38 012 du serveur,
    // qui ne decrivent pas ce qui reste a l'ecran.
    expect(composant.lignesDuTotal).not.toBe(38_012);
    expect(composant.lignesDuTotal).toBe(composant.emissionsFiltrees.length);
  });

  it('bascule aussi sur un filtre d\'établissement ou de provenance', () => {
    composant.filtreEtablissement = 'Usine A';
    expect(composant.filtreLocalActif).toBe(true);

    composant.filtreEtablissement = 'Tous';
    expect(composant.filtreLocalActif).toBe(false);

    composant.filtreProvenance = 'Import';
    expect(composant.filtreLocalActif).toBe(true);
  });

  it('retombe sur les lignes montées quand le serveur n\'a rien rendu', () => {
    // Serveur muet : mieux vaut le compte des lignes affichees que zero, qui
    // ferait croire la categorie vide.
    composant.pageServeur = null;

    expect(composant.lignesDuTotal).toBe(0);
    expect(composant.emissionsDuTotal).toBe(composant.totalEmissions);
  });
});
