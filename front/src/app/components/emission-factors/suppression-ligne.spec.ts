import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EmissionFactorsComponent } from './emission-factors.component';

/**
 * Suppression d'une ligne du référentiel des facteurs.
 *
 * <p>Le tableau montre une ligne par facteur, mais aussi une ligne pour les
 * sources qui n'en portent aucun — celles qu'un import a créées sans parvenir à
 * leur rattacher de valeur. Ces lignes n'ont pas d'identifiant de facteur, et
 * la suppression sortait alors en silence : la boîte de confirmation se
 * fermait, la ligne restait, et rien ne disait pourquoi.</p>
 *
 * <p>Le défaut se lisait comme une interdiction visant les lignes importées, ce
 * qu'il n'était pas : c'est la référence qu'il faut effacer quand aucun facteur
 * ne s'y rattache.</p>
 */
describe('Référentiel des facteurs — suppression d\'une ligne', () => {

  const RACINE_FACTEURS = 'http://localhost:8082/api/v1/emission-factors';
  const RACINE_REFERENCES = 'http://localhost:8082/api/referentiel-carbone';

  let fixtures: { destroy: () => void }[] = [];
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmissionFactorsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  function monter(): EmissionFactorsComponent {
    const fixture = TestBed.createComponent(EmissionFactorsComponent);
    fixtures.push(fixture);
    fixture.detectChanges();

    httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) requete.flush([]);
      fixture.detectChanges();
    }
    return fixture.componentInstance;
  }

  /** Ligne du tableau, réduite à ce que la suppression consulte. */
  const ligne = (p: { facteurId?: number | null; referenceId?: number | null }) => ({
    referenceCode: 'MS3C1FF', sourceName: 'Farah testing',
    categoryName: 'Category 1: PG&S - GCP', scopeCode: 'SCOPE_3',
    defaultFactorId: p.facteurId ?? null,
    carbonReferenceId: p.referenceId ?? null,
    origin: 'EXCEL_IMPORT'
  });

  it('efface le facteur quand la ligne en porte un', () => {
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: 273, referenceId: 165 }) as never);
    ecran.confirmerSuppression();

    const requete = httpMock.expectOne(`${RACINE_FACTEURS}/273`);
    expect(requete.request.method).toBe('DELETE');
    requete.flush(null);
  });

  it('efface la référence quand la ligne ne porte aucun facteur', () => {
    // C'est le cas qui ne faisait rien : une source créée par un import, restée
    // sans facteur, que le bouton refusait d'effacer sans le dire.
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: null, referenceId: 152 }) as never);
    ecran.confirmerSuppression();

    const requete = httpMock.expectOne(`${RACINE_REFERENCES}/152`);
    expect(requete.request.method).toBe('DELETE');
    requete.flush(null);
  });

  it('ne laisse pas la ligne à supprimer en attente après un succès', () => {
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: 273, referenceId: 165 }) as never);
    ecran.confirmerSuppression();
    httpMock.expectOne(`${RACINE_FACTEURS}/273`).flush(null);

    expect(ecran.ligneASupprimer).toBeNull();
    expect(ecran.suppressionEnCours).toBe(false);
  });

  it('rafraîchit la liste après la suppression', () => {
    // Sans rechargement, la ligne effacée en base resterait affichée : l'écran
    // dirait le contraire de la base.
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: 273, referenceId: 165 }) as never);
    ecran.confirmerSuppression();
    httpMock.expectOne(`${RACINE_FACTEURS}/273`).flush(null);

    // Le rechargement repart chercher le référentiel.
    expect(httpMock.match(() => true).length).toBeGreaterThan(0);
  });

  it('dit pourquoi quand la ligne ne porte ni facteur ni référence', () => {
    // Le silence était le défaut : l'utilisateur cliquait, rien ne se passait,
    // et rien ne l'expliquait.
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: null, referenceId: null }) as never);
    ecran.confirmerSuppression();

    expect(ecran.erreur).toContain('rien à supprimer');
    expect(ecran.ligneASupprimer).toBeNull();
    httpMock.expectNone(() => true);
  });

  it('restitue le refus du serveur plutôt que de l\'avaler', () => {
    const ecran = monter();
    ecran.demanderSuppression(ligne({ facteurId: 273, referenceId: 165 }) as never);
    ecran.confirmerSuppression();

    httpMock.expectOne(`${RACINE_FACTEURS}/273`)
      .flush({ message: 'Facteur référencé par des mesures.' },
             { status: 409, statusText: 'Conflict' });

    expect(ecran.erreur).toBe('Facteur référencé par des mesures.');
    expect(ecran.suppressionEnCours).toBe(false);
  });
});
