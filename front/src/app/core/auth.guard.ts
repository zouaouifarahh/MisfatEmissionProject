import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';

import { SessionService } from './session.service';

/**
 * Garde des écrans réservés : sans session ouverte, retour à la connexion.
 *
 * <p>Les écrans du backoffice étaient jusqu'ici atteignables par leur seule
 * adresse : entrer /dashboard dans la barre du navigateur ouvrait la console
 * sans qu'aucune demande d'accès n'ait été approuvée. La garde ferme cette
 * porte — l'accès passe désormais par /signin, donc par l'annuaire, donc par la
 * décision du Master Admin.</p>
 *
 * <p><strong>Ce n'est pas une protection des données.</strong> La session vit
 * dans le navigateur et rien de ce qui y vit ne résiste à un utilisateur
 * décidé : la garde organise la navigation, elle n'authentifie personne. Le
 * contrôle réel appartient au serveur, et cette garde n'a vocation à tenir que
 * jusqu'à l'intégration du fournisseur d'identité externe.</p>
 *
 * <p>Au pré-rendu, la garde laisse passer : le serveur n'a pas de session à
 * lire, et refuser là bloquerait la génération des pages. Le navigateur
 * réévalue la règle à l'hydratation, où elle fait foi.</p>
 */
export const authGuard: CanActivateFn = (_route, etat) => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) return true;

  const session = inject(SessionService).session;
  if (session) return true;

  // L'adresse demandée est conservée : la connexion pourra y ramener plutôt que
  // de renvoyer tout le monde sur le tableau de bord.
  return inject(Router).createUrlTree(['/signin'], {
    queryParams: { retour: etat.url }
  });
};
