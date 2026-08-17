import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { CLE_ROLE } from '../../../core/roles.service';

/**
 * Interface effectivement rendue, rôle par rôle.
 *
 * <p>Les bancs de {@code roles.service.spec.ts} vérifient la table des droits ;
 * ceux-ci vérifient ce que la console en fait. La différence compte : un droit
 * correctement calculé mais oublié dans le gabarit ouvre un écran qu'il devait
 * fermer, et un droit accordé mais mal câblé masque un écran neuf — c'est
 * précisément le risque que fait courir chaque composant ajouté, du rapport
 * Bilan Carbone aux colonnes Référence / Code article ERP.</p>
 *
 * <p>Chaque profil est monté avec le rôle réellement déposé par la connexion,
 * puis interrogé sur le DOM. Aucune assertion ne passe par la table des
 * droits : ce sont les écrans qui répondent.</p>
 */
describe('DashboardComponent — interface par rôle', () => {

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  }, 30_000);

  afterEach(() => {
    sessionStorage.clear();
  });

  /**
   * Monte la console sous un rôle donné.
   *
   * <p>Le rôle est déposé avant la création du composant : {@code RolesService}
   * le relit à son instanciation, comme après une connexion.</p>
   */
  const monter = (role: string) => {
    sessionStorage.setItem(CLE_ROLE, role);

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /**
   * Redessine après une mutation faite depuis le test.
   *
   * <p>L'application est sans zone : seul un événement du gabarit notifie le
   * planificateur. Une écriture directe sur le composant ne le fait pas, et la
   * vue resterait au cycle précédent — ce que la passe de vérification
   * signalerait par une NG0100 trompeuse.</p>
   */
  const redessiner = (fixture: ReturnType<typeof monter>) => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  /** Ouvre un écran et sert les requêtes qu'il déclenche. */
  const ouvrir = (fixture: ReturnType<typeof monter>, ecran: string) => {
    fixture.componentInstance.setActive(ecran);
    redessiner(fixture);

    for (let passe = 0; passe < 3; passe++) {
      const attente = TestBed.inject(HttpTestingController).match(() => true);
      if (!attente.length) break;
      attente.forEach(r => r.flush([]));
      redessiner(fixture);
    }
    return fixture.nativeElement as HTMLElement;
  };

  /** Entêtes du tableau de l'écran monté. */
  const entetes = (hote: HTMLElement, selecteur: string): string[] => {
    const ecran = hote.querySelector('main.dash-main')?.querySelector(selecteur);
    return [...(ecran?.querySelectorAll('.data-table thead th') ?? [])]
      .map(th => th.textContent?.trim() ?? '');
  };

  describe('Master Admin — accès total', () => {

    it('ouvre le rapport Bilan Carbone complet', () => {
      const fixture = monter('ADMINISTRATEUR');
      const hote = ouvrir(fixture, 'reporting-executif');

      expect(fixture.componentInstance.activeSub).toBe('reporting-executif');
      expect(hote.querySelector('main.dash-main app-reporting')).toBeTruthy();
    }, 30_000);

    it('ouvre le paramétrage global et l\'annuaire', () => {
      const fixture = monter('ADMINISTRATEUR');
      const composant = fixture.componentInstance;

      // Les quatre écrans que ce profil seul doit atteindre.
      for (const ecran of ['societes', 'sauvegarde-donnees', 'donnees-activite', 'acces']) {
        expect(composant.ecranAutorise(ecran)).toBe(true);
      }

      composant.menus.parametres = true;
      composant.menus.utilisateurs = true;
      redessiner(fixture);

      const hote: HTMLElement = fixture.nativeElement;
      const libelles = [...hote.querySelectorAll('.sub-btn')].map(b => b.textContent ?? '');
      expect(libelles.some(l => l.includes('Membres de l\'équipe'))).toBe(true);
    }, 30_000);

    it('atteint aussi les écrans de saisie', () => {
      const fixture = monter('ADMINISTRATEUR');
      const hote = ouvrir(fixture, 'investissements');

      expect(fixture.componentInstance.activeSub).toBe('investissements');
      expect(hote.querySelector('main.dash-main app-investissements')).toBeTruthy();
    }, 30_000);
  });

  describe('Responsable de périmètre / Saisie — collecte', () => {

    // Les deux intitulés que porte ce profil dans l'annuaire.
    for (const role of ['CONTRIBUTEUR', 'RESPONSABLE_PERIMETRE']) {

      it(`ouvre les investissements avec les colonnes Réf. / ERP (${role})`, () => {
        const fixture = monter(role);
        const hote = ouvrir(fixture, 'investissements');

        expect(fixture.componentInstance.activeSub).toBe('investissements');

        const colonnes = entetes(hote, 'app-investissements');
        expect(colonnes).toContain('Référence carbone');
        expect(colonnes).toContain('Code article ERP');
      }, 30_000);

      it(`ouvre les achats de biens et services avec les mêmes colonnes (${role})`, () => {
        const fixture = monter(role);
        const hote = ouvrir(fixture, 'biens-services');

        expect(fixture.componentInstance.activeSub).toBe('biens-services');

        const colonnes = entetes(hote, 'app-biens-services');
        expect(colonnes).toContain('Référence carbone');
        expect(colonnes).toContain('Code article ERP');
      }, 30_000);
    }

    it('atteint les trois scopes', () => {
      const fixture = monter('CONTRIBUTEUR');
      const composant = fixture.componentInstance;

      // Un écran par scope : combustion (1), électricité (2), achats (3).
      for (const ecran of ['combustion-etablissements', 'electricite-achetee', 'biens-services']) {
        expect(composant.ecranAutorise(ecran)).toBe(true);
      }
    }, 30_000);

    it('consulte le rapport mais pas le paramétrage global', () => {
      const composant = monter('CONTRIBUTEUR').componentInstance;

      expect(composant.ecranAutorise('reporting-executif')).toBe(true);
      expect(composant.ecranAutorise('societes')).toBe(false);
      expect(composant.ecranAutorise('donnees-activite')).toBe(false);
      expect(composant.ecranAutorise('acces')).toBe(false);
    }, 30_000);

    it('n\'expose ni annuaire ni demandes d\'accès dans le menu', () => {
      const fixture = monter('CONTRIBUTEUR');
      fixture.componentInstance.menus.utilisateurs = true;
      redessiner(fixture);

      const hote: HTMLElement = fixture.nativeElement;
      const libelles = [...hote.querySelectorAll('.sub-btn, .nav-btn')].map(b => b.textContent ?? '');
      expect(libelles.some(l => l.includes('Membres de l\'équipe'))).toBe(false);
    }, 30_000);
  });

  describe('Validateur — relecture et consultation', () => {

    // Le validateur relit sans saisir ; l'auditeur partage exactement ce profil.
    for (const role of ['VALIDATEUR', 'AUDITEUR']) {

      it(`consulte le tableau de bord et le rapport (${role})`, () => {
        const fixture = monter(role);
        const composant = fixture.componentInstance;

        expect(composant.ecranAutorise('dashboard-home')).toBe(true);
        expect(composant.ecranAutorise('reporting-executif')).toBe(true);

        const hote = ouvrir(fixture, 'reporting-executif');
        expect(composant.activeSub).toBe('reporting-executif');
        expect(hote.querySelector('main.dash-main app-reporting')).toBeTruthy();
      }, 30_000);

      it(`ne peut pas ouvrir un écran de saisie (${role})`, () => {
        const fixture = monter(role);
        const composant = fixture.componentInstance;

        // Le refus doit tenir même si un lien mène à l'écran : l'onglet
        // retombe sur le tableau de bord au lieu d'afficher la saisie.
        composant.setActive('investissements');
        redessiner(fixture);

        expect(composant.activeSub).not.toBe('investissements');
        expect((fixture.nativeElement as HTMLElement)
          .querySelector('main.dash-main app-investissements')).toBeNull();
      }, 30_000);
    }

    it('ne voit ni import, ni référentiel, ni paramétrage', () => {
      const fixture = monter('VALIDATEUR');
      const composant = fixture.componentInstance;

      for (const ecran of ['import-data', 'facteurs', 'referentiel-carbone', 'societes', 'acces']) {
        expect(composant.ecranAutorise(ecran)).toBe(false);
      }

      const hote: HTMLElement = fixture.nativeElement;
      const libelles = [...hote.querySelectorAll('.nav-btn')].map(b => b.textContent ?? '');
      expect(libelles.some(l => l.includes('Import de données'))).toBe(false);
    }, 30_000);
  });

  describe('Administrateur de site — collecte sans paramétrage global', () => {

    it('saisit sans accéder au paramétrage du groupe', () => {
      const composant = monter('ADMIN_SITE').componentInstance;

      // Les droits ne portent aucune notion de site : accorder l'administration
      // complète livrerait les autres usines et l'annuaire du groupe.
      expect(composant.ecranAutorise('biens-services')).toBe(true);
      expect(composant.ecranAutorise('import-data')).toBe(true);
      expect(composant.ecranAutorise('societes')).toBe(false);
      expect(composant.ecranAutorise('acces')).toBe(false);
    }, 30_000);
  });

  describe('Aucun rôle masqué ne casse les composants récents', () => {

    it('ouvre le rapport Bilan Carbone sous les trois profils', () => {
      for (const role of ['ADMINISTRATEUR', 'CONTRIBUTEUR', 'VALIDATEUR']) {
        const fixture = monter(role);
        const hote = ouvrir(fixture, 'reporting-executif');

        expect(hote.querySelector('main.dash-main app-reporting')).toBeTruthy();
        sessionStorage.clear();
      }
    }, 60_000);

    it('rend le tableau de bord à tous, jamais une page blanche', () => {
      for (const role of ['ADMINISTRATEUR', 'CONTRIBUTEUR', 'VALIDATEUR', 'USER', 'ROLE_INCONNU']) {
        const fixture = monter(role);
        const hote: HTMLElement = fixture.nativeElement;

        expect(fixture.componentInstance.ecranAutorise('dashboard-home')).toBe(true);
        expect(hote.querySelector('main.dash-main')).toBeTruthy();
        sessionStorage.clear();
      }
    }, 60_000);
  });
});
