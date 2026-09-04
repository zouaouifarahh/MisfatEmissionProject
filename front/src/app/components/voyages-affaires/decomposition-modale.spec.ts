import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { VoyagesAffairesComponent } from './voyages-affaires';

/**
 * Décomposition affichée par la modale de saisie d'une mission.
 *
 * <p>La distance saisie est celle de l'aller, et le calcul la double. L'aperçu
 * annonçait pourtant « Distance × Facteur × Participants » : le total valait
 * deux fois ce que la formule affichée laissait attendre, et rien ne permettait
 * de savoir si c'était voulu.</p>
 *
 * <p>Ces épreuves tiennent moins à la mise en page qu'à un accord : ce que la
 * modale montre étape par étape doit rendre exactement le total qu'elle
 * annonce. Une décomposition qui dérive du calcul serait pire que pas de
 * décomposition du tout — elle donnerait à vérifier une chose fausse.</p>
 */
describe('Voyages — décomposition aller-retour de la modale', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoyagesAffairesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  const monter = () => {
    const fixture = TestBed.createComponent(VoyagesAffairesComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /** Renseigne le formulaire d'une mission valorisée à la distance. */
  const saisir = (composant: VoyagesAffairesComponent, champs: {
    distanceKm: number; participants: number; facteur: number;
  }) => {
    composant.formModel.monetaire = false;
    composant.formModel.distanceKm = champs.distanceKm;
    composant.formModel.participants = champs.participants;
    composant.formModel.facteur = champs.facteur;
  };

  it("double la distance de l'aller", () => {
    const composant = monter().componentInstance;
    saisir(composant, { distanceKm: 1_200, participants: 1, facteur: 0.1 });

    const detail = composant.detailAllerRetour!;
    expect(detail.aller).toBe(1_200);
    expect(detail.trajets).toBe(2);
    expect(detail.total).toBe(2_400);
  });

  it('rend le total que la modale annonce', () => {
    const composant = monter().componentInstance;
    saisir(composant, { distanceKm: 1_200, participants: 3, facteur: 0.13 });

    const d = composant.detailAllerRetour!;

    // (1 200 × 2) × 3 × 0,13 = 936 kgCO₂e
    expect(d.total * d.participants * composant.formModel.facteur!)
      .toBeCloseTo(composant.emissionPrevisionnelle, 8);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(936, 8);
  });

  it('compte un participant quand le nombre est absent ou nul', () => {
    const composant = monter().componentInstance;
    saisir(composant, { distanceKm: 500, participants: 0, facteur: 0.2 });

    // Une mission sans participant déclaré reste la mission d'une personne :
    // la compter pour zéro effacerait le trajet du bilan.
    expect(composant.detailAllerRetour!.participants).toBe(1);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(500 * 2 * 0.2, 8);
  });

  it('ne double pas une valorisation au montant facturé', () => {
    const composant = monter().componentInstance;
    composant.formModel.monetaire = true;
    composant.formModel.montant = 4_000;
    composant.formModel.facteur = 0.25;

    // Un montant de mission couvre déjà le billet entier : la décomposition
    // n'a pas lieu d'être, et le total n'est pas doublé.
    expect(composant.detailAllerRetour).toBeNull();
    expect(composant.emissionPrevisionnelle).toBeCloseTo(1_000, 8);
  });

  it('se tait tant que la distance manque', () => {
    const composant = monter().componentInstance;
    saisir(composant, { distanceKm: 0, participants: 2, facteur: 0.1 });

    expect(composant.detailAllerRetour).toBeNull();
  });
});
