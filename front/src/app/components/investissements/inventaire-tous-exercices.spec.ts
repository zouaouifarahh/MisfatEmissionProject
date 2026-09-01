import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { InvestissementsComponent } from './investissements';

/**
 * Inventaire des immobilisations : tous les exercices, toujours.
 *
 * <p>Cet écran ne tient pas un relevé d'exercice mais un patrimoine. Un actif
 * acquis en 2019 reste détenu en 2026, et le masquer parce que l'en-tête
 * affiche un autre millésime revient à nier qu'on le possède. Le cloisonnement
 * par exercice, qui vaut pour les dix-huit autres écrans, est levé ici — sur
 * décision de l'exploitante, et sur ce seul écran.</p>
 *
 * <p>Conséquence assumée : le total de cet écran ne s'accorde plus avec celui
 * du tableau de bord pour un exercice donné. Le tableau de bord, lui, continue
 * de ventiler chaque ligne sur l'année qu'elle documente.</p>
 */
describe('Investissements — inventaire indépendant de l\'exercice consulté', () => {

  const ligne = (id: number, annee: number) => ({
    id, scope: 'SCOPE_3', categorie: 'Investissements',
    reference: 'IMMO' + id, designation: 'Machine ' + id,
    montant: 1000, devise: 'TND', quantite: 1000,
    facteur: 0.25, emissionCalculee: 250,
    dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31`,
    creeLe: '', provenance: 'Excel'
  });

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    localStorage.clear();
    // Un inventaire reparti sur quatre exercices, dont un seul est consulte.
    localStorage.setItem('listeEmissionsInvestissements', JSON.stringify([
      ligne(1, 2019), ligne(2, 2024), ligne(3, 2025), ligne(4, 2026)
    ]));

    await TestBed.configureTestingModule({
      imports: [InvestissementsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  function monter(): InvestissementsComponent {
    const fixture = TestBed.createComponent(InvestissementsComponent);
    fixtures.push(fixture);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) requete.flush([]);
      fixture.detectChanges();
    }

    return fixture.componentInstance;
  }

  it('retient toutes les immobilisations, quel que soit leur millésime', () => {
    const ecran = monter();
    ecran.exerciceActif = 2026;

    expect(ecran.lignesDuPerimetre).toHaveLength(4);
  });

  it('ne masque rien quand l\'en-tête change d\'exercice', () => {
    // C'est le defaut signale : place sur 2026, l'ecran annoncait « 4 350
    // lignes documentent un autre exercice » et n'en montrait aucune.
    const ecran = monter();

    for (const annee of [2019, 2024, 2025, 2026]) {
      ecran.exerciceActif = annee;
      expect(ecran.lignesDuPerimetre).toHaveLength(4);
    }
  });

  it('ne parle plus d\'exercice sous le tableau', () => {
    const ecran = monter();
    ecran.exerciceActif = 2026;

    expect(ecran.messagePerimetre).not.toContain('autre exercice');
  });

  it('garde le cloisonnement par société', () => {
    // La levee ne porte que sur l'exercice : une ligne d'une autre societe
    // reste ecartee, et le tri ne redevient pas silencieux pour autant.
    const ecran = monter();
    ecran.societeActiveId = 1;
    ecran.filiales = [
      { id: 1, libelle: 'MISFAT TUNISIE' }, { id: 2, libelle: 'MISFAT MAROC' }
    ] as never[];

    localStorage.setItem('listeEmissionsInvestissements', JSON.stringify([
      { ...ligne(1, 2026), societeId: 1 },
      { ...ligne(2, 2026), societeId: 2 }
    ]));
    ecran.listeEmissions = JSON.parse(
      localStorage.getItem('listeEmissionsInvestissements') ?? '[]');

    expect(ecran.lignesDuPerimetre).toHaveLength(1);
    expect(ecran.messagePerimetre).toContain('autre société');
  });

  it('compte l\'inventaire entier dans les indicateurs', () => {
    const ecran = monter();
    ecran.exerciceActif = 2026;

    // Quatre lignes a 250 kgCO2e : les cartes portent le total importe, non
    // la part d'une seule annee.
    expect(ecran.emissionsFiltrees).toHaveLength(4);
  });
});
