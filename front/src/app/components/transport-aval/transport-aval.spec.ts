import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { TransportAvalComponent } from './transport-aval';

/**
 * Rendu du composant, note d'information et box de calcul en direct.
 */
describe('TransportAvalComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportAvalComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  /** Monte le composant en répondant au référentiel avec les facteurs fournis. */
  const monter = (facteurs: unknown[] = []) => {
    const fixture = TestBed.createComponent(TransportAvalComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(facteurs));
    fixture.detectChanges();
    return fixture;
  };

  /** Facteur au format brut de l'API, tel que le service le reçoit. */
  const FACTEUR_MARITIME = {
    id: 1,
    factorValue: 0.0136313219,
    unit: 'TND',
    dataType: 'MONETAIRE',
    currency: 'TND',
    databaseSource: 'EPA-ORD 2024',
    referenceYear: 2024,
    validityLabel: null,
    carbonReference: {
      referenceCode: 'MS3C9SOFS',
      typeName: 'Ocean Freight, Spend',
      category: { name: 'Category 9: Shipping', scope: { code: 'SCOPE_3' } }
    }
  };

  it('affiche la note d\'information et la règle de distinction', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.note-titre')?.textContent)
      .toContain('Note d\'information — Scope 3 (Catégorie 9 : Transport & Distribution Aval)');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('n\'est PAS payée par l\'entreprise');
    // La règle évite un double comptage avec la catégorie 4.
    expect(hote.querySelector('.note-regle')?.textContent)
      .toContain('Catégorie 4 (Transport Amont)');
  });

  it('rend ses dix colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Transport et distribution en aval');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(12);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('calcule les tonnes-kilomètres et les émissions en direct', () => {
    const composant = monter([]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.mode = 'Routier';
    composant.onModeChange();
    composant.formModel.poidsTonnes = 12.5;
    composant.formModel.distanceKm = 400;

    // 12,5 tonnes × 400 km = 5 000 t.km
    expect(composant.tonneKmPrevisionnel).toBe(5000);
    expect(composant.uniteQuantiteCourante).toBe('t.km');

    // 5 000 t.km × 0,088 = 440,00 kgCO₂e
    expect(composant.facteurCourant.origine).toBe('ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.088);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(440, 2);
  });

  it('applique le repli propre à chaque mode de fret', () => {
    const composant = monter([]).componentInstance;
    composant.ouvrirModale();
    composant.formModel.poidsTonnes = 10;
    composant.formModel.distanceKm = 1000;

    composant.formModel.mode = 'Aérien';
    composant.onModeChange();
    // 10 000 t.km × 1,090 = 10 900 kgCO₂e
    expect(composant.emissionPrevisionnelle).toBeCloseTo(10900, 2);

    composant.formModel.mode = 'Ferroviaire';
    composant.onModeChange();
    expect(composant.emissionPrevisionnelle).toBeCloseTo(220, 2);
  });

  it('préfère le facteur MS SQL au repli sur le fret maritime monétaire', () => {
    const composant = monter([FACTEUR_MARITIME]).componentInstance;

    expect(composant.avertissementReferentiel).toBe('');

    composant.ouvrirModale();
    composant.formModel.mode = 'Maritime';
    composant.changerBaseCalcul(true);
    composant.formModel.montant = 15000;

    expect(composant.facteurCourant.origine).toBe('MS SQL BDD');
    expect(composant.facteurCourant.valeur).toBeCloseTo(0.0136313219, 8);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(204.47, 2);

    // Le même mode en physique reste sur le repli tonne-kilomètre.
    composant.changerBaseCalcul(false);
    expect(composant.facteurCourant.origine).toBe('ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.016);
  });

  it('refuse une saisie sans destination, sans poids ou sans distance', () => {
    const composant = monter([]).componentInstance;
    composant.ouvrirModale();

    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('destination');
    expect(composant.listeEmissions.length).toBe(0);

    composant.formModel.destination = 'FILTRATION GROUP GMBH';
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('poids');

    composant.formModel.poidsTonnes = 12.5;
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('distance');

    composant.formModel.distanceKm = 400;
    composant.enregistrerEmission();
    expect(composant.listeEmissions.length).toBe(1);
    // Un identifiant absent est engendré : l'expédition reste traçable.
    expect(composant.listeEmissions[0].idExpedition).toBe('EXP-0001');
    expect(composant.listeEmissions[0].tonneKm).toBe(5000);
    expect(composant.listeEmissions[0].emissionCalculee).toBeCloseTo(440, 2);
  });

  it('ferme les notifications d\'import sur demande', () => {
    const composant = monter().componentInstance;

    composant.toastMessage = 'Importation de 3 expéditions effectuée avec succès !';
    composant.toastSecondaire = '3 expédition(s) valorisée(s) par un facteur de repli ADEME.';
    composant.fermerToast();

    expect(composant.toastMessage).toBe('');
    expect(composant.toastSecondaire).toBe('');
  });
});
