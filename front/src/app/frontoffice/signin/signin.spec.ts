import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SigninComponent } from './signin';
import { CLE_COMPTES, ComptesService, EMAIL_MASTER_ADMIN } from '../../core/comptes.service';
import { RolesService } from '../../core/roles.service';
import { CLE_EMAIL } from '../../core/session.service';

/**
 * Connexion par nom complet et adresse électronique.
 *
 * <p>L'écran doit dire à l'utilisateur ce qu'il lui reste à faire dans chacune
 * des issues : compte d'urgence, compte approuvé, demande en attente, demande
 * refusée, adresse inconnue, nom qui ne concorde pas, domaine étranger. Il ne
 * propose plus d'inscription : l'accès est attribué par la direction.</p>
 */
describe('SigninComponent', () => {

  let fixture: ComponentFixture<SigninComponent>;
  let component: SigninComponent;
  let comptes: ComptesService;
  let naviguer: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [SigninComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    comptes = TestBed.inject(ComptesService);
    naviguer = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(SigninComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Compte approuvé de référence, utilisé par la plupart des cas. */
  function compteApprouve(): void {
    const compte = comptes.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
      role: 'SUPERVISEUR', affectation: 'MISFAT_1'
    });
    comptes.approuver(compte.id);
  }

  it('demande un nom complet et une adresse, jamais un mot de passe', () => {
    const hote: HTMLElement = fixture.nativeElement;

    expect(hote.querySelector('input[type="password"]')).toBeNull();
    expect(hote.querySelector('#password')).toBeNull();
    expect(hote.querySelector('#nomComplet')).toBeTruthy();
    expect(hote.querySelector('#email')).toBeTruthy();
  });

  it('ne propose plus d\'inscription', () => {
    const hote: HTMLElement = fixture.nativeElement;

    expect(hote.querySelector('a[href="/signup"]')).toBeNull();
    expect(hote.textContent).not.toContain('inscription');
    expect(hote.textContent).not.toContain('Créer un compte');
  });

  it('connecte le compte d\'urgence et applique son rôle', () => {
    component.nomComplet = 'Master Admin';
    component.email = EMAIL_MASTER_ADMIN;
    component.onLogin();

    expect(component.messageError).toBe('');
    expect(naviguer).toHaveBeenCalledWith('/dashboard');
    expect(TestBed.inject(RolesService).profil).toBe('MASTER_ADMIN');
    expect(localStorage.getItem(CLE_EMAIL)).toBe(EMAIL_MASTER_ADMIN);
  });

  it('ne souffle aucune adresse et laisse des champs vides', () => {
    const hote: HTMLElement = fixture.nativeElement;
    const champ = hote.querySelector<HTMLInputElement>('#email')!;

    expect(component.nomComplet).toBe('');
    expect(component.email).toBe('');
    expect(champ.value).toBe('');
    expect(champ.placeholder).toBe('prenom.nom@misfat.com');

    // Le raccourci vers le compte d'urgence a été retiré de l'écran public.
    expect(hote.textContent).not.toContain(EMAIL_MASTER_ADMIN);
  });

  it('refuse une adresse inconnue en indiquant la marche à suivre', () => {
    component.nomComplet = 'Personne Inconnue';
    component.email = 'inconnu@misfat.com';
    component.onLogin();

    expect(component.messageError).toContain('Compte inconnu');
    expect(component.messageError).toContain('Master Admin');
    expect(naviguer).not.toHaveBeenCalled();
  });

  it('retient une demande encore en attente', () => {
    comptes.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
      role: 'SUPERVISEUR', affectation: 'MISFAT_1'
    });

    component.nomComplet = 'Farah Zwawi';
    component.email = 'f.zwawi@misfat.com';
    component.onLogin();

    expect(component.messageError).toBe(
      'Votre demande d\'accès est en attente de validation par le Master Admin'
    );
    expect(naviguer).not.toHaveBeenCalled();
  });

  it('connecte l\'utilisateur dès que le Master Admin a approuvé', () => {
    compteApprouve();

    component.nomComplet = 'Farah Zwawi';
    component.email = 'F.Zwawi@Misfat.com';
    component.onLogin();

    expect(component.messageError).toBe('');
    expect(naviguer).toHaveBeenCalledWith('/dashboard');

    // Le rôle affecté commande les droits de la console.
    expect(TestBed.inject(RolesService).profil).toBe('CONTRIBUTEUR');
  });

  it('connecte après une approbation faite dans un autre onglet', () => {
    const compte = comptes.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
      role: 'SUPERVISEUR', affectation: 'MISFAT_1'
    });

    // Premier essai, avant la décision : l'accès est refusé, à raison.
    component.nomComplet = 'Farah Zwawi';
    component.email = 'f.zwawi@misfat.com';
    component.onLogin();
    expect(component.messageError).toContain('en attente');

    // L'onglet du Master Admin approuve : seul le stockage partagé est modifié,
    // la mémoire de cet onglet-ci ignore encore la décision.
    localStorage.setItem(CLE_COMPTES, JSON.stringify(
      comptes.comptes.map(c => (c.id === compte.id ? { ...c, statut: 'APPROUVE' } : c))
    ));

    // Second clic : la relecture doit suffire, sans rechargement de la page.
    component.onLogin();

    expect(component.messageError).toBe('');
    expect(naviguer).toHaveBeenCalledWith('/dashboard');
    expect(TestBed.inject(RolesService).profil).toBe('CONTRIBUTEUR');
  });

  it('écarte une demande refusée', () => {
    const compte = comptes.demanderAcces({
      firstName: 'Ahmed', lastName: 'Bayan', email: 'a.bayan@misfat.com',
      role: 'MODERATEUR', affectation: 'MISFAT_2'
    });
    comptes.refuser(compte.id);

    component.nomComplet = 'Ahmed Bayan';
    component.email = 'a.bayan@misfat.com';
    component.onLogin();

    expect(component.messageError).toContain('refusée');
    expect(naviguer).not.toHaveBeenCalled();
  });

  describe('nom complet', () => {

    it('est réclamé avant toute tentative de connexion', () => {
      component.nomComplet = '   ';
      component.email = 'f.zwawi@misfat.com';
      component.onLogin();

      expect(component.messageError).toContain('nom complet');
      expect(naviguer).not.toHaveBeenCalled();
    });

    it('doit concorder avec celui du compte', () => {
      compteApprouve();

      component.nomComplet = 'Quelqu\'un Autre';
      component.email = 'f.zwawi@misfat.com';
      component.onLogin();

      expect(component.messageError).toContain('ne correspond pas');
      expect(naviguer).not.toHaveBeenCalled();
    });

    it('tolère la casse, les accents et l\'ordre des deux parties', () => {
      compteApprouve();

      component.nomComplet = '  ZWAWI   Fàrah ';
      component.email = 'f.zwawi@misfat.com';
      component.onLogin();

      expect(component.messageError).toBe('');
      expect(naviguer).toHaveBeenCalledWith('/dashboard');
    });

    it('est accepté tel quel quand le compte invité n\'en porte aucun', () => {
      comptes.inviter({ email: 'n.hamdi@misfat.com', role: 'MODERATEUR' });

      component.nomComplet = 'Nadia Hamdi';
      component.email = 'n.hamdi@misfat.com';
      component.onLogin();

      expect(component.messageError).toBe('');
      expect(naviguer).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('domaine imposé', () => {

    it('complète une saisie sans domaine', () => {
      compteApprouve();

      component.nomComplet = 'Farah Zwawi';
      component.email = 'f.zwawi';
      component.onLogin();

      expect(component.messageError).toBe('');
      expect(naviguer).toHaveBeenCalledWith('/dashboard');
    });

    it('refuse un domaine étranger plutôt que de le réécrire', () => {
      compteApprouve();

      component.nomComplet = 'Farah Zwawi';
      component.email = 'f.zwawi@gmail.com';
      component.onLogin();

      expect(component.messageError).toContain('@misfat.com');
      expect(naviguer).not.toHaveBeenCalled();
    });

    it('réclame une adresse plutôt que de tenter une connexion vide', () => {
      component.nomComplet = 'Farah Zwawi';
      component.email = '   ';
      component.onLogin();

      expect(component.messageError).toContain('@misfat.com');
      expect(naviguer).not.toHaveBeenCalled();
    });
  });
});
