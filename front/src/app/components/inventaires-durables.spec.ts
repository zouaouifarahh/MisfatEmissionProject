import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InvestissementsComponent } from './investissements/investissements';
import { BiensEquipementComponent } from './biens-equipement/biens-equipement';
import { ActifsLouesAmontComponent } from './actifs-loues-amont/actifs-loues-amont';
import { ActifsLouesAvalComponent } from './actifs-loues-aval/actifs-loues-aval';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';

/**
 * Étanchéité de l'exercice sur les écrans d'inventaire.
 *
 * <p>Ces quatre écrans — investissements, biens d'équipement, actifs loués en
 * amont et en aval — ont brièvement montré leur inventaire entier, quel que soit
 * l'exercice de l'en-tête. L'exploitante a tranché : l'étanchéité par année vaut
 * pour les quinze catégories comme pour ces quatre-là, sans exception.</p>
 *
 * <p>Ces bancs verrouillent le retour à la règle commune. Ils existent parce que
 * l'écart a eu lieu : sans eux, rien n'empêcherait de le refaire.</p>
 */
describe('Écrans d\'inventaire — étanchéité de l\'exercice', () => {

  const ECRANS: { nom: string; composant: Type<unknown>; cle: string }[] = [
    { nom: 'C15 — investissements', composant: InvestissementsComponent,
      cle: CLES_PAR_CATEGORIE['investissements'] },
    { nom: 'C2 — biens d\'équipement', composant: BiensEquipementComponent,
      cle: CLES_PAR_CATEGORIE['biens-equipement'] },
    { nom: 'C8 — actifs loués amont', composant: ActifsLouesAmontComponent,
      cle: CLES_PAR_CATEGORIE['actifs-loues-amont'] },
    { nom: 'C13 — actifs loués aval', composant: ActifsLouesAvalComponent,
      cle: CLES_PAR_CATEGORIE['actifs-loues-aval'] }
  ];

  /** Une ligne par exercice : le tri doit n'en retenir qu'une à la fois. */
  const inventaire = () => [2024, 2025, 2026].map((annee, i) => ({
    id: i + 1, reference: 'ACT' + i, numeroImmo: 'IMMO' + i, designation: 'Actif ' + i,
    quantite: 100, montant: 100, facteur: 0.25, emissionCalculee: 25,
    dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31`, creeLe: ''
  }));

  let fixtures: { destroy: () => void }[] = [];

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  for (const ecran of ECRANS) {
    describe(ecran.nom, () => {

      beforeEach(async () => {
        localStorage.clear();
        localStorage.setItem(ecran.cle, JSON.stringify(inventaire()));

        await TestBed.configureTestingModule({
          imports: [ecran.composant],
          providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
        }).compileComponents();
      });

      function monter(): Record<string, unknown> {
        const fixture = TestBed.createComponent(ecran.composant);
        fixtures.push(fixture);
        fixture.detectChanges();

        const httpMock = TestBed.inject(HttpTestingController);
        for (let passe = 0; passe < 6; passe++) {
          const attente = httpMock.match(() => true);
          if (!attente.length) break;
          for (const requete of attente) requete.flush([]);
          fixture.detectChanges();
        }

        return fixture.componentInstance as Record<string, unknown>;
      }

      it('ne retient que les lignes de l\'exercice consulté', () => {
        const composant = monter();

        for (const annee of [2024, 2025, 2026]) {
          composant['exerciceActif'] = annee;
          expect((composant['lignesDuPerimetre'] as unknown[]).length).toBe(1);
        }
      });

      it('ne rend rien sur un exercice qu\'aucune ligne ne documente', () => {
        const composant = monter();
        composant['exerciceActif'] = 2019;

        expect(composant['lignesDuPerimetre']).toHaveLength(0);
      });

      it('rend tout en vue pluriannuelle', () => {
        // « Tous les exercices » porte `null` : c'est le seul chemin vers
        // l'inventaire complet, et il est explicite.
        const composant = monter();
        composant['exerciceActif'] = null;

        expect((composant['lignesDuPerimetre'] as unknown[]).length).toBe(3);
      });

      it('n\'annonce plus rien sous le tableau', () => {
        // Le cadenas est retire : le filtre de l'en-tete s'applique
        // naturellement, sans message d'avertissement.
        const composant = monter();

        expect(composant['messagePerimetre']).toBeUndefined();
      });
    });
  }
});
