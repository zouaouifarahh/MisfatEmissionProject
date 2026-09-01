import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BiensEquipementComponent } from './biens-equipement/biens-equipement';
import { ActifsLouesAmontComponent } from './actifs-loues-amont/actifs-loues-amont';
import { ActifsLouesAvalComponent } from './actifs-loues-aval/actifs-loues-aval';
import { CLES_PAR_CATEGORIE } from '../shared/dispatch/mesures-locales';

/**
 * Inventaires durables : tous les exercices, toujours.
 *
 * <p>Quatre catégories ne tiennent pas un flux annuel mais un patrimoine : les
 * investissements, les biens d'équipement, et les actifs loués en amont comme
 * en aval. Un matériel acquis en 2019 reste en service en 2026 ; un bail court
 * d'une année sur l'autre. Les masquer parce que l'en-tête affiche un autre
 * millésime revient à nier qu'on les détient.</p>
 *
 * <p>Les catégories de flux — achats, transport, déchets, déplacements — gardent
 * leur cloisonnement annuel : une consommation appartient à l'exercice qu'elle
 * documente, et l'y rattacher est le fondement du bilan.</p>
 *
 * <p>Conséquence assumée : le total de ces quatre écrans ne s'accorde plus avec
 * celui du tableau de bord pour un exercice donné. Les deux chiffres sont
 * justes, ils ne répondent pas à la même question.</p>
 */
describe('Inventaires durables — indépendants de l\'exercice consulté', () => {

  /** Écrans levés, avec la clé de stockage que chacun relit. */
  const DURABLES: { nom: string; composant: Type<unknown>; cle: string }[] = [
    { nom: 'C2 — biens d\'équipement', composant: BiensEquipementComponent,
      cle: CLES_PAR_CATEGORIE['biens-equipement'] },
    { nom: 'C8 — actifs loués amont', composant: ActifsLouesAmontComponent,
      cle: CLES_PAR_CATEGORIE['actifs-loues-amont'] },
    { nom: 'C13 — actifs loués aval', composant: ActifsLouesAvalComponent,
      cle: CLES_PAR_CATEGORIE['actifs-loues-aval'] }
  ];

  /** Quatre lignes, quatre exercices : une seule correspond à celui consulté. */
  const inventaire = () => [2019, 2024, 2025, 2026].map((annee, i) => ({
    id: i + 1, reference: 'ACT' + i, designation: 'Actif ' + i,
    quantite: 100, montant: 100, facteur: 0.25, emissionCalculee: 25,
    dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31`, creeLe: ''
  }));

  let fixtures: { destroy: () => void }[] = [];

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  for (const ecran of DURABLES) {
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

      it('retient l\'inventaire entier, quel que soit l\'exercice consulté', () => {
        const composant = monter();

        for (const annee of [2019, 2024, 2025, 2026]) {
          composant['exerciceActif'] = annee;
          expect((composant['lignesDuPerimetre'] as unknown[]).length).toBe(4);
        }
      });

      it('ne parle plus d\'exercice sous le tableau', () => {
        const composant = monter();
        composant['exerciceActif'] = 2026;

        expect(String(composant['messagePerimetre'])).not.toContain('autre exercice');
      });

      it('passe le même périmètre au panneau des mesures serveur', () => {
        // Sans cela, le tableau montrerait tout l'inventaire pendant que le
        // panneau du serveur n'en montrerait qu'une annee : deux moities d'un
        // meme ecran en desaccord.
        const composant = monter();
        composant['exerciceActif'] = 2026;

        expect(composant['exercicePourPanneau']).toBeNull();
      });
    });
  }
});
