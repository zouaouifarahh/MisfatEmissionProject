import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { GestionEquipeComponent } from './gestion-equipe.component';
import { Compte, ComptesService, EMAIL_MASTER_ADMIN } from '../../core/comptes.service';

/**
 * Annuaire des membres : invitations, édition, blocage et suppression.
 *
 * <p>Le point sensible est le compte d'urgence : aucune action de cet écran ne
 * doit pouvoir le fermer, sans quoi la plateforme deviendrait inaccessible.</p>
 */
describe('GestionEquipeComponent', () => {

  let fixture: ComponentFixture<GestionEquipeComponent>;
  let composant: GestionEquipeComponent;
  let comptes: ComptesService;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [GestionEquipeComponent]
    }).compileComponents();

    comptes = TestBed.inject(ComptesService);

    fixture = TestBed.createComponent(GestionEquipeComponent);
    composant = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Membre approuvé, tel qu'il apparaît dans l'onglet « Utilisateurs Actifs ». */
  const membreApprouve = (): Compte => {
    const compte = comptes.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
      role: 'SUPERVISEUR', affectation: 'MISFAT_1'
    });
    comptes.approuver(compte.id);
    fixture.detectChanges();
    return comptes.chercherParEmail('f.zwawi@misfat.com')!;
  };

  it('n\'affiche dans les actifs que les accès accordés', () => {
    comptes.demanderAcces({
      firstName: 'Ahmed', lastName: 'Bayan', email: 'a.bayan@misfat.com',
      role: 'MODERATEUR', affectation: 'MISFAT_2'
    });
    fixture.detectChanges();

    // Une demande non tranchée n'est pas un membre : elle relève de l'écran
    // « Demandes d'Accès ».
    expect(composant.membres.map(m => m.email)).toEqual([EMAIL_MASTER_ADMIN]);

    membreApprouve();
    expect(composant.membres.map(m => m.email))
      .toEqual([EMAIL_MASTER_ADMIN, 'f.zwawi@misfat.com']);
  });

  describe('invitation', () => {

    const inviter = (email = 'n.trabelsi@misfat.com') => {
      composant.ouvrirInvitation();
      composant.invitation = { email, telephone: '+216 71 000 000', role: 'MODERATEUR', affectation: 'MISFAT_3' };
      composant.envoyerInvitation();
      fixture.detectChanges();
    };

    it('ouvre un compte pré-approuvé, connectable aussitôt', () => {
      inviter();

      const invite = comptes.chercherParEmail('n.trabelsi@misfat.com')!;
      expect(invite.statut).toBe('APPROUVE');
      expect(invite.role).toBe('MODERATEUR');
      expect(invite.telephone).toBe('+216 71 000 000');
      expect(invite.origine).toBe('INVITATION');
      expect(comptes.peutSeConnecter(invite)).toBe(true);
    });

    it('confirme la transmission et bascule sur l\'onglet des invitations', () => {
      inviter();

      expect(composant.message).toContain('Invitation transmise');
      expect(composant.message).toContain('n.trabelsi@misfat.com');
      expect(composant.onglet).toBe('invitations');
      expect(composant.modaleInvitation).toBe(false);
    });

    it('refuse une adresse inexploitable sans fermer la modale', () => {
      composant.ouvrirInvitation();
      composant.invitation = { email: 'pas-une-adresse', telephone: '', role: 'MODERATEUR', affectation: 'GROUPE_MISFAT' };
      composant.envoyerInvitation();

      expect(composant.erreur).toContain('adresse email');
      expect(composant.modaleInvitation).toBe(true);
    });

    it('distingue une invitation honorée d\'une invitation sans suite', () => {
      inviter();
      const invite = comptes.chercherParEmail('n.trabelsi@misfat.com')!;
      expect(composant.sortInvitation(invite)).toContain('En attente de première connexion');

      comptes.marquerConnexion(invite.email);
      expect(composant.sortInvitation(comptes.chercherParEmail(invite.email)!))
        .toContain('Acceptée le');
    });
  });

  describe('édition', () => {

    it('met à jour les caractéristiques du membre', () => {
      const membre = membreApprouve();

      composant.ouvrirEdition(membre);
      composant.edition = {
        firstName: 'Farah', lastName: 'Zwawi', email: 'farah.zwawi@misfat.com',
        telephone: '+216 98 111 222', role: 'MASTER_ADMIN', affectation: 'GROUPE_MISFAT'
      };
      composant.enregistrerEdition();
      fixture.detectChanges();

      const modifie = comptes.chercherParEmail('farah.zwawi@misfat.com')!;
      expect(modifie.role).toBe('MASTER_ADMIN');
      expect(modifie.telephone).toBe('+216 98 111 222');
      expect(comptes.chercherParEmail('f.zwawi@misfat.com')).toBeNull();
      expect(composant.modaleEdition).toBe(false);
    });

    it('refuse une adresse déjà portée par un autre compte', () => {
      const membre = membreApprouve();

      composant.ouvrirEdition(membre);
      composant.edition = { ...composant.edition, email: EMAIL_MASTER_ADMIN };
      composant.enregistrerEdition();

      expect(composant.erreur).toContain('déjà utilisée');
      expect(composant.modaleEdition).toBe(true);
      expect(comptes.chercherParEmail('f.zwawi@misfat.com')).not.toBeNull();
    });
  });

  describe('blocage et suppression', () => {

    it('suspend puis rend l\'accès sans effacer le membre', () => {
      const membre = membreApprouve();

      composant.basculerBlocage(membre);
      fixture.detectChanges();

      let apres = comptes.chercherParEmail(membre.email)!;
      expect(apres.statut).toBe('BLOQUE');
      expect(comptes.peutSeConnecter(apres)).toBe(false);
      // Suspendre n'est pas supprimer : le membre reste à l'annuaire.
      expect(composant.membres.some(m => m.email === membre.email)).toBe(true);

      composant.basculerBlocage(apres);
      fixture.detectChanges();

      apres = comptes.chercherParEmail(membre.email)!;
      expect(apres.statut).toBe('APPROUVE');
      expect(comptes.peutSeConnecter(apres)).toBe(true);
    });

    it('n\'efface qu\'après confirmation', () => {
      const membre = membreApprouve();

      composant.demanderSuppression(membre);
      expect(composant.suppressionEnAttente).toBe(membre.id);
      expect(comptes.chercherParEmail(membre.email)).not.toBeNull();

      composant.annulerSuppression();
      expect(comptes.chercherParEmail(membre.email)).not.toBeNull();

      composant.demanderSuppression(membre);
      composant.confirmerSuppression(membre);
      fixture.detectChanges();

      expect(comptes.chercherParEmail(membre.email)).toBeNull();
      expect(composant.suppressionEnAttente).toBeNull();
    });
  });

  describe('compte d\'urgence', () => {

    const urgence = () => comptes.chercherParEmail(EMAIL_MASTER_ADMIN)!;

    it('est signalé comme protégé', () => {
      expect(composant.estProtege(urgence())).toBe(true);
    });

    it('ne peut être ni bloqué, ni supprimé, ni rétrogradé', () => {
      composant.basculerBlocage(urgence());
      expect(urgence().statut).toBe('APPROUVE');

      composant.confirmerSuppression(urgence());
      expect(comptes.chercherParEmail(EMAIL_MASTER_ADMIN)).not.toBeNull();

      composant.ouvrirEdition(urgence());
      composant.edition = { ...composant.edition, role: 'MODERATEUR', email: 'autre@misfat.com' };
      composant.enregistrerEdition();

      const apres = urgence();
      expect(apres.role).toBe('MASTER_ADMIN');
      expect(apres.email).toBe(EMAIL_MASTER_ADMIN);
    });
  });
});
