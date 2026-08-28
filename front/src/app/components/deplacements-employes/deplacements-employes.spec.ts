import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DeplacementsEmployesComponent } from './deplacements-employes';
import { JOURS_TRAVAILLES_DEFAUT } from '../../shared/mobilite/modes-transport';

/**
 * Rendu du composant, note d'information et box de calcul en direct.
 */
describe('DeplacementsEmployesComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeplacementsEmployesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  /** Monte le composant en répondant au référentiel avec les facteurs fournis. */
  const monter = (facteurs: unknown[] = []) => {
    const fixture = TestBed.createComponent(DeplacementsEmployesComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(facteurs));
    fixture.detectChanges();
    return fixture;
  };

  /**
   * Facteur au format brut de l'API.
   *
   * <p>{@code getFactorsByCategory} filtre sur `carbonReference.category.name`
   * puis aplatit la réponse : le test doit fournir la forme que le service
   * reçoit réellement, non celle qu'il produit.</p>
   */
  const FACTEUR_VOITURE = {
    id: 1,
    factorValue: 0.2650910823,
    unit: 'Km',
    dataType: 'PHYSIQUE',
    currency: null,
    databaseSource: 'DESNZ 2024',
    referenceYear: 2024,
    validityLabel: null,
    carbonReference: {
      referenceCode: 'MS3C7ECAGC',
      typeName: 'Average gasoline cars',
      category: { name: 'Category 7: Employee Commuting', scope: { code: 'SCOPE_3' } }
    }
  };

  it('affiche la note d\'information de la catégorie 7', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.note-titre')?.textContent)
      .toContain('Note d\'information — Scope 3 (Catégorie 7)');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('trajets récurrents effectués quotidiennement par les salariés');
  });

  it('rend ses dix colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Déplacements des employés');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(12);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('calcule le kilométrage annuel et les émissions en direct', () => {
    const composant = monter([FACTEUR_VOITURE]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.mode = 'Voiture';
    composant.onModeChange();
    composant.formModel.distanceAllerKm = 15;
    composant.formModel.joursTravailles = 220;
    composant.formModel.covoiturage = 1;

    // 15 km × 2 × 220 jours = 6 600 km/an
    expect(composant.kmAnnuelsPrevisionnels).toBe(6600);

    // Le facteur MS SQL prime sur le repli.
    expect(composant.facteurCourant.origine).toBe('MS SQL');
    expect(composant.facteurCourant.baseAppliquee).toBe('DESNZ 2024');
    expect(composant.emissionPrevisionnelle).toBeCloseTo(6600 * 0.2650910823, 2);

    // Le covoiturage répartit les émissions entre les occupants.
    composant.formModel.covoiturage = 2;
    expect(composant.kmAnnuelsPrevisionnels).toBe(3300);
  });

  it('applique le repli ADEME quand le référentiel est vide', () => {
    const composant = monter([]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.mode = 'Voiture';
    composant.onModeChange();
    composant.formModel.distanceAllerKm = 15;
    composant.formModel.joursTravailles = 220;

    expect(composant.facteurCourant.origine).toBe('Repli ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.192);
    // 6 600 km × 0,192 = 1 267,20 kgCO₂e
    expect(composant.emissionPrevisionnelle).toBeCloseTo(1267.2, 2);
  });

  it('refuse une saisie sans matricule, sans nom ou sans distance', () => {
    const composant = monter([FACTEUR_VOITURE]).componentInstance;

    composant.ouvrirModale();
    composant.enregistrerEmission();
    expect(composant.erreurFormulaire).toBe(true);
    expect(composant.listeEmissions.length).toBe(0);

    composant.formModel.matricule = 'M001';
    composant.formModel.employe = 'AHMED BEN ALI';
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('distance');

    composant.formModel.distanceAllerKm = 15;
    composant.enregistrerEmission();
    expect(composant.listeEmissions.length).toBe(1);
    // 15 km aller × 2 × jours travaillés, seul occupant. La constante est lue
    // plutôt que recopiée : un chiffre en dur ferait échouer ce banc au
    // prochain arbitrage sur les jours travaillés, sans rien apprendre.
    expect(composant.listeEmissions[0].kmAnnuels).toBe(15 * 2 * JOURS_TRAVAILLES_DEFAUT);
    expect(composant.listeEmissions[0].provenance).toBe('Réel');
  });

  it('ferme la notification d\'import sur demande', () => {
    const composant = monter().componentInstance;

    composant.toastMessage = 'Importation de 12 lignes effectuée avec succès !';
    composant.fermerToast();
    expect(composant.toastMessage).toBe('');
  });
});
