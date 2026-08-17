import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import {
  Compte,
  ComptesService,
  ROLES_PROPOSES,
  AFFECTATIONS_PROPOSEES,
  libelleStatut
} from '../../core/comptes.service';
import { SessionService, nomAffiche } from '../../core/session.service';

/**
 * Annuaire des membres de l'équipe et invitations.
 *
 * <p>Deux vues d'un même annuaire : les comptes en exercice, avec les décisions
 * qui les concernent, et les invitations émises, avec leur sort. Rien n'y est
 * dupliqué — une invitation <em>est</em> un compte ouvert d'avance, et c'est la
 * première connexion qui dit si elle a été honorée.</p>
 */
@Component({
  selector: 'app-gestion-equipe',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-equipe.component.html',
  styleUrl: './gestion-equipe.component.css'
})
export class GestionEquipeComponent implements OnInit, OnDestroy {
  private readonly comptesService = inject(ComptesService);
  private readonly sessionService = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly roles = ROLES_PROPOSES;
  readonly affectations = AFFECTATIONS_PROPOSEES;
  readonly libelleStatut = libelleStatut;
  readonly nomAffiche = nomAffiche;

  onglet: 'actifs' | 'invitations' = 'actifs';

  membres: Compte[] = [];
  invitations: Compte[] = [];

  message = '';
  erreur = '';

  // ---------- MODALE D'INVITATION ----------
  modaleInvitation = false;
  invitation = { email: '', telephone: '', role: 'MODERATEUR', affectation: 'GROUPE_MISFAT' };

  // ---------- MODALE D'ÉDITION ----------
  modaleEdition = false;
  membreEnEdition: Compte | null = null;
  edition = { firstName: '', lastName: '', email: '', telephone: '', role: '', affectation: '' };

  /** Suppression confirmée en deux temps : le clic seul n'efface rien. */
  suppressionEnAttente: number | null = null;

  private readonly abonnements = new Subscription();

  ngOnInit(): void {
    this.abonnements.add(this.comptesService.membres$.subscribe(membres => {
      this.membres = membres;
      this.cdr.markForCheck();
    }));

    this.abonnements.add(this.comptesService.invitations$.subscribe(invitations => {
      this.invitations = invitations;
      this.cdr.markForCheck();
    }));

    // Une décision prise dans un autre onglet doit se voir ici sans
    // rechargement : la relecture initiale s'en charge, l'écouteur du service
    // fait le reste.
    this.comptesService.synchroniser();
  }

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  /** Le compte est-il celui de l'utilisateur connecté ? */
  estMoi(compte: Compte): boolean {
    return compte.email === this.sessionService.session?.email;
  }

  /** Le compte d'urgence ne se modifie, ne se bloque et ne se supprime pas. */
  estProtege(compte: Compte): boolean {
    return this.comptesService.estCompteUrgence(compte);
  }

  /** Date lisible, ou tiret quand l'horodatage manque. */
  dateCourte(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
  }

  /**
   * Sort d'une invitation.
   *
   * <p>Aucun courriel n'étant émis par l'application, « transmise » ne veut dire
   * que « compte ouvert ». Seule la première connexion atteste que l'invitation
   * a effectivement trouvé son destinataire.</p>
   */
  sortInvitation(compte: Compte): string {
    if (compte.statut === 'BLOQUE') return 'Accès suspendu';
    if (compte.premiereConnexionLe) return `Acceptée le ${this.dateCourte(compte.premiereConnexionLe)}`;
    return 'En attente de première connexion';
  }

  // ---------- INVITATION ----------

  ouvrirInvitation(): void {
    this.invitation = { email: '', telephone: '', role: 'MODERATEUR', affectation: 'GROUPE_MISFAT' };
    this.erreur = '';
    this.modaleInvitation = true;
  }

  fermerInvitation(): void {
    this.modaleInvitation = false;
  }

  envoyerInvitation(): void {
    const email = this.invitation.email.trim();
    if (!email.includes('@')) {
      this.erreur = 'Veuillez saisir une adresse email valide.';
      return;
    }

    const compte = this.comptesService.inviter({
      email,
      telephone: this.invitation.telephone,
      role: this.invitation.role,
      affectation: this.invitation.affectation
    });

    this.modaleInvitation = false;
    this.erreur = '';
    this.message = `Invitation transmise à ${compte.email}. Le compte est ouvert : `
      + 'la personne se connecte avec cette adresse, sans mot de passe.';
    this.onglet = 'invitations';
    this.cdr.markForCheck();
  }

  // ---------- ÉDITION ----------

  ouvrirEdition(compte: Compte): void {
    this.membreEnEdition = compte;
    this.edition = {
      firstName: compte.firstName ?? '',
      lastName: compte.lastName ?? '',
      email: compte.email,
      telephone: compte.telephone ?? '',
      role: compte.role,
      affectation: compte.affectation
    };
    this.erreur = '';
    this.modaleEdition = true;
  }

  fermerEdition(): void {
    this.modaleEdition = false;
    this.membreEnEdition = null;
  }

  enregistrerEdition(): void {
    if (!this.membreEnEdition) return;

    const email = this.edition.email.trim();
    if (!email.includes('@')) {
      this.erreur = 'Veuillez saisir une adresse email valide.';
      return;
    }

    const modifie = this.comptesService.modifierMembre(this.membreEnEdition.id, {
      firstName: this.edition.firstName,
      lastName: this.edition.lastName,
      email,
      telephone: this.edition.telephone,
      role: this.edition.role,
      affectation: this.edition.affectation
    });

    if (!modifie) {
      this.erreur = 'Cette adresse email est déjà utilisée par un autre compte.';
      return;
    }

    // Modifier son propre compte change les droits de la console : la session
    // doit suivre, sinon l'interface resterait sur l'ancien rôle.
    if (this.estMoi(this.membreEnEdition)) this.sessionService.ouvrir(modifie);

    this.message = `${nomAffiche(modifie)} a été mis à jour.`;
    this.fermerEdition();
    this.cdr.markForCheck();
  }

  // ---------- BLOCAGE ET SUPPRESSION ----------

  basculerBlocage(compte: Compte): void {
    if (compte.statut === 'BLOQUE') {
      this.comptesService.debloquer(compte.id);
      this.message = `${nomAffiche(compte)} peut de nouveau se connecter.`;
    } else {
      this.comptesService.bloquer(compte.id);
      this.message = `${nomAffiche(compte)} ne peut plus se connecter.`;
    }
    this.cdr.markForCheck();
  }

  demanderSuppression(compte: Compte): void {
    this.suppressionEnAttente = compte.id;
  }

  annulerSuppression(): void {
    this.suppressionEnAttente = null;
  }

  confirmerSuppression(compte: Compte): void {
    this.comptesService.supprimer(compte.id);
    this.suppressionEnAttente = null;
    this.message = `Le compte ${compte.email} a été supprimé de l'annuaire.`;
    this.cdr.markForCheck();
  }
}
