import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';

import { EmissionListComponent } from './emission-list/emission-list';
import { CombustionVehiculesComponent } from './combustion-vehicules/combustion-vehicules';
import { FranchisesComponent } from './franchises/franchises';

/**
 * Harmonisation des formulaires de mesure.
 *
 * <p>Deux écarts séparaient les écrans de combustion des dix-sept autres.</p>
 *
 * <p>Le premier : leurs sources d'émission venaient d'une liste écrite dans le
 * code. Une source créée au référentiel — avec son facteur — n'y figurait donc
 * jamais, et la saisie restait impossible sur une donnée pourtant complète en
 * base. L'écran des véhicules interrogeait bien l'API, mais n'en gardait que ce
 * qui figurait déjà dans sa liste : l'appel ne pouvait que retirer des options,
 * jamais en apporter.</p>
 *
 * <p>Le second : le facteur n'était pas saisissable. Le formulaire imposait de
 * choisir une entrée du référentiel, si bien qu'un facteur négocié ou mesuré
 * sur site n'avait aucun chemin vers la ligne, sinon la création d'une entrée
 * au référentiel pour une valeur qui ne concerne qu'une saisie.</p>
 */
describe('Formulaires de mesure — harmonisation', () => {

  /** Réponse du référentiel, telle que la base la rend réellement. */
  const REFERENTIEL = [
    {
      id: 1, factorValue: 2.68, unit: 'L', dataType: 'PHYSIQUE', currency: null,
      databaseSource: 'MISFAT_INTERNE', referenceYear: 2026, validityLabel: null,
      carbonReference: {
        referenceCode: 'FFFFT', typeName: 'Farah',
        category: { name: 'Combustion dans les établissements', scope: { code: 'SCOPE_1' } }
      }
    },
    {
      id: 2, factorValue: 0.56, unit: 'L', dataType: 'PHYSIQUE', currency: null,
      databaseSource: 'MISFAT_INTERNE', referenceYear: 2026, validityLabel: null,
      carbonReference: {
        referenceCode: 'ETABVEH', typeName: 'ETAB22FF',
        category: { name: 'Combustion des véhicules', scope: { code: 'SCOPE_1' } }
      }
    },
    {
      id: 3, factorValue: 0.21, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
      databaseSource: 'EPA 2024', referenceYear: 2026, validityLabel: null,
      carbonReference: {
        referenceCode: 'MS1COC', typeName: 'Diesel medium and heavy duty truck',
        category: { name: 'Company owned cars', scope: { code: 'SCOPE_1' } }
      }
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  /**
   * Écrans montés par le banc en cours.
   *
   * <p>Ils sont détruits après chaque test. Un écran laissé vivant conserve ses
   * abonnements aux relais de module — périmètre, saisies — qui survivent au
   * banc : la prochaine émission le réveillerait, et sa requête retomberait
   * dans le banc suivant, qui la compterait comme sienne.</p>
   */
  let montes: ComponentFixture<unknown>[] = [];

  afterEach(() => {
    for (const fixture of montes) fixture.destroy();
    montes = [];
  });

  /** Monte un écran et sert le référentiel à toutes ses demandes. */
  function monter<T>(composant: Type<T>): T {
    const fixture = TestBed.createComponent(composant);
    montes.push(fixture);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;

      for (const requete of attente) {
        requete.flush(requete.request.url.includes('emission-factors') ? REFERENTIEL : []);
      }
      fixture.detectChanges();
    }

    return fixture.componentInstance;
  }

  describe('Scope 1 — Combustion dans les établissements', () => {

    it('propose la source créée au référentiel', () => {
      // Le cas signalé : « FFFFT » a un facteur en base et n'apparaissait pas.
      const ecran = monter(EmissionListComponent);

      expect(ecran.sourcesReferentiel.map(s => s.nom)).toContain('Farah');
      expect(ecran.sourcesReferentiel.find(s => s.nom === 'Farah')?.libelle)
        .toBe('Farah — FFFFT');
    });

    it('n\'emprunte pas la source d\'un autre poste', () => {
      const ecran = monter(EmissionListComponent);

      expect(ecran.sourcesReferentiel.map(s => s.nom)).not.toContain('ETAB22FF');
    });

    it('garde les sources de secours dans un groupe distinct', () => {
      // Elles répondent encore aux facteurs de secours ; les retirer réduirait
      // la saisie sans que personne l'ait demandé.
      const ecran = monter(EmissionListComponent);

      expect(ecran.sourcesAutres).toContain('Gaz naturel');
      expect(ecran.sourcesReferentiel.map(s => s.nom)).not.toContain('Gaz naturel');
    });
  });

  describe('Scope 1 — Combustion des véhicules', () => {

    it('propose la source créée au référentiel', () => {
      const ecran = monter(CombustionVehiculesComponent);

      expect(ecran.sourcesReferentiel.map(s => s.nom)).toContain('ETAB22FF');
      expect(ecran.sourcesReferentiel.find(s => s.nom === 'ETAB22FF')?.libelle)
        .toBe('ETAB22FF — ETABVEH');
    });

    it('réunit les deux nomenclatures du poste', () => {
      // La base porte « Combustion des véhicules » et « Company owned cars » :
      // l'ancienne intersection avec la liste écrite éliminait la première.
      const ecran = monter(CombustionVehiculesComponent);

      expect(ecran.sourcesReferentiel.map(s => s.nom).sort())
        .toEqual(['Diesel medium and heavy duty truck', 'ETAB22FF']);
    });

    it('ne retire plus une source que la liste écrite ignorait', () => {
      // L'écran interrogeait l'API puis intersectait sa réponse avec sa liste :
      // l'appel ne pouvait que retirer des options, jamais en apporter.
      const ecran = monter(CombustionVehiculesComponent);

      expect(ecran.sourcesEmissionList).toContain('ETAB22FF');
    });
  });

  describe('facteur appliqué, saisissable partout', () => {

    it('applique la valeur saisie plutôt que celle de la base', () => {
      const ecran = monter(FranchisesComponent);
      ecran.facteurApplique = 0.42;

      expect(ecran.facteurCourant.valeur).toBe(0.42);
    });

    it('revient à la base quand le champ est vidé', () => {
      // Un champ qu'on vide pour le ressaisir n'est pas un facteur nul : le
      // traiter comme tel annulerait l'émission sans qu'on l'ait décidé.
      const ecran = monter(FranchisesComponent);
      const base = ecran.facteurCourant.valeur;

      ecran.facteurApplique = null;
      expect(ecran.facteurCourant.valeur).toBe(base);

      ecran.facteurApplique = 0;
      expect(ecran.facteurCourant.valeur).toBe(base);
    });

    it('reporte la valeur saisie sur le calcul en direct', () => {
      const ecran = monter(FranchisesComponent);
      ecran.formModel.approche = 'Par site';
      ecran.formModel.quantite = 10;
      ecran.facteurApplique = 3;

      expect(ecran.emissionPrevisionnelle).toBe(30);
    });
  });
});
