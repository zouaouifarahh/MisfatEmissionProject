import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AppHeaderComponent } from './app-header.component';
import { SessionService } from '../../core/session.service';
import { ComptesService, EMAIL_MASTER_ADMIN } from '../../core/comptes.service';

/**
 * Identité de la session dans la barre supérieure.
 *
 * <p>La sortie était au pied de la navigation latérale, sous une quarantaine
 * d'entrées de menu : il fallait dérouler toute la barre pour quitter la
 * console. Le bouton portait de surcroît une maison pour icône et « Quitter »
 * pour libellé, alors qu'il ferme la session — on pouvait le prendre pour un
 * retour à l'accueil.</p>
 *
 * <p>Le compte connecté, lui, n'apparaissait nulle part : rien à l'écran ne
 * disait qui était connecté, ni ne menait à « Mon Profil » autrement qu'en
 * cherchant l'entrée dans le menu.</p>
 */
describe('En-tête — identité de la session', () => {

  let fixtures: { destroy: () => void }[] = [];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppHeaderComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        // Deux destinations muettes : le sujet est la navigation déclenchée par
        // l'en-tête, pas ce qui s'affiche à l'arrivée.
        provideRouter([
          { path: 'mon-profil', children: [] },
          { path: 'signin', children: [] }
        ])
      ]
    }).compileComponents();
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
  });

  /** Ouvre une session sur le compte d'urgence, toujours présent à l'annuaire. */
  const ouvrirSession = () => {
    const comptes = TestBed.inject(ComptesService);
    const compte = comptes.chercherParEmail(EMAIL_MASTER_ADMIN)!;
    TestBed.inject(SessionService).ouvrir(compte);
    return compte;
  };

  const monter = () => {
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();

    // L'en-tête réclame sociétés et exercices à son initialisation ; le contexte
    // n'est pas le sujet de ce fichier, on solde ses appels.
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    fixtures.push(fixture);
    return fixture;
  };

  describe('affichage du compte', () => {

    it('porte le nom et le rôle de qui est connecté', () => {
      ouvrirSession();
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('.session-nom')?.textContent?.trim()).toBeTruthy();
      expect(hote.querySelector('.session-role')?.textContent).toContain('MASTER_ADMIN');
    });

    it('montre une silhouette tant qu\'aucune photo n\'a été déposée', () => {
      ouvrirSession();
      const composant = monter().componentInstance;

      // Une balise <img> sans source afficherait l'icône d'image brisée du
      // navigateur là où l'on attend un visage.
      expect(composant.avatarUrl).toContain('data:image/svg+xml');
    });

    it('reprend la photo du profil sans attendre un rechargement', () => {
      const compte = ouvrirSession();
      const fixture = monter();

      const photo = 'data:image/jpeg;base64,AAAA';
      TestBed.inject(ComptesService).modifierProfil(compte.id, { avatar: photo });
      fixture.detectChanges();

      // L'annuaire diffuse ses écritures : l'en-tête n'a pas à être prévenu
      // par l'écran « Mon Profil », avec lequel il ne se connaît pas.
      expect(fixture.componentInstance.avatarUrl).toBe(photo);
    });

    it('ne montre rien tant que personne n\'est connecté', () => {
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('.session-zone')).toBeNull();
    });
  });

  describe('accès au profil', () => {

    it('mène à /mon-profil au clic sur la photo', async () => {
      ouvrirSession();
      const fixture = monter();
      const router = TestBed.inject(Router);

      fixture.nativeElement.querySelector('.session-profil').click();
      await fixture.whenStable();

      expect(router.url).toContain('/mon-profil');
    });
  });

  describe('sortie de la console', () => {

    it('ferme la session et ramène à la connexion', async () => {
      ouvrirSession();
      const fixture = monter();
      const session = TestBed.inject(SessionService);
      const router = TestBed.inject(Router);

      fixture.nativeElement.querySelector('.session-sortie').click();
      await fixture.whenStable();

      expect(session.session).toBeNull();
      expect(router.url).toContain('/signin');
    });

    it('est atteignable sans dérouler la navigation latérale', () => {
      ouvrirSession();
      const hote: HTMLElement = monter().nativeElement;

      // Le bouton appartient désormais à la barre supérieure, et il dit ce
      // qu'il fait plutôt que « Quitter ».
      const sortie = hote.querySelector('.top-bar .session-sortie');
      expect(sortie).not.toBeNull();
      expect(sortie!.textContent).toContain('Déconnexion');
    });
  });
});
