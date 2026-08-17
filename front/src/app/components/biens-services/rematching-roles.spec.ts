import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BiensServicesComponent } from './biens-services';
import { DashboardComponent } from '../../backoffice/components/dashboard/dashboard';
import { CLE_ROLE } from '../../core/roles.service';

/**
 * Migration {@code misfat_ref_matching_v2}, confrontée aux rôles.
 *
 * <p>La migration rejoue l'appariement des lignes déjà saisies contre le
 * référentiel. Elle s'exécute à l'ouverture de l'écran de collecte, ce qui la
 * lie au rôle : le contributeur la déclenche, le lecteur n'atteint jamais
 * l'écran. Deux garanties doivent tenir — qu'elle corrige bien les lignes de
 * celui qui y a droit, et qu'elle ne s'exécute qu'une fois.</p>
 */
describe('misfat_ref_matching_v2 — exécution selon le rôle', () => {

  const MARQUEUR = 'misfat_ref_matching_v2_biens_services';
  const CLE_LIGNES = 'listeEmissionsAchats';

  /**
   * Référentiel servi par emission-service, dans sa forme brute.
   *
   * <p>Le service filtre sur {@code carbonReference.category.name} avant de
   * réduire chaque facteur : servir la forme déjà réduite laisserait la liste
   * vide et la migration ne partirait pas — panne muette, plutôt qu'échec.</p>
   *
   * <p>Deux facteurs de la même catégorie : la ligne à migrer porte la référence
   * du second, alors qu'elle avait été rattachée au premier — exactement le cas
   * que la migration existe pour rattraper.</p>
   */
  const categorie = {
    name: 'Category 1: Purchased goods and services',
    scope: { code: 'SCOPE_3' }
  };

  const FACTEURS = [
    {
      id: 1, factorValue: 0.310, unit: 'kg', currency: null, dataType: 'PHYSIQUE',
      databaseSource: 'ADEME', referenceYear: 2022, validityLabel: null,
      carbonReference: {
        referenceCode: 'MS3C1AAA',
        typeName: 'Category 1: Purchased goods and services',
        category: categorie
      }
    },
    {
      id: 2, factorValue: 2.480, unit: 'kg', currency: null, dataType: 'PHYSIQUE',
      databaseSource: 'EPA-ORD 2024', referenceYear: 2024, validityLabel: null,
      carbonReference: {
        referenceCode: 'MS3C1BBB',
        typeName: 'Category 1: Purchased goods and services',
        category: categorie
      }
    }
  ];

  /** Ligne enregistrée avant la migration : bon code, mauvais facteur. */
  const LIGNE_A_MIGRER = [{
    id: 1,
    etablissement: 'MISFAT I',
    designation: 'Média filtrant',
    reference: 'MS3C1BBB',
    codeArticle: 'ART-4417',
    categorieCarbone: 'Category 1: Purchased goods and services',
    quantite: 100,
    facteur: 0.310,
    databaseSource: 'ADEME',
    rapprochement: 'CATEGORIE',
    emissionCalculee: 31
  }];

  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    await TestBed.configureTestingModule({
      imports: [BiensServicesComponent, DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  }, 30_000);

  afterEach(() => {
    sessionStorage.clear();
  });

  /** Sert le référentiel puis tout le reste à vide. */
  const servirTout = () => {
    for (let passe = 0; passe < 4; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) return;

      for (const requete of attente) {
        if (requete.request.url.includes('/emission-factors')) requete.flush(FACTEURS);
        else requete.flush([]);
      }
    }
  };

  /** Monte l'écran de collecte sous un rôle donné. */
  const monterEcran = (role: string) => {
    sessionStorage.setItem(CLE_ROLE, role);

    const fixture = TestBed.createComponent(BiensServicesComponent);
    fixture.detectChanges();
    servirTout();
    fixture.detectChanges();
    return fixture;
  };

  /** Lignes relues depuis le stockage, telles que la migration les a laissées. */
  const lignesEnregistrees = () => JSON.parse(localStorage.getItem(CLE_LIGNES) ?? '[]');

  it('rapproche la ligne du facteur exact que porte sa référence', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));

    const fixture = monterEcran('CONTRIBUTEUR');
    const ligne = fixture.componentInstance.listeEmissions[0];

    // La référence désigne MS3C1BBB : son facteur et sa base remplacent ceux
    // que la catégorie avait imposés.
    expect(ligne.facteur).toBeCloseTo(2.480, 6);
    expect(ligne.databaseSource).toBe('EPA-ORD 2024');
    expect(ligne.rapprochement).toBe('REFERENCE');

    // L'émission suit le nouveau facteur : 100 kg × 2,480.
    expect(ligne.emissionCalculee).toBeCloseTo(248, 4);
  }, 30_000);

  it('persiste la correction et pose son marqueur', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));
    monterEcran('CONTRIBUTEUR');

    expect(localStorage.getItem(MARQUEUR)).toBe('fait');
    expect(lignesEnregistrees()[0].facteur).toBeCloseTo(2.480, 6);
  }, 30_000);

  it('ne s\'exécute qu\'une fois, même après réouverture de l\'écran', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));
    monterEcran('CONTRIBUTEUR');

    // Une correction faite à la main après la migration doit survivre : la
    // seconde ouverture ne doit pas rejouer l'appariement par-dessus.
    const corrigeeAMain = [{ ...lignesEnregistrees()[0], facteur: 9.999, emissionCalculee: 999.9 }];
    localStorage.setItem(CLE_LIGNES, JSON.stringify(corrigeeAMain));

    const seconde = monterEcran('CONTRIBUTEUR');
    expect(seconde.componentInstance.listeEmissions[0].facteur).toBeCloseTo(9.999, 6);
  }, 30_000);

  it('produit le même résultat pour le Master Admin', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));

    const fixture = monterEcran('ADMINISTRATEUR');
    expect(fixture.componentInstance.listeEmissions[0].facteur).toBeCloseTo(2.480, 6);
    expect(localStorage.getItem(MARQUEUR)).toBe('fait');
  }, 30_000);

  it('ne s\'exécute pas pour un rôle qui n\'atteint pas l\'écran', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));
    sessionStorage.setItem(CLE_ROLE, 'VALIDATEUR');

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    servirTout();

    // Le validateur n'ouvre pas la collecte : l'écran ne se monte pas, donc la
    // migration ne part pas. Aucune écriture n'est faite en son nom.
    fixture.componentInstance.setActive('biens-services');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    servirTout();

    expect(fixture.componentInstance.activeSub).not.toBe('biens-services');
    expect(localStorage.getItem(MARQUEUR)).toBeNull();
    expect(lignesEnregistrees()[0].facteur).toBeCloseTo(0.310, 6);
  }, 30_000);

  it('laisse le marqueur au premier rôle qui ouvre l\'écran', () => {
    localStorage.setItem(CLE_LIGNES, JSON.stringify(LIGNE_A_MIGRER));

    // Le validateur passe d'abord, sans rien déclencher ; le contributeur
    // ouvre ensuite l'écran et la migration s'exécute alors normalement.
    sessionStorage.setItem(CLE_ROLE, 'VALIDATEUR');
    expect(localStorage.getItem(MARQUEUR)).toBeNull();

    monterEcran('CONTRIBUTEUR');
    expect(localStorage.getItem(MARQUEUR)).toBe('fait');
    expect(lignesEnregistrees()[0].facteur).toBeCloseTo(2.480, 6);
  }, 30_000);
});
