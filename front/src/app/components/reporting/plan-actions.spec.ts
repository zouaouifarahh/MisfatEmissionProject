import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ReportingComponent } from './reporting.component';
import { migrerSolution, STATUTS_SOLUTION, SolutionRSE } from './chapitres-norme';
import { EntityContextService } from '../../core/entity-context.service';

/**
 * Plan d'actions et pistes d'atténuation, dans la synthèse exécutive.
 *
 * <p>Le plan se saisissait dans le rapport normé, que la direction ne lit pas.
 * Les mesures qu'elle arrête doivent figurer là où elle décide : la saisie vit
 * désormais dans la synthèse, et le rapport normé se contente d'en rendre
 * compte. Deux formulaires sur la même donnée finissaient par diverger, sans
 * que rien ne dise lequel faisait foi.</p>
 */
describe('Synthèse exécutive — plan d\'actions', () => {

  const STATS = {
    mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: 12,
    total: 240, scope1: 40, scope2: 60, scope3: 140,
    byScope: { SCOPE_1: 40, SCOPE_2: 60, SCOPE_3: 140 },
    byCategory: {},
    byScopeCategory: { SCOPE_1: { 'Combustion dans les usines': 40 } },
    byFiliale: [], byCurrency: {}, unconvertedCurrencies: []
  };

  const FILIALES = [
    { id: 7, code: 'MT', libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND',
      usines: [{ id: 1, nom: 'MISFAT I', filialeId: 7 }] }
  ];

  let httpMock: HttpTestingController;

  const servirTout = () => {
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) return;
      for (const requete of attente) {
        if (requete.request.url.includes('/stats/aggregate')) requete.flush(STATS);
        else if (requete.request.url.includes('/filiales')) requete.flush(FILIALES);
        else if (requete.request.url.includes('/annees')) {
          requete.flush([{ id: 1, valeur: 2024, statut: 'EN_COURS' }]);
        } else requete.flush([]);
      }
    }
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ReportingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), EntityContextService]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Monte le composant sur la synthèse, le mode par défaut. */
  const monter = () => {
    const fixture = TestBed.createComponent(ReportingComponent);
    fixture.detectChanges();
    servirTout();
    fixture.detectChanges();
    return fixture;
  };

  /** Saisit une action de bout en bout, comme l'écran le fait. */
  const saisir = (composant: ReportingComponent, action: Partial<Omit<SolutionRSE, 'id'>>) => {
    composant.ajouterSolution();
    composant.brouillonSolution = {
      titre: '', horizon: '', portee: '', impact: '',
      scopeVise: '', impactTco2e: null, statut: undefined, ...action
    };
    composant.enregistrerSolution();
  };

  describe('saisie', () => {

    it('retient le poste visé, la réduction estimée et le statut', () => {
      const composant = monter().componentInstance;
      saisir(composant, {
        titre: 'Relamping LED des ateliers', scopeVise: 'Scope 2',
        impactTco2e: 12.5, statut: 'Engagée'
      });

      const action = composant.solutions[0];
      expect(action.titre).toBe('Relamping LED des ateliers');
      expect(action.scopeVise).toBe('Scope 2');
      expect(action.impactTco2e).toBe(12.5);
      expect(action.statut).toBe('Engagée');
    });

    it('distingue une réduction non chiffrée d\'une réduction nulle', () => {
      // Un champ laissé vide vaut « non chiffré », non zéro : une réduction
      // nulle est une affirmation, l'absence de chiffre n'en est pas une.
      const composant = monter().componentInstance;
      saisir(composant, { titre: 'Sensibilisation interne' });
      expect(composant.solutions[0].impactTco2e).toBeNull();

      saisir(composant, { titre: 'Action sans effet mesuré', impactTco2e: 0 });
      expect(composant.solutions[1].impactTco2e).toBe(0);
    });

    it('modifie une action sans perdre ses nouveaux champs', () => {
      const composant = monter().componentInstance;
      saisir(composant, { titre: 'Fret maritime', scopeVise: 'Scope 3', impactTco2e: 40 });

      composant.modifierSolution(composant.solutions[0]);
      expect(composant.brouillonSolution.scopeVise).toBe('Scope 3');
      expect(composant.brouillonSolution.impactTco2e).toBe(40);

      composant.brouillonSolution = { ...composant.brouillonSolution, impactTco2e: 55 };
      composant.enregistrerSolution();

      expect(composant.solutions).toHaveLength(1);
      expect(composant.solutions[0].impactTco2e).toBe(55);
      expect(composant.solutions[0].scopeVise).toBe('Scope 3');
    });

    it('supprime une action', () => {
      const composant = monter().componentInstance;
      saisir(composant, { titre: 'À retirer' });
      composant.supprimerSolution(composant.solutions[0]);

      expect(composant.solutions).toHaveLength(0);
    });
  });

  describe('totaux annoncés', () => {

    it('ne somme que les actions chiffrées', () => {
      // Mêler les non chiffrées ferait passer un plan à moitié estimé pour un
      // plan sans ambition.
      const composant = monter().componentInstance;
      saisir(composant, { titre: 'A', impactTco2e: 12.5 });
      saisir(composant, { titre: 'B' });
      saisir(composant, { titre: 'C', impactTco2e: 30 });

      expect(composant.reductionAnnoncee).toBeCloseTo(42.5, 3);
      expect(composant.solutionsChiffrees).toBe(2);
    });

    it('annonce zéro quand aucune action n\'est chiffrée', () => {
      const composant = monter().componentInstance;
      saisir(composant, { titre: 'Sensibilisation' });

      expect(composant.reductionAnnoncee).toBe(0);
      expect(composant.solutionsChiffrees).toBe(0);
    });
  });

  describe('cibles proposées', () => {

    it('propose les scopes réellement chiffrés, jamais une liste figée', () => {
      // Proposer « Scope 2 » à une société qui n'en déclare aucun inviterait à
      // rattacher une action à un poste vide.
      const composant = monter().componentInstance;

      expect(composant.ciblesSolution[0]).toBe('Tous scopes');
      expect(composant.ciblesSolution.length).toBeGreaterThan(1);
    });
  });

  describe('reprise des saisies antérieures', () => {

    it('ne devine ni statut ni réduction sur une action écrite avant ces champs', () => {
      // « Proposée » serait une affirmation sur un avancement que personne n'a
      // déclaré ; zéro le serait sur un effet que personne n'a estimé.
      const ancienne = migrerSolution(
        { id: 'sol-1', titre: 'Ancienne', horizon: '2027', portee: 'Site A', impact: '−5 %' }
      );

      expect(ancienne.statut).toBeUndefined();
      expect(ancienne.impactTco2e).toBeNull();
      expect(ancienne.scopeVise).toBe('');
      // Ce qui existait est conservé intact.
      expect(ancienne.portee).toBe('Site A');
      expect(ancienne.impact).toBe('−5 %');
    });
  });

  describe('rendu dans le document', () => {

    it('affiche la section même sans aucune action', () => {
      const hote: HTMLElement = monter().nativeElement;
      expect(hote.textContent).toContain('Plan d\'actions');
    });

    it('vient après le contenu exécutif, jamais avant', () => {
      // Chaque page fait 250 mm de haut : posée au milieu du document, la
      // section repoussait les chiffres clés et la ventilation d'une page
      // entière, ce qui se lisait comme un contenu disparu.
      const hote: HTMLElement = monter().nativeElement;

      const pages = [...hote.querySelectorAll('.rep-document .rep-page')];
      const rangPlan = pages.findIndex(
        p => p.querySelector('.solution-ajout') !== null);

      expect(rangPlan).toBeGreaterThan(0);
      expect(rangPlan).toBe(pages.length - 1);
    });

    it('rend l\'action dans la synthèse, commandes comprises', () => {
      const fixture = monter();
      saisir(fixture.componentInstance, {
        titre: 'Relamping LED', scopeVise: 'Scope 2', impactTco2e: 12.5, statut: 'Engagée'
      });
      fixture.detectChanges();

      const hote: HTMLElement = fixture.nativeElement;
      const plan = hote.querySelector('.plan-actions')!;

      expect(plan).toBeTruthy();
      expect(plan.textContent).toContain('Relamping LED');
      expect(plan.textContent).toContain('Scope 2');
      expect(plan.textContent).toContain('Engagée');
      expect(hote.querySelector('.solution-ajout')?.className).toContain('ecran-seul');
    });

    it('ouvre le formulaire au clic sur « Ajouter »', () => {
      // Le bouton doit suffire : c'est le seul chemin qu'un utilisateur a pour
      // créer une action, et l'appeler depuis le code ne prouve rien de ce
      // qu'il fait à l'écran.
      const fixture = monter();
      const hote: HTMLElement = fixture.nativeElement;

      const bouton = hote.querySelector<HTMLButtonElement>('.solution-ajout button')!;
      expect(bouton).toBeTruthy();
      expect(bouton.disabled).toBe(false);

      bouton.click();
      fixture.detectChanges();

      const edition = hote.querySelector('.plan-actions .solution-edition');
      expect(edition).toBeTruthy();
      expect(edition!.querySelector('input[name="planTitre"]')).toBeTruthy();
      expect(edition!.querySelector('select[name="planScope"]')).toBeTruthy();
      expect(edition!.querySelector('input[name="planImpactT"]')).toBeTruthy();
      expect(edition!.querySelector('select[name="planStatut"]')).toBeTruthy();
    });

    it('interdit un second ajout tant que la saisie est ouverte', () => {
      const fixture = monter();
      const hote: HTMLElement = fixture.nativeElement;

      hote.querySelector<HTMLButtonElement>('.solution-ajout button')!.click();
      fixture.detectChanges();

      expect(hote.querySelector<HTMLButtonElement>('.solution-ajout button')!.disabled).toBe(true);
    });

    it('dit « non chiffrée » plutôt que d\'afficher un zéro', () => {
      const fixture = monter();
      saisir(fixture.componentInstance, { titre: 'Sensibilisation' });
      fixture.detectChanges();

      const plan = (fixture.nativeElement as HTMLElement).querySelector('.plan-actions')!;
      expect(plan.textContent).toContain('non chiffrée');
    });
  });

  it('offre cinq statuts, pas davantage', () => {
    // Un plan qu'on ne sait plus lire d'un coup d'œil ne se pilote pas.
    expect([...STATUTS_SOLUTION]).toEqual(
      ['Proposée', 'Engagée', 'En cours', 'Réalisée', 'Écartée']);
  });
});
