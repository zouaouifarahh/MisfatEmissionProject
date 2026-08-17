import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  CLE_COMPTES,
  ComptesService,
  EMAIL_MASTER_ADMIN
} from './comptes.service';

/**
 * Annuaire des comptes : amorçage, demandes et décisions.
 *
 * <p>Ce qui compte ici, c'est qu'aucun enchaînement ne puisse laisser la
 * plateforme sans personne pour approuver la première demande.</p>
 */
describe('ComptesService', () => {

  let service: ComptesService;

  const creer = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ComptesService] });
    return TestBed.inject(ComptesService);
  };

  beforeEach(() => {
    localStorage.clear();
    service = creer();
  });

  describe('compte Master Admin d\'urgence', () => {

    it('est créé quand l\'annuaire est vide', () => {
      expect(service.comptes).toHaveLength(1);

      const admin = service.chercherParEmail(EMAIL_MASTER_ADMIN);
      expect(admin).not.toBeNull();
      expect(admin!.firstName).toBe('Master');
      expect(admin!.lastName).toBe('Admin');
      expect(admin!.role).toBe('MASTER_ADMIN');
      expect(admin!.statut).toBe('APPROUVE');
      expect(admin!.affectation).toBe('GROUPE_MISFAT');
    });

    it('peut se connecter immédiatement', () => {
      expect(service.peutSeConnecter(service.chercherParEmail(EMAIL_MASTER_ADMIN)!)).toBe(true);
    });

    it('est recréé s\'il disparaît de l\'annuaire', () => {
      // Sans ce filet, un stockage partiellement effacé refermerait la
      // plateforme : plus personne ne pourrait approuver quoi que ce soit.
      localStorage.setItem(CLE_COMPTES, JSON.stringify([
        { id: 4, firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
          role: 'SUPERVISEUR', statut: 'EN_ATTENTE', affectation: 'MISFAT_1', demandeLe: '' }
      ]));

      const relu = creer();
      expect(relu.chercherParEmail(EMAIL_MASTER_ADMIN)).not.toBeNull();
      expect(relu.comptes).toHaveLength(2);
    });

    it('ne peut pas être refusé', () => {
      const admin = service.chercherParEmail(EMAIL_MASTER_ADMIN)!;
      service.refuser(admin.id);

      expect(service.chercherParEmail(EMAIL_MASTER_ADMIN)!.statut).toBe('APPROUVE');
    });

    it('reste approuvé même si une demande est déposée à son adresse', () => {
      service.demanderAcces({
        firstName: 'Faux', lastName: 'Admin', email: EMAIL_MASTER_ADMIN,
        role: 'MODERATEUR', affectation: 'MISFAT_1'
      });

      const admin = service.chercherParEmail(EMAIL_MASTER_ADMIN)!;
      expect(admin.statut).toBe('APPROUVE');
      expect(admin.role).toBe('MASTER_ADMIN');
    });
  });

  describe('demandes d\'accès', () => {

    const demander = () => service.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: '  F.Zwawi@Misfat.com ',
      role: 'superviseur', affectation: 'MISFAT_1'
    });

    it('dépose la demande en attente, adresse normalisée', () => {
      const compte = demander();

      expect(compte.statut).toBe('EN_ATTENTE');
      expect(compte.email).toBe('f.zwawi@misfat.com');
      expect(compte.role).toBe('SUPERVISEUR');
      expect(service.enAttente).toHaveLength(1);
    });

    it('ne laisse pas se connecter tant qu\'elle n\'est pas approuvée', () => {
      expect(service.peutSeConnecter(demander())).toBe(false);
    });

    it('ouvre la connexion dès l\'approbation', () => {
      const compte = demander();
      service.approuver(compte.id);

      const apres = service.chercherParEmail(compte.email)!;
      expect(apres.statut).toBe('APPROUVE');
      expect(service.peutSeConnecter(apres)).toBe(true);
      expect(service.enAttente).toHaveLength(0);
      expect(apres.decideLe).toBeTruthy();
    });

    it('ferme la connexion sur un refus', () => {
      const compte = demander();
      service.refuser(compte.id);

      const apres = service.chercherParEmail(compte.email)!;
      expect(apres.statut).toBe('REFUSE');
      expect(service.peutSeConnecter(apres)).toBe(false);
      expect(service.enAttente).toHaveLength(0);
    });

    it('reprend la demande existante plutôt que d\'empiler les doublons', () => {
      const premier = demander();
      service.refuser(premier.id);

      // Une seconde demande à la même adresse repart en attente : sans cela,
      // l'annuaire porterait deux fois la même personne avec deux statuts.
      const second = service.demanderAcces({
        firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
        role: 'MODERATEUR', affectation: 'MISFAT_2'
      });

      expect(second.id).toBe(premier.id);
      expect(service.comptes.filter(c => c.email === 'f.zwawi@misfat.com')).toHaveLength(1);
      expect(second.statut).toBe('EN_ATTENTE');
      expect(second.role).toBe('MODERATEUR');
    });

    it('reconnaît l\'adresse quelle que soit sa casse', () => {
      demander();
      expect(service.chercherParEmail('F.ZWAWI@MISFAT.COM')).not.toBeNull();
      expect(service.chercherParEmail('  f.zwawi@misfat.com  ')).not.toBeNull();
      expect(service.chercherParEmail('inconnu@misfat.com')).toBeNull();
      expect(service.chercherParEmail('')).toBeNull();
    });
  });

  describe('synchronisation entre onglets', () => {

    /** Écriture faite par un autre onglet : le stockage change, pas la mémoire. */
    const ecrireDepuisUnAutreOnglet = (comptes: unknown) => {
      const avant = localStorage.getItem(CLE_COMPTES);
      localStorage.setItem(CLE_COMPTES, JSON.stringify(comptes));
      return avant;
    };

    it('voit l\'approbation prononcée dans un autre onglet', () => {
      const compte = service.demanderAcces({
        firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
        role: 'SUPERVISEUR', affectation: 'MISFAT_1'
      });

      // L'onglet du Master Admin approuve : seul le stockage est modifié.
      ecrireDepuisUnAutreOnglet(
        service.comptes.map(c => (c.id === compte.id ? { ...c, statut: 'APPROUVE' } : c))
      );

      // Sans relecture, l'annuaire en mémoire répondrait encore « en attente ».
      const relu = service.chercherParEmail('f.zwawi@misfat.com')!;
      expect(relu.statut).toBe('APPROUVE');
      expect(service.peutSeConnecter(relu)).toBe(true);
    });

    it('diffuse la mise à jour aux vues abonnées', () => {
      const compte = service.demanderAcces({
        firstName: 'Ahmed', lastName: 'Bayan', email: 'a.bayan@misfat.com',
        role: 'MODERATEUR', affectation: 'MISFAT_2'
      });

      const vues: number[] = [];
      service.enAttente$.subscribe(demandes => vues.push(demandes.length));
      expect(vues.at(-1)).toBe(1);

      ecrireDepuisUnAutreOnglet(
        service.comptes.map(c => (c.id === compte.id ? { ...c, statut: 'APPROUVE' } : c))
      );
      service.synchroniser();

      expect(vues.at(-1)).toBe(0);
    });

    it('reste muet quand rien n\'a changé', () => {
      const vues: number[] = [];
      service.comptes$.subscribe(comptes => vues.push(comptes.length));
      const avant = vues.length;

      service.synchroniser();
      service.synchroniser();

      // Une relecture à chaque clic ne doit pas faire retravailler les vues.
      expect(vues.length).toBe(avant);
    });

    it('ne perd pas la demande d\'un autre onglet en tranchant', () => {
      const premier = service.demanderAcces({
        firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
        role: 'SUPERVISEUR', affectation: 'MISFAT_1'
      });

      // Une seconde demande arrive d'un autre onglet, ignorée de la mémoire.
      ecrireDepuisUnAutreOnglet([
        ...service.comptes,
        { id: 99, firstName: 'Ahmed', lastName: 'Bayan', email: 'a.bayan@misfat.com',
          role: 'MODERATEUR', statut: 'EN_ATTENTE', affectation: 'MISFAT_2', demandeLe: '' }
      ]);

      service.approuver(premier.id);

      // Réécrire la liste entière depuis une copie périmée l'aurait effacée.
      expect(service.chercherParEmail('a.bayan@misfat.com')).not.toBeNull();
      expect(service.chercherParEmail('f.zwawi@misfat.com')!.statut).toBe('APPROUVE');
    });

    it('se met à jour sur l\'événement « storage » du navigateur', () => {
      const compte = service.demanderAcces({
        firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
        role: 'SUPERVISEUR', affectation: 'MISFAT_1'
      });

      ecrireDepuisUnAutreOnglet(
        service.comptes.map(c => (c.id === compte.id ? { ...c, statut: 'APPROUVE' } : c))
      );

      // Le navigateur notifie les autres documents : aucun clic n'est requis.
      window.dispatchEvent(new StorageEvent('storage', { key: CLE_COMPTES }));

      expect(service.enAttente).toHaveLength(0);
      expect(service.comptes.find(c => c.id === compte.id)!.statut).toBe('APPROUVE');
    });
  });

  describe('persistance', () => {

    it('survit à un rafraîchissement de la page', () => {
      const compte = service.demanderAcces({
        firstName: 'Ahmed', lastName: 'Bayan', email: 'a.bayan@misfat.com',
        role: 'MODERATEUR', affectation: 'MISFAT_2'
      });
      service.approuver(compte.id);

      const apresF5 = creer();
      expect(apresF5.chercherParEmail('a.bayan@misfat.com')!.statut).toBe('APPROUVE');
    });

    it('repart d\'un annuaire sain si le stockage est illisible', () => {
      localStorage.setItem(CLE_COMPTES, 'ceci n\'est pas du JSON');

      const relu = creer();
      expect(relu.chercherParEmail(EMAIL_MASTER_ADMIN)).not.toBeNull();
    });
  });
});
