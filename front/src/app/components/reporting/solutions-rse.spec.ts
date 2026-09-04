import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ReportingComponent, CLE_RAPPORT_NORME } from './reporting.component';
import { SolutionRSE, migrerSolution } from './chapitres-norme';
import { EntityContextService } from '../../core/entity-context.service';

/**
 * Solutions et recommandations RSE du rapport normé.
 *
 * <p>Seul contenu du rapport qui ne dérive d'aucun calcul. Les chiffres disent
 * où l'entreprise en est ; ces solutions disent ce qu'elle engage, et rien dans
 * l'inventaire ne permet de les déduire.</p>
 *
 * <p>Elles doivent survivre à trois passages : l'écran de saisie, le sommaire —
 * où chacune paraît sous son titre — et le document imprimé, dont elles font
 * partie au même titre qu'un tableau d'émissions.</p>
 */
describe('Rapport normé — solutions et recommandations RSE', () => {

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

  /** Monte le composant en mode normé, chapitres dépliés. */
  const monter = () => {
    const fixture = TestBed.createComponent(ReportingComponent);
    fixture.detectChanges();
    servirTout();
    fixture.componentInstance.changerMode('norme');
    fixture.componentInstance.toutDeplier();
    fixture.detectChanges();
    return fixture;
  };

  /** Saisit une solution de bout en bout, comme l'écran le fait. */
  const saisir = (
    composant: ReportingComponent, titre: string, portee: string,
    horizon = '2028', impact = ''
  ) => {
    composant.ajouterSolution();
    composant.brouillonSolution = { titre, horizon, portee, impact };
    composant.enregistrerSolution();
  };

  describe('saisie', () => {

    it('ajoute une solution et la conserve', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Relamping LED des ateliers', 'Remplacement de 1 200 points lumineux.');

      expect(composant.solutions).toHaveLength(1);
      expect(composant.solutions[0].titre).toBe('Relamping LED des ateliers');
      expect(composant.solutions[0].portee).toBe('Remplacement de 1 200 points lumineux.');
      expect(composant.solutions[0].horizon).toBe('2028');
    });

    it('numérote les solutions par leur rang dans le chapitre', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Relamping LED', 'a');
      saisir(composant, 'Fret maritime', 'b');

      // Le chapitre des solutions porte le numéro 11 ; ses entrées suivent.
      expect(composant.numeroSolution(0)).toBe('11.1');
      expect(composant.numeroSolution(1)).toBe('11.2');
    });

    it('écarte une solution restée sans titre', () => {
      // Elle paraîtrait au sommaire sous une ligne vide, introuvable dans le
      // document : c'est un ajout auquel on a renoncé.
      const composant = monter().componentInstance;
      composant.ajouterSolution();
      composant.brouillonSolution =
        { titre: '   ', horizon: '2030', portee: 'un texte sans intitulé', impact: '' };
      composant.enregistrerSolution();

      expect(composant.solutions).toHaveLength(0);
    });

    it('abandonne l\'ajout quand la saisie est annulée', () => {
      const composant = monter().componentInstance;
      composant.ajouterSolution();
      composant.annulerSolution();

      expect(composant.solutions).toHaveLength(0);
      expect(composant.solutionEnEdition).toBeNull();
    });

    it('modifie une solution sans toucher aux autres', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Relamping LED', 'a');
      saisir(composant, 'Fret maritime', 'b');

      composant.modifierSolution(composant.solutions[0]);
      composant.brouillonSolution =
        { titre: 'Relamping LED — phase 2', horizon: '2029', portee: 'a bis', impact: '' };
      composant.enregistrerSolution();

      expect(composant.solutions.map(s => s.titre))
        .toEqual(['Relamping LED — phase 2', 'Fret maritime']);
      expect(composant.solutions[1].portee).toBe('b');
    });

    it('supprime une solution et renumérote les suivantes', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Première', 'a');
      saisir(composant, 'Deuxième', 'b');

      composant.supprimerSolution(composant.solutions[0]);

      expect(composant.solutions.map(s => s.titre)).toEqual(['Deuxième']);
      // Le numéro suit le rang, jamais l'identifiant : sans quoi le sommaire
      // afficherait un trou là où la première solution se trouvait.
      expect(composant.numeroSolution(0)).toBe('11.1');
    });

    it('ne réattribue pas l\'identifiant d\'une solution vivante', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Première', 'a');
      saisir(composant, 'Deuxième', 'b');

      // La première part ; la nouvelle ne doit pas hériter d'un identifiant
      // encore porté par la seconde, sans quoi les deux se confondraient.
      composant.supprimerSolution(composant.solutions[0]);
      saisir(composant, 'Troisième', 'c');

      const identifiants = composant.solutions.map(s => s.id);
      expect(new Set(identifiants).size).toBe(identifiants.length);
    });

    it('réordonne les solutions', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Première', 'a');
      saisir(composant, 'Deuxième', 'b');

      composant.deplacerSolution(1, -1);
      expect(composant.solutions.map(s => s.titre)).toEqual(['Deuxième', 'Première']);
    });

    it('ne déplace rien au-delà des bornes de la liste', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Seule', 'a');

      composant.deplacerSolution(0, -1);
      composant.deplacerSolution(0, 1);

      expect(composant.solutions.map(s => s.titre)).toEqual(['Seule']);
    });
  });

  describe('intégration au document', () => {

    it('rend chaque solution dans le chapitre, avec son ancre', () => {
      const fixture = monter();
      saisir(fixture.componentInstance, 'Relamping LED des ateliers', 'Mesure engagée.');
      fixture.detectChanges();

      const hote: HTMLElement = fixture.nativeElement;
      const rendues = hote.querySelectorAll('#chapitre-solutions .solution');

      expect(rendues).toHaveLength(1);
      expect(rendues[0].id).toBe(`solution-${fixture.componentInstance.solutions[0].id}`);
      expect(rendues[0].textContent).toContain('Relamping LED des ateliers');
      expect(rendues[0].textContent).toContain('Mesure engagée.');
    });

    it('inscrit chaque solution au sommaire sous son titre', () => {
      const fixture = monter();
      saisir(fixture.componentInstance, 'Relamping LED', 'a');
      saisir(fixture.componentInstance, 'Fret maritime plutôt qu\'aérien', 'b');
      fixture.detectChanges();

      const entrees = (fixture.nativeElement as HTMLElement)
        .querySelectorAll('.norme-sommaire .som-sous-liste li');

      expect(entrees).toHaveLength(2);
      expect(entrees[0].textContent).toContain('11.1');
      expect(entrees[0].textContent).toContain('Relamping LED');
      expect(entrees[1].textContent).toContain('Fret maritime plutôt qu\'aérien');
    });

    it('ne rend aucune sous-liste tant qu\'aucune solution n\'est saisie', () => {
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('.norme-sommaire .som-sous-liste')).toBeNull();
      expect(hote.querySelector('#chapitre-solutions .norme-avis')).toBeTruthy();
    });

    it('restitue la solution sans proposer de la saisir', () => {
      // Le rapport normé rend compte, il ne saisit plus : le plan se tient dans
      // la synthèse exécutive, où il se décide. Deux formulaires sur la même
      // donnée finissaient par diverger, sans que rien ne dise lequel faisait
      // foi.
      const fixture = monter();
      saisir(fixture.componentInstance, 'Relamping LED', 'Mesure engagée.');
      fixture.detectChanges();

      const solution = (fixture.nativeElement as HTMLElement)
        .querySelector('#chapitre-solutions .solution')!;

      // Le texte fait partie du rapport remis, au même titre qu'un tableau
      // d'émissions : il n'est pas masqué à l'impression.
      expect(solution.querySelector('.solution-champs')?.className ?? '')
        .not.toContain('ecran-seul');

      expect(solution.querySelector('.solution-actions')).toBeNull();
      expect(solution.querySelector('.solution-edition')).toBeNull();
    });
  });

  /**
   * <p>La synthèse exécutive est le document que lit la direction. Les mesures
   * qu'elle a arrêtées doivent s'y trouver : les chercher dans un autre onglet
   * reviendrait à les tenir hors du document de pilotage.</p>
   */
  describe('reprise dans la synthèse exécutive', () => {

    /** Monte en mode synthèse — le mode par défaut du rapport. */
    const monterSynthese = () => {
      const fixture = TestBed.createComponent(ReportingComponent);
      fixture.detectChanges();
      servirTout();
      fixture.detectChanges();
      return fixture;
    };

    it('reprend chaque solution en carte, avec sa portée et son impact', () => {
      const fixture = monterSynthese();
      saisir(fixture.componentInstance, 'Relamping LED des ateliers',
        'Trois sites de production.', '2028', '−12 % du Scope 2.');
      saisir(fixture.componentInstance, 'Fret maritime plutôt qu\'aérien',
        'Flux longue distance.', '2027', '−18 % de la catégorie 9.');
      fixture.detectChanges();

      const hote: HTMLElement = fixture.nativeElement;
      expect(hote.textContent).toContain('Plan d\'action & Recommandations RSE');

      const cartes = hote.querySelectorAll('.plan-cartes .plan-carte');
      expect(cartes).toHaveLength(2);

      expect(cartes[0].querySelector('h4')?.textContent).toContain('Relamping LED des ateliers');
      expect(cartes[0].querySelector('.plan-badge')?.textContent?.trim()).toBe('2028');
      expect(cartes[0].textContent).toContain('Trois sites de production.');
      expect(cartes[0].textContent).toContain('−12 % du Scope 2.');
      expect(cartes[1].querySelector('.plan-badge')?.textContent?.trim()).toBe('2027');
    });

    it('ne porte plus la colonne de référence au chapitre 11', () => {
      const fixture = monterSynthese();
      saisir(fixture.componentInstance, 'Relamping LED', 'Trois sites.');
      fixture.detectChanges();

      // Elle alourdissait la lecture sans rien apprendre : la mesure se
      // reconnaît à son intitulé, pas à son rang dans un autre document.
      const hote: HTMLElement = fixture.nativeElement;
      expect(hote.textContent).not.toContain('Réf. ch. 11');
    });

    it('signale une mesure dont la portée reste à préciser', () => {
      const fixture = monterSynthese();
      saisir(fixture.componentInstance, 'Piste à instruire', '', '', '');
      fixture.detectChanges();

      const carte = (fixture.nativeElement as HTMLElement).querySelector('.plan-carte')!;
      expect(carte.querySelector('.plan-badge')).toBeNull();
      expect(carte.textContent).toContain('restent à préciser');
    });

    it('renvoie au chapitre 11 tant qu\'aucune solution n\'est saisie', () => {
      const hote: HTMLElement = monterSynthese().nativeElement;

      // Un tableau vide ne dirait pas où saisir ; l'invite le dit.
      expect(hote.textContent).toContain('Plan d\'action & Recommandations RSE');
      expect(hote.textContent).toContain('Aucune solution n\'est encore consignée');
    });

    it('présente les solutions dans les deux modes du rapport', () => {
      const fixture = monterSynthese();
      saisir(fixture.componentInstance, 'Relamping LED', 'Mesure engagée.');
      fixture.detectChanges();

      const hote: HTMLElement = fixture.nativeElement;
      expect(hote.textContent).toContain('Relamping LED');

      fixture.componentInstance.changerMode('norme');
      fixture.componentInstance.toutDeplier();
      fixture.detectChanges();

      expect(hote.querySelector('#chapitre-solutions .solution')?.textContent)
        .toContain('Relamping LED');
    });
  });

  describe('persistance', () => {

    it('range les solutions avec les paramètres du périmètre', () => {
      const composant = monter().componentInstance;
      saisir(composant, 'Relamping LED', 'Mesure engagée.');

      const tous = JSON.parse(localStorage.getItem(CLE_RAPPORT_NORME) ?? '{}');
      const parametres = Object.values(tous)[0] as { solutions: { titre: string }[] };

      expect(parametres.solutions).toHaveLength(1);
      expect(parametres.solutions[0].titre).toBe('Relamping LED');
    });

    it('verse l\'ancien texte libre dans la portée', () => {
      // Les solutions saisies avant la séparation portée / impact ne portaient
      // qu'un texte. L'effacer aurait fait disparaître ce que quelqu'un avait
      // écrit ; l'horizon, lui, reste vide plutôt que d'être inventé.
      const migree = migrerSolution({
        id: 'sol-1', titre: 'Relamping LED', texte: 'Trois sites, d\'ici 2028.'
      } as SolutionRSE);

      expect(migree.portee).toBe('Trois sites, d\'ici 2028.');
      expect(migree.horizon).toBe('');
      expect(migree.impact).toBe('');
    });

    it('laisse intacte une solution déjà séparée', () => {
      const migree = migrerSolution({
        id: 'sol-2', titre: 'Fret maritime', horizon: '2027',
        portee: 'Flux longs', impact: '−18 %', texte: 'ancien libellé'
      });

      // La portée renseignée prime : l'ancien texte ne la remplace pas.
      expect(migree.portee).toBe('Flux longs');
      expect(migree.horizon).toBe('2027');
      expect(migree.impact).toBe('−18 %');
    });

    it('relit sans broncher des paramètres écrits avant ce chapitre', () => {
      // Un stockage antérieur ne porte pas le champ : le gabarit itérerait
      // alors sur `undefined` et le rapport ne s'afficherait plus du tout.
      localStorage.setItem(CLE_RAPPORT_NORME, JSON.stringify({
        'GROUPE|TOUS': { textes: {}, anneeReference: 2023, responsable: 'RSE' }
      }));

      const fixture = monter();
      expect(fixture.componentInstance.solutions).toEqual([]);
      expect((fixture.nativeElement as HTMLElement).querySelector('#chapitre-solutions'))
        .toBeTruthy();
    });
  });
});
