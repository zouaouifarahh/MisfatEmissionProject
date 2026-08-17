import { Inject, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

import { Compte, ComptesService } from './comptes.service';
import { CLE_ROLE, RolesService } from './roles.service';

/**
 * Session ouverte dans le navigateur.
 *
 * <p>Elle ne conserve que ce dont la console a besoin pour s'adapter à son
 * utilisateur : son rôle, son adresse et son nom. Aucun mot de passe, aucun
 * secret — l'annuaire ne prouve pas l'identité, il l'enregistre.</p>
 */

/** Clés de session, relues par la console au démarrage. */
export const CLE_EMAIL = 'userEmail';
export const CLE_NOM = 'userFullName';

export interface SessionUtilisateur {
  email: string;
  nomComplet: string;
  role: string;
  affectation: string;
}

/** Nom affiché d'un compte ; l'adresse fait foi tant qu'il n'est pas renseigné. */
export function nomAffiche(compte: Compte): string {
  return `${compte.firstName ?? ''} ${compte.lastName ?? ''}`.trim() || compte.email;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly rolesService = inject(RolesService);
  private readonly comptesService = inject(ComptesService);
  private readonly sessionSubject = new BehaviorSubject<SessionUtilisateur | null>(null);

  readonly session$: Observable<SessionUtilisateur | null> = this.sessionSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.sessionSubject.next(this.relire());
  }

  get session(): SessionUtilisateur | null {
    return this.sessionSubject.value;
  }

  /** Ouvre la session d'un compte approuvé et applique son rôle à la console. */
  ouvrir(compte: Compte): SessionUtilisateur {
    const session: SessionUtilisateur = {
      email: compte.email,
      nomComplet: nomAffiche(compte),
      role: compte.role,
      affectation: compte.affectation
    };

    this.ecrire(session);
    this.sessionSubject.next(session);

    // Une invitation ne se distingue d'une invitation restée sans suite que par
    // cette trace : elle est posée ici, au seul moment où l'on en est sûr.
    this.comptesService.marquerConnexion(compte.email);

    // Le service de rôles est instancié au démarrage : sans cette notification,
    // la console garderait les droits lus avant la connexion.
    this.rolesService.definirRole(session.role);

    return session;
  }

  /** Referme la session : la console retombe sur ses droits par défaut. */
  fermer(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        for (const cle of [CLE_ROLE, CLE_EMAIL, CLE_NOM]) {
          localStorage.removeItem(cle);
          sessionStorage.removeItem(cle);
        }
      } catch (erreur) {
        console.error('[session] Fermeture incomplète', erreur);
      }
    }

    this.sessionSubject.next(null);
    this.rolesService.definirRole(null);
  }

  private ecrire(session: SessionUtilisateur): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(CLE_ROLE, session.role);
      localStorage.setItem(CLE_EMAIL, session.email);
      localStorage.setItem(CLE_NOM, session.nomComplet);
    } catch (erreur) {
      console.error('[session] Session non persistée', erreur);
    }
  }

  private relire(): SessionUtilisateur | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    try {
      const email = localStorage.getItem(CLE_EMAIL);
      const role = localStorage.getItem(CLE_ROLE);
      if (!email || !role) return null;

      return {
        email,
        role,
        nomComplet: localStorage.getItem(CLE_NOM) ?? email,
        affectation: 'GROUPE_MISFAT'
      };
    } catch {
      return null;
    }
  }
}
