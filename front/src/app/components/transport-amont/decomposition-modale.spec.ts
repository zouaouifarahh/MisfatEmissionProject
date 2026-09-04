import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { TransportAmontComponent } from './transport-amont';
import { POIDS_MOYEN_FILTRE_KG, libelleFormule } from './transport-facteur';

/**
 * Décomposition affichée par la modale de saisie d'une expédition.
 *
 * <p>Trois multiplications séparent la quantité expédiée de l'émission :
 * la quantité devient un tonnage, le tonnage devient des tonnes-kilomètres,
 * et celles-ci rencontrent le facteur. L'aperçu n'en montrait que le résultat,
 * si bien qu'un total surprenant ne disait pas lequel des trois nombres le
 * rendait tel.</p>
 *
 * <p>Ces épreuves tiennent à un accord : ce que la modale montre étape par
 * étape doit rendre exactement le total qu'elle annonce.</p>
 */
describe('Transport amont — décomposition tonne-kilomètre de la modale', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransportAmontComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  const monter = () => {
    const fixture = TestBed.createComponent(TransportAmontComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /** Renseigne une expédition valorisée à la tonne-kilomètre. */
  const saisir = (composant: TransportAmontComponent, champs: {
    quantite: number; poidsMoyenKg: number | null; distanceKm: number; facteur: number;
  }) => {
    composant.formModel.monetaire = false;
    composant.formModel.quantite = champs.quantite;
    composant.formModel.poidsMoyenKg = champs.poidsMoyenKg;
    composant.formModel.distanceKm = champs.distanceKm;
    composant.formModel.facteur = champs.facteur;
    composant.formModel.uniteFacteur = 't.km';
    // Le poids total suit la quantité, comme à la frappe dans le formulaire.
    composant.onSaisieChange();
  };

  it('enchaîne quantité, tonnage et tonnes-kilomètres', () => {
    const composant = monter().componentInstance;
    saisir(composant, {
      quantite: 40_000, poidsMoyenKg: 0.3, distanceKm: 1_800, facteur: 0.105
    });

    const d = composant.detailTonneKm!;

    // 40 000 × 0,3 kg × 0,001 = 12 t ; 1 800 km × 12 t = 21 600 t.km
    expect(d.poidsTotalTonnes).toBeCloseTo(12, 9);
    expect(d.tonnesKm).toBeCloseTo(21_600, 6);
  });

  it('rend le total que la modale annonce', () => {
    const composant = monter().componentInstance;
    saisir(composant, {
      quantite: 40_000, poidsMoyenKg: 0.3, distanceKm: 1_800, facteur: 0.105
    });

    const d = composant.detailTonneKm!;

    expect(d.tonnesKm * composant.formModel.facteur!)
      .toBeCloseTo(composant.emissionPrevisionnelle, 6);
    expect(composant.emissionPrevisionnelle).toBeCloseTo(2_268, 6);
  });

  it("montre le poids réellement appliqué, non le champ laissé vide", () => {
    const composant = monter().componentInstance;
    saisir(composant, {
      quantite: 40_000, poidsMoyenKg: null, distanceKm: 1_800, facteur: 0.105
    });

    // Le calcul retombe sur le poids d'un filtre : la décomposition doit dire
    // ce chiffre-là, faute de quoi elle expliquerait un total par une valeur
    // qui n'a pas servi.
    const d = composant.detailTonneKm!;
    expect(d.poidsMoyenKg).toBe(POIDS_MOYEN_FILTRE_KG);
    expect(d.poidsTotalTonnes).toBeCloseTo(8, 9);
    expect(d.tonnesKm * composant.formModel.facteur!)
      .toBeCloseTo(composant.emissionPrevisionnelle, 6);
  });

  it('se tait hors du mode tonne-kilomètre', () => {
    const composant = monter().componentInstance;
    saisir(composant, {
      quantite: 40_000, poidsMoyenKg: 0.3, distanceKm: 1_800, facteur: 0.105
    });

    // Un facteur au kilomètre n'emprunte pas cette chaîne : afficher un
    // tonnage qui ne sert à rien laisserait croire qu'il pèse sur le total.
    composant.formModel.uniteFacteur = 'km';
    expect(composant.detailTonneKm).toBeNull();
  });

  it('se tait tant que quantité ou distance manquent', () => {
    const composant = monter().componentInstance;

    saisir(composant, {
      quantite: 0, poidsMoyenKg: 0.3, distanceKm: 1_800, facteur: 0.105
    });
    expect(composant.detailTonneKm).toBeNull();

    saisir(composant, {
      quantite: 40_000, poidsMoyenKg: 0.3, distanceKm: 0, facteur: 0.105
    });
    expect(composant.detailTonneKm).toBeNull();
  });

  it('annonce la chaîne complète, et non le seul tonnage', () => {
    // « (Poids ÷ 1000) × Distance » disait le vrai sans dire d'où le poids
    // venait : l'expéditeur compte des pièces.
    expect(libelleFormule('TONNE_KM')).toBe('Distance × Quantité × Poids × 0,001 × Facteur');
  });
});
