import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ActifsLouesAmontComponent } from './actifs-loues-amont';

/**
 * Rendu du composant, note d'information et box de calcul en direct.
 */
describe('ActifsLouesAmontComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActifsLouesAmontComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  /** Monte le composant en répondant au référentiel avec les facteurs fournis. */
  const monter = (facteurs: unknown[] = []) => {
    const fixture = TestBed.createComponent(ActifsLouesAmontComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(facteurs));
    fixture.detectChanges();
    return fixture;
  };

  /** Facteur au format brut de l'API, tel que le service le reçoit. */
  const FACTEUR_BATIMENT = {
    id: 1,
    factorValue: 0.398,
    unit: 'kWh',
    dataType: 'PHYSIQUE',
    currency: null,
    databaseSource: 'DESNZ 2024',
    referenceYear: 2024,
    validityLabel: null,
    carbonReference: {
      referenceCode: 'MS3C8UL',
      typeName: 'Leased building electricity',
      category: { name: 'Category 8: Upstream leased assets', scope: { code: 'SCOPE_3' } }
    }
  };

  it('affiche la note d\'information de la catégorie 8', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.note-titre')?.textContent)
      .toContain('Note d\'information — Scope 3 (Catégorie 8 : Actifs Loués en Amont)');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('équipements industriels loués');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('dont l\'entreprise n\'est pas propriétaire');
  });

  it('rend ses douze colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Actifs loués en amont');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(15);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('signale un référentiel vide et applique les replis ADEME', () => {
    const fixture = monter([]);
    const composant = fixture.componentInstance;

    expect(composant.avertissementReferentiel).toContain('repli ADEME');

    composant.ouvrirModale();
    composant.formModel.typeActif = 'Bâtiment';
    composant.formModel.modeSaisie = 'Surface';
    composant.onModeSaisieChange();
    composant.formModel.quantite = 300;
    composant.formModel.ratioOccupation = 100;

    // 300 m² × 120 kWh/m² × 100 % = 36 000 kWh/an
    expect(composant.quantiteAjusteePrevisionnelle).toBe(36000);
    expect(composant.uniteAjusteeCourante).toBe('kWh');

    // 36 000 kWh × 0,420 = 15 120,00 kgCO₂e
    expect(composant.facteurCourant.origine).toBe('ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.420);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(15120, 2);
  });

  it('préfère le facteur MS SQL quand le référentiel le documente', () => {
    const composant = monter([FACTEUR_BATIMENT]).componentInstance;

    expect(composant.avertissementReferentiel).toBe('');

    composant.ouvrirModale();
    composant.formModel.typeActif = 'Bâtiment';
    composant.formModel.modeSaisie = 'Consommation';
    composant.onModeSaisieChange();
    composant.formModel.quantite = 10000;

    expect(composant.facteurCourant.origine).toBe('MS SQL BDD');
    expect(composant.facteurCourant.valeur).toBe(0.398);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(3980, 2);
  });

  it('commande l\'unité par le mode de saisie', () => {
    const composant = monter().componentInstance;
    composant.ouvrirModale();

    composant.formModel.modeSaisie = 'Surface';
    composant.onModeSaisieChange();
    expect(composant.unitesDisponibles).toEqual(['m²']);
    expect(composant.formModel.unite).toBe('m²');

    composant.formModel.modeSaisie = 'Monétaire';
    composant.onModeSaisieChange();
    expect(composant.unitesDisponibles).toEqual(['TND', 'EUR']);
    expect(composant.formModel.unite).toBe('TND');
  });

  it('applique le taux d\'occupation à une consommation directe', () => {
    const composant = monter().componentInstance;
    composant.ouvrirModale();

    composant.formModel.typeActif = 'Véhicule Leasing';
    composant.formModel.modeSaisie = 'Consommation';
    composant.onModeSaisieChange();
    composant.formModel.unite = 'km';
    composant.onCritereChange();
    composant.formModel.quantite = 45000;
    composant.formModel.ratioOccupation = 50;

    expect(composant.quantiteAjusteePrevisionnelle).toBe(22500);
    // 22 500 km × 0,192 = 4 320 kgCO₂e
    expect(composant.emissionPrevisionnelle).toBeCloseTo(4320, 2);
  });

  it('refuse une saisie sans désignation ou sans quantité', () => {
    const composant = monter().componentInstance;
    composant.ouvrirModale();

    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('désignation');
    expect(composant.listeEmissions.length).toBe(0);

    composant.formModel.designation = 'Plateau bureaux';
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('quantité');

    composant.formModel.quantite = 300;
    // La période est désormais exigée : sans elle, la mesure serait rattachée
    // à son année de saisie et disparaîtrait du bilan qu'elle documente.
    composant.formModel.dateDebut = '2025-01-01';
    composant.formModel.dateFin = '2025-12-31';
    composant.enregistrerEmission();
    expect(composant.listeEmissions.length).toBe(1);
    // Une référence absente est engendrée : l'actif reste traçable.
    expect(composant.listeEmissions[0].reference).toBe('ACT-0001');
    expect(composant.listeEmissions[0].provenance).toBe('Réel');
  });

  it('ferme la notification d\'import sur demande', () => {
    const composant = monter().componentInstance;

    composant.toastMessage = 'Importation de 3 actifs loués effectuée avec succès !';
    composant.fermerToast();
    expect(composant.toastMessage).toBe('');
  });
});
