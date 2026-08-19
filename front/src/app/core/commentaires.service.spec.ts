import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { CommentairesService, roleAffiche, CLE_COMMENTAIRES } from './commentaires.service';
import { CLE_ROLE } from './roles.service';

/**
 * Fil de commentaires attaché aux lignes de saisie.
 *
 * <p>Ce qui est vérifié ici n'est pas l'affichage mais la traçabilité : un
 * vérificateur externe doit pouvoir distinguer l'observation d'un opérateur de
 * l'arbitrage d'un administrateur. Un fil qui perdrait le rôle de son auteur ne
 * vaudrait rien comme pièce.</p>
 */
describe('Commentaires de saisie', () => {

  let service: CommentairesService;

  const monter = (role?: string) => {
    localStorage.clear();
    sessionStorage.clear();
    if (role) sessionStorage.setItem(CLE_ROLE, role);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(CommentairesService);
  };

  beforeEach(() => { service = monter('CONTRIBUTEUR'); });

  describe('rôle porté par le commentaire', () => {

    it('traduit le profil d\'accès en rôle affiché', () => {
      expect(roleAffiche('ADMINISTRATEUR')).toBe('Master Admin');
      expect(roleAffiche('CONTRIBUTEUR')).toBe('Opérateur');
      expect(roleAffiche('AUDITEUR')).toBe('Modérateur');
      expect(roleAffiche('VALIDATEUR')).toBe('Modérateur');
    });

    it('inscrit le rôle de l\'auteur sur le message', () => {
      const ecrit = service.ajouter('SCOPE_1|Combustion', 'Facture STEG à revoir',
                                    'A. Ben Salah', '2026-03-01T09:00:00Z');

      expect(ecrit?.role).toBe('Opérateur');
      expect(ecrit?.auteur).toBe('A. Ben Salah');
    });

    it('suit le rôle de la session, non celui de la saisie précédente', () => {
      const admin = monter('ADMINISTRATEUR');
      const ecrit = admin.ajouter('SCOPE_2|Électricité', 'Arbitrage validé',
                                  'Direction', '2026-03-02T09:00:00Z');

      expect(ecrit?.role).toBe('Master Admin');
    });
  });

  describe('écriture au fil', () => {

    it('rattache le commentaire à sa ligne', () => {
      service.ajouter('SCOPE_1|Combustion', 'Premier', 'Op', '2026-03-01T09:00:00Z');
      service.ajouter('SCOPE_2|Électricité', 'Autre ligne', 'Op', '2026-03-01T10:00:00Z');

      expect(service.pourLigne('SCOPE_1|Combustion')).toHaveLength(1);
      expect(service.pourLigne('SCOPE_2|Électricité')).toHaveLength(1);
      expect(service.pourLigne('SCOPE_3|Achats')).toHaveLength(0);
    });

    it('classe les messages du plus ancien au plus récent', () => {
      service.ajouter('L1', 'Deuxième', 'Op', '2026-03-02T09:00:00Z');
      service.ajouter('L1', 'Premier', 'Op', '2026-03-01T09:00:00Z');

      expect(service.pourLigne('L1').map(c => c.texte)).toEqual(['Premier', 'Deuxième']);
    });

    it('compte les messages d\'une ligne', () => {
      service.ajouter('L1', 'a', 'Op', '2026-03-01T09:00:00Z');
      service.ajouter('L1', 'b', 'Op', '2026-03-01T10:00:00Z');

      expect(service.compter('L1')).toBe(2);
      expect(service.compter('L2')).toBe(0);
    });

    it('refuse un texte vide sans incrémenter la pastille', () => {
      // Une pastille qui monte sur un message vide ferait croire à une
      // discussion qui n'a pas eu lieu.
      expect(service.ajouter('L1', '   ', 'Op', '2026-03-01T09:00:00Z')).toBeNull();
      expect(service.ajouter('L1', '', 'Op', '2026-03-01T09:00:00Z')).toBeNull();
      expect(service.compter('L1')).toBe(0);
    });

    it('refuse un commentaire sans ligne de rattachement', () => {
      expect(service.ajouter('', 'Orphelin', 'Op', '2026-03-01T09:00:00Z')).toBeNull();
    });

    it('nomme l\'auteur à défaut de nom fourni', () => {
      const ecrit = service.ajouter('L1', 'Sans signature', '  ', '2026-03-01T09:00:00Z');
      expect(ecrit?.auteur).toBe('Utilisateur');
    });
  });

  describe('persistance', () => {

    it('conserve le fil d\'une session à l\'autre', () => {
      service.ajouter('L1', 'Message durable', 'Op', '2026-03-01T09:00:00Z');

      // Nouvelle instance sans purger le stockage : c'est exactement ce que
      // fait un rafraîchissement de page.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const relu = TestBed.inject(CommentairesService);

      expect(relu.pourLigne('L1').map(c => c.texte)).toEqual(['Message durable']);
    });

    it('s\'ouvre malgré un fil illisible', () => {
      localStorage.setItem(CLE_COMMENTAIRES, '{ ceci n\'est pas du JSON');

      // Un fil corrompu ne doit pas empêcher l'écran de s'afficher.
      const rouvert = TestBed.inject(CommentairesService);
      expect(rouvert.pourLigne('L1')).toEqual([]);
    });
  });

  describe('suppression réservée', () => {

    it('refuse la suppression à un opérateur', () => {
      const ecrit = service.ajouter('L1', 'À conserver', 'Op', '2026-03-01T09:00:00Z')!;

      // Un fil dont chacun efface les messages des autres ne vaut rien comme
      // trace d'arbitrage.
      expect(service.peutSupprimer).toBe(false);
      expect(service.supprimer(ecrit.id)).toBe(false);
      expect(service.compter('L1')).toBe(1);
    });

    it('l\'autorise au Master Admin', () => {
      const admin = monter('ADMINISTRATEUR');
      const ecrit = admin.ajouter('L1', 'À retirer', 'Direction', '2026-03-01T09:00:00Z')!;

      expect(admin.peutSupprimer).toBe(true);
      expect(admin.supprimer(ecrit.id)).toBe(true);
      expect(admin.compter('L1')).toBe(0);
    });

    it('rend faux sur un identifiant inconnu', () => {
      const admin = monter('ADMINISTRATEUR');
      expect(admin.supprimer(999)).toBe(false);
    });
  });
});
