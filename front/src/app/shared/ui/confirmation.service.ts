import { Injectable, signal } from '@angular/core';

/**
 * Demande de confirmation présentée à l'utilisateur.
 *
 * <p>Les boîtes natives du navigateur ne se stylent pas, s'affichent hors de
 * la fenêtre applicative et bloquent le fil d'exécution. Cette demande est
 * rendue par un composant de l'application, à sa charte.</p>
 */
export interface DemandeConfirmation {
  titre: string;
  message: string;
  /** Conséquences de l'action, détaillées sous le message. */
  consequences?: string[];
  /** Libellé du bouton d'action ; « Oui, supprimer » par défaut. */
  libelleAction?: string;
  libelleAnnulation?: string;
  /** Gravité, qui commande l'icône et la teinte du bouton d'action. */
  gravite?: 'danger' | 'avertissement';
}

interface DemandeEnCours extends DemandeConfirmation {
  resoudre: (accepte: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {

  /** Demande affichée, ou {@code null} quand aucune n'est en cours. */
  readonly demande = signal<DemandeEnCours | null>(null);

  /**
   * Pose une question et attend la réponse.
   *
   * <p>Une demande déjà ouverte est refusée plutôt qu'empilée : deux boîtes
   * superposées laisseraient l'utilisateur répondre à celle qu'il ne voit
   * pas.</p>
   */
  demander(demande: DemandeConfirmation): Promise<boolean> {
    if (this.demande()) return Promise.resolve(false);

    return new Promise<boolean>(resoudre => {
      this.demande.set({ ...demande, resoudre });
    });
  }

  /** Confirme l'action et referme la boîte. */
  confirmer(): void {
    const courante = this.demande();
    if (!courante) return;
    this.demande.set(null);
    courante.resoudre(true);
  }

  /** Renonce à l'action et referme la boîte. */
  annuler(): void {
    const courante = this.demande();
    if (!courante) return;
    this.demande.set(null);
    courante.resoudre(false);
  }
}
