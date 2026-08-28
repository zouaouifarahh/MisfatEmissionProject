import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { UtilisationProduitsComponent } from './utilisation-produits';
import { DashboardComponent } from '../../backoffice/components/dashboard/dashboard';

/**
 * Rendu du composant, note d'information, calculatrice en direct et câblage au
 * tableau de bord.
 */
describe('UtilisationProduitsComponent', () => {

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [UtilisationProduitsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  const monter = (facteurs: unknown[] = []) => {
    const fixture = TestBed.createComponent(UtilisationProduitsComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(facteurs));
    fixture.detectChanges();
    return fixture;
  };

  it('affiche la note d\'information et l\'application aux consommables', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.note-titre')?.textContent)
      .toContain('Note d\'information — Scope 3 (Catégorie 11 : Utilisation des produits vendus)');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('phase d\'utilisation et la durée de vie des produits vendus');
    expect(hote.querySelector('.note-regle')?.textContent)
      .toContain('durée de vie moyenne en kilométrage');
  });

  it('rend ses dix colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent)
      .toContain('Utilisation des produits vendus');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(13);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('calcule le kilométrage couvert et les émissions en direct', () => {
    const composant = monter([]).componentInstance;

    expect(composant.avertissementReferentiel).toContain('repli ADEME');

    composant.ouvrirModale();
    composant.formModel.gamme = 'Filtre à Air';
    composant.onCritereChange();
    composant.formModel.quantiteVendue = 10000;
    composant.formModel.dureeVieKm = 15000;

    // 10 000 unités × 15 000 km = 150 000 000 km·unité
    expect(composant.grandeurPrevisionnelle).toBe(150_000_000);
    expect(composant.uniteGrandeurCourante).toBe('km·unité');

    // × 0,0008 = 120 000,00 kgCO₂e
    expect(composant.facteurCourant.origine).toBe('ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.0008);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(120000, 2);
  });

  it('applique le repli propre à chaque gamme', () => {
    const composant = monter([]).componentInstance;
    composant.ouvrirModale();
    composant.formModel.quantiteVendue = 1000;
    composant.formModel.dureeVieKm = 10000;

    composant.formModel.gamme = 'Filtre Carburant';
    composant.onCritereChange();
    // 10 000 000 km·unité × 0,0012 = 12 000 kgCO₂e
    expect(composant.emissionPrevisionnelle).toBeCloseTo(12000, 2);

    composant.formModel.gamme = 'Filtre Habitacle';
    composant.onCritereChange();
    expect(composant.emissionPrevisionnelle).toBeCloseTo(2000, 2);
  });

  it('valorise au chiffre d\'affaires en approche monétaire', () => {
    const composant = monter([]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.typeSaisie = 'Monétaire';
    composant.onCritereChange();
    composant.formModel.montant = 50000;

    expect(composant.grandeurPrevisionnelle).toBe(50000);
    expect(composant.facteurCourant.valeur).toBe(0.220);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(11000, 2);
  });

  it('refuse une saisie sans quantité ou sans durée de vie', () => {
    const composant = monter([]).componentInstance;
    composant.ouvrirModale();

    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('quantité vendue');
    expect(composant.listeEmissions.length).toBe(0);

    composant.formModel.quantiteVendue = 10000;
    composant.formModel.dureeVieKm = 0;
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('durée de vie');

    composant.formModel.dureeVieKm = 15000;
    // La période est désormais exigée : sans elle, la mesure serait rattachée
    // à son année de saisie et disparaîtrait du bilan qu'elle documente.
    composant.formModel.dateDebut = '2025-01-01';
    composant.formModel.dateFin = '2025-12-31';
    composant.enregistrerEmission();
    expect(composant.listeEmissions.length).toBe(1);
    // Une référence absente est engendrée : le produit reste traçable.
    expect(composant.listeEmissions[0].reference).toBe('USE-0001');
    expect(composant.listeEmissions[0].emissionCalculee).toBeCloseTo(120000, 2);
  });

  it('ferme les notifications d\'import sur demande', () => {
    const composant = monter().componentInstance;

    composant.toastMessage = 'Importation de 3 produits en utilisation effectuée avec succès !';
    composant.toastSecondaire = '3 ligne(s) valorisée(s) par un facteur de repli ADEME.';
    composant.fermerToast();

    expect(composant.toastMessage).toBe('');
    expect(composant.toastSecondaire).toBe('');
  });
});

/**
 * Câblage au tableau de bord : la catégorie doit s'afficher au clic, et non
 * tomber sur le panneau « écran à développer ».
 */
describe('DashboardComponent — onglet utilisation-produits', () => {

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  it('déploie le composant dans main.dash-main quand la catégorie est activée', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive('utilisation-produits');
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    const composant = fixture.componentInstance;
    expect(composant.activeSub).toBe('utilisation-produits');
    expect(composant.isCategory('utilisation-produits')).toBe(true);
    expect(composant.ecranDisponible('utilisation-produits')).toBe(true);

    const hote: HTMLElement = fixture.nativeElement;
    const principal = hote.querySelector('main.dash-main');
    expect(principal).toBeTruthy();

    const ecran = principal!.querySelector('app-utilisation-produits');
    expect(ecran).toBeTruthy();
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(13);

    // Le panneau « écran à développer » ne doit plus apparaître pour elle.
    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  });
});
