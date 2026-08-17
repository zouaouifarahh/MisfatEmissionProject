import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { TransformationProduitsComponent } from './transformation-produits';

/**
 * Rendu du composant, note d'information, déclaration de non-applicabilité et
 * calculatrice en direct.
 */
describe('TransformationProduitsComponent', () => {

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TransformationProduitsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  const monter = (facteurs: unknown[] = []) => {
    const fixture = TestBed.createComponent(TransformationProduitsComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush(facteurs));
    fixture.detectChanges();
    return fixture;
  };

  it('affiche la note d\'information et la remarque sur les produits finis', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.note-titre')?.textContent)
      .toContain('Note d\'information — Scope 3 (Catégorie 10 : Transformation des produits vendus)');
    expect(hote.querySelector('.note-texte')?.textContent)
      .toContain('transformation ultérieure de produits intermédiaires (semi-finis)');
    expect(hote.querySelector('.note-regle')?.textContent)
      .toContain('les émissions de cette catégorie sont nulles (0 kgCO₂e)');
  });

  it('rend ses onze colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent)
      .toContain('Transformation des produits vendus');
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(11);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('consigne la déclaration « catégorie non applicable »', () => {
    const composant = monter().componentInstance;

    expect(composant.nonApplicable).toBe(false);
    composant.basculerNonApplicable();

    expect(composant.nonApplicable).toBe(true);
    // La position doit survivre à la fermeture de la page.
    expect(localStorage.getItem('transformationNonApplicable')).toBe('true');
    expect(composant.contradictionDeclaration).toBe(false);
  });

  it('signale une déclaration contredite par les lignes saisies', () => {
    const composant = monter().componentInstance;

    composant.ouvrirModale();
    composant.formModel.produit = 'Composants métalliques';
    composant.formModel.procede = 'Usinage / Découpe';
    composant.formModel.quantite = 5000;
    composant.formModel.unite = 'kg';
    composant.enregistrerEmission();

    expect(composant.listeEmissions.length).toBe(1);

    composant.basculerNonApplicable();
    // Déclarer la catégorie sans objet tout en y consignant des lignes rendrait
    // le bilan incohérent : la contradiction doit remonter.
    expect(composant.contradictionDeclaration).toBe(true);
  });

  it('calcule les émissions en direct avec les replis ADEME', () => {
    const composant = monter([]).componentInstance;

    expect(composant.avertissementReferentiel).toContain('repli ADEME');

    composant.ouvrirModale();
    composant.formModel.procede = 'Usinage / Découpe';
    composant.formModel.unite = 'kg';
    composant.onCritereChange();
    composant.formModel.quantite = 5000;

    // 5 000 kg × 0,120 = 600,00 kgCO₂e
    expect(composant.grandeurPrevisionnelle).toBe(5000);
    expect(composant.uniteGrandeurCourante).toBe('kg');
    expect(composant.facteurCourant.origine).toBe('ADEME');
    expect(composant.facteurCourant.valeur).toBe(0.120);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(600, 2);
  });

  it('convertit les tonnes en kilogrammes avant valorisation', () => {
    const composant = monter([]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.procede = 'Moulage / Extrusion';
    composant.formModel.unite = 'Tonnes';
    composant.onCritereChange();
    composant.formModel.quantite = 2;

    // 2 t → 2 000 kg × 0,250 = 500,00 kgCO₂e
    expect(composant.grandeurPrevisionnelle).toBe(2000);
    expect(composant.uniteGrandeurCourante).toBe('kg');
    expect(composant.emissionPrevisionnelle).toBeCloseTo(500, 2);
  });

  it('valorise un produit fini à zéro', () => {
    const composant = monter([]).componentInstance;

    composant.ouvrirModale();
    composant.formModel.procede = 'Produit Fini Direct';
    composant.formModel.unite = 'Unités';
    composant.onCritereChange();
    composant.formModel.quantite = 50000;

    expect(composant.facteurCourant.valeur).toBe(0);
    expect(composant.emissionPrevisionnelle).toBe(0);
  });

  it('refuse une saisie sans désignation ou sans quantité', () => {
    const composant = monter([]).componentInstance;
    composant.ouvrirModale();

    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('désignation');
    expect(composant.listeEmissions.length).toBe(0);

    composant.formModel.produit = 'Composants métalliques';
    composant.enregistrerEmission();
    expect(composant.messageErreur).toContain('quantité');

    composant.formModel.quantite = 5000;
    composant.enregistrerEmission();
    expect(composant.listeEmissions.length).toBe(1);
    // Une référence absente est engendrée : le produit reste traçable.
    expect(composant.listeEmissions[0].reference).toBe('TRF-0001');
  });

  it('ferme les notifications d\'import sur demande', () => {
    const composant = monter().componentInstance;

    composant.toastMessage = 'Importation de 4 transformations effectuée avec succès !';
    composant.toastSecondaire = '4 ligne(s) valorisée(s) par un facteur de repli ADEME.';
    composant.fermerToast();

    expect(composant.toastMessage).toBe('');
    expect(composant.toastSecondaire).toBe('');
  });
});
