import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DechetsComponent } from './dechets';

/**
 * Fumigation du composant : instanciation, rendu du tableau et modales.
 *
 * <p>Une exception levée à l'initialisation ou pendant le rendu laisse l'écran
 * vide sans rien signaler à l'utilisateur ; ce test la fait remonter.</p>
 */
describe('DechetsComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DechetsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  const monter = () => {
    const fixture = TestBed.createComponent(DechetsComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  it('rend ses onze colonnes sans lever d\'exception', () => {
    const hote: HTMLElement = monter().nativeElement;

    expect(hote.querySelector('.emission-header h2')?.textContent).toContain('Déchets');
    // Deux colonnes de plus depuis l'appariement au référentiel : la
    // référence carbone désigne le facteur, le code article ERP en tient lieu
    // quand le référentiel et l'ERP partagent la même codification.
    expect(hote.querySelectorAll('.data-table thead th').length).toBe(13);
    expect(hote.querySelector('.empty-row')).toBeTruthy();
  });

  it('ouvre la modale de saisie', () => {
    const fixture = monter();
    fixture.componentInstance.ouvrirModale();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal-card')).toBeTruthy();
  });

  // Les tests d'estimation portent sur la logique, sans re-rendu : muter l'état
  // hors d'un vrai événement puis relancer une passe ferait remonter un NG0100
  // propre au banc d'essai, sans équivalent au clic dans le navigateur.

  it('estime une quantité par ratio de production et la reporte en saisie', () => {
    const composant = monter().componentInstance;

    composant.ouvrirModaleEstimation();
    composant.estimation.methode = 'production';
    composant.estimation.productionAnnuelle = 12000;
    composant.estimation.ratioParTonne = 4.8;

    // 12000 t produites × 4,8 kg/t = 57 600 kg, soit 57,6 tonnes.
    expect(composant.quantiteEstimee).toBeCloseTo(57.6, 3);

    composant.appliquerEstimation();

    expect(composant.formModel.quantiteTotale).toBeCloseTo(57.6, 3);
    expect(composant.formModel.unite).toBe('Tonne');
    expect(composant.formModel.provenance).toBe('Estimation');
    expect(composant.formModel.noteEstimation).toContain('4.8');
    expect(composant.modaleSaisieOuverte).toBe(true);
    expect(composant.modaleEstimationOuverte).toBe(false);
  });

  it('estime une quantité par coût de traitement', () => {
    const composant = monter().componentInstance;

    composant.ouvrirModaleEstimation();
    composant.estimation.methode = 'cout';
    composant.estimation.coutAnnuel = 42000;
    composant.estimation.prixUnitaire = 180;

    expect(composant.quantiteEstimee).toBeCloseTo(233.333, 3);

    // Une donnée manquante ne produit aucune estimation plutôt qu'un zéro.
    composant.estimation.prixUnitaire = null;
    expect(composant.quantiteEstimee).toBeNull();
  });
});
