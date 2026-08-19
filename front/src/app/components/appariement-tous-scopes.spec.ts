import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';
import { Type } from '@angular/core';

import { ActifsLouesAmontComponent } from './actifs-loues-amont/actifs-loues-amont';
import { ActifsLouesAvalComponent } from './actifs-loues-aval/actifs-loues-aval';
import { ActivitesEnergieComponent } from './activites-energie/activites-energie';
import { DechetsComponent } from './dechets/dechets';
import { DeplacementsEmployesComponent } from './deplacements-employes/deplacements-employes';
import { ElectriciteAcheteeComponent } from './electricite-achetee/electricite-achetee';
import { EmissionsRefrigerantsComponent } from './emissions-refrigerants/emissions-refrigerants';
import { FinDeVieProduitsComponent } from './fin-de-vie-produits/fin-de-vie-produits';
import { FranchisesComponent } from './franchises/franchises';
import { TransformationProduitsComponent } from './transformation-produits/transformation-produits';
import { TransportAmontComponent } from './transport-amont/transport-amont';
import { TransportAvalComponent } from './transport-aval/transport-aval';
import { UtilisationProduitsComponent } from './utilisation-produits/utilisation-produits';
import { VoyagesAffairesComponent } from './voyages-affaires/voyages-affaires';
import { InvestissementsComponent } from './investissements/investissements';
import { BiensServicesComponent } from './biens-services/biens-services';
import { BiensEquipementComponent } from './biens-equipement/biens-equipement';
import { EmissionListComponent } from './emission-list/emission-list';
import { CombustionVehiculesComponent } from './combustion-vehicules/combustion-vehicules';

/**
 * Colonnes d'appariement, présentes sur tous les scopes.
 *
 * <p>Trois écrans portaient la référence carbone ; quatorze l'ignoraient. Leurs
 * lignes affichaient un tiret et gardaient le premier facteur venu de leur
 * catégorie, sans qu'aucun écran ne le signale. Ce banc parcourt les dix-sept
 * et vérifie sur le DOM rendu — non sur le code — que chacun expose désormais la
 * référence et le code article.</p>
 *
 * <p>Il vaut aussi garde-fou : un écran ajouté plus tard sans ces colonnes
 * ferait échouer la liste, au lieu de repartir en silence avec des tirets.</p>
 */
describe('Appariement au référentiel — tous les scopes', () => {

  /** Les dix-neuf écrans de collecte, avec le scope qu'ils documentent. */
  const ECRANS: Array<{ scope: string; nom: string; composant: Type<unknown> }> = [
    { scope: 'Scope 1', nom: 'Combustion dans les usines', composant: EmissionListComponent },
    { scope: 'Scope 1', nom: 'Combustion des véhicules', composant: CombustionVehiculesComponent },
    { scope: 'Scope 1', nom: 'Émissions de réfrigérants', composant: EmissionsRefrigerantsComponent },
    { scope: 'Scope 2', nom: 'Électricité achetée', composant: ElectriciteAcheteeComponent },
    { scope: 'Scope 3 · 1', nom: 'Biens et services achetés', composant: BiensServicesComponent },
    { scope: 'Scope 3 · 2', nom: 'Biens d\'équipement', composant: BiensEquipementComponent },
    { scope: 'Scope 3 · 3', nom: 'Activités énergétiques', composant: ActivitesEnergieComponent },
    { scope: 'Scope 3 · 4', nom: 'Transport en amont', composant: TransportAmontComponent },
    { scope: 'Scope 3 · 5', nom: 'Déchets', composant: DechetsComponent },
    { scope: 'Scope 3 · 6', nom: 'Voyages d\'affaires', composant: VoyagesAffairesComponent },
    { scope: 'Scope 3 · 7', nom: 'Déplacements employés', composant: DeplacementsEmployesComponent },
    { scope: 'Scope 3 · 8', nom: 'Actifs loués en amont', composant: ActifsLouesAmontComponent },
    { scope: 'Scope 3 · 9', nom: 'Transport en aval', composant: TransportAvalComponent },
    { scope: 'Scope 3 · 10', nom: 'Transformation des produits', composant: TransformationProduitsComponent },
    { scope: 'Scope 3 · 11', nom: 'Utilisation des produits', composant: UtilisationProduitsComponent },
    { scope: 'Scope 3 · 12', nom: 'Fin de vie des produits', composant: FinDeVieProduitsComponent },
    { scope: 'Scope 3 · 13', nom: 'Actifs loués en aval', composant: ActifsLouesAvalComponent },
    { scope: 'Scope 3 · 14', nom: 'Franchises', composant: FranchisesComponent },
    { scope: 'Scope 3 · 15', nom: 'Investissements', composant: InvestissementsComponent }
  ];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
  });

  /** Monte un écran et sert à vide les requêtes qu'il déclenche. */
  const monter = (composant: Type<unknown>) => {
    const fixture = TestBed.createComponent(composant);
    fixture.detectChanges();

    for (let passe = 0; passe < 3; passe++) {
      const attente = TestBed.inject(HttpTestingController).match(() => true);
      if (!attente.length) break;
      attente.forEach(r => r.flush([]));
      fixture.detectChanges();
    }
    return fixture.nativeElement as HTMLElement;
  };

  const entetes = (hote: HTMLElement): string[] =>
    [...hote.querySelectorAll('.data-table thead th')].map(th => th.textContent?.trim() ?? '');

  for (const { scope, nom, composant } of ECRANS) {

    it(`${scope} — ${nom} expose la référence carbone et le code article ERP`, () => {
      const colonnes = entetes(monter(composant));

      // Un entête triable porte son icône de tri à la suite du libellé : on
      // vérifie le début, non l'égalité stricte.
      expect(colonnes.length).toBeGreaterThan(0);
      expect(colonnes.some(c => c.startsWith('Référence carbone'))).toBe(true);
      expect(colonnes.some(c => c.startsWith('Code article ERP'))).toBe(true);
    }, 30_000);
  }

  it('couvre les dix-neuf écrans de collecte', () => {
    // Le décompte est volontaire : ajouter un écran de collecte sans l'inscrire
    // ici le laisserait repartir avec des tirets, sans que rien ne le dise.
    // Dix-neuf, et non dix-sept : le Scope 1 en compte trois, la combustion des
    // usines et celle des véhicules étant deux écrans distincts.
    expect(ECRANS).toHaveLength(19);

    const scopes = new Set(ECRANS.map(e => e.scope.split(' · ')[0]));
    expect([...scopes].sort()).toEqual(['Scope 1', 'Scope 2', 'Scope 3']);
  });
});
