import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { ComptesService } from '../../../core/comptes.service';

/**
 * Écran « Contrôle des Accès » : décisions du Master Admin.
 *
 * <p>Le tableau n'est plus un jeu d'exemple : ce banc vérifie qu'approuver une
 * demande ouvre réellement la connexion de l'intéressé, et que refuser la
 * referme.</p>
 */
describe('DashboardComponent — contrôle des accès', () => {

  let comptes: ComptesService;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    comptes = TestBed.inject(ComptesService);
  });

  /** Dépose une demande puis ouvre l'écran de contrôle des accès. */
  const ouvrir = () => {
    comptes.demanderAcces({
      firstName: 'Farah', lastName: 'Zwawi', email: 'f.zwawi@misfat.com',
      role: 'SUPERVISEUR', affectation: 'MISFAT_1'
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive('acces');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  it('liste les demandes en attente de l\'annuaire', async () => {
    const fixture = ouvrir();
    const hote: HTMLElement = fixture.nativeElement;

    // NgModel reporte son écriture sur la micro-tâche suivante : les listes
    // n'affichent leur sélection qu'une fois le gabarit stabilisé.
    await fixture.whenStable();

    expect(fixture.componentInstance.demandesEnAttente).toHaveLength(1);

    const ligne = hote.querySelector('.acces-card tbody tr');
    expect(ligne?.textContent).toContain('Farah Zwawi');
    expect(ligne?.textContent).toContain('f.zwawi@misfat.com');
    expect(ligne?.textContent).toContain('EN_ATTENTE');

    // Le rôle et le périmètre ne sont plus du texte mais des listes : la demande
    // n'en propose que la valeur de départ, le Master Admin les arrête lui-même.
    const listes = ligne!.querySelectorAll<HTMLSelectElement>('select.select-decision');
    expect(listes).toHaveLength(2);
    expect(listes[0].value).toBe('SUPERVISEUR');
    expect(listes[1].value).toBe('MISFAT_1');
  });

  it('ouvre la connexion de l\'intéressé à l\'approbation', () => {
    const fixture = ouvrir();
    const composant = fixture.componentInstance;

    composant.accepterDemande(composant.demandesEnAttente[0]);
    fixture.detectChanges();

    const compte = comptes.chercherParEmail('f.zwawi@misfat.com')!;
    expect(compte.statut).toBe('APPROUVE');
    expect(comptes.peutSeConnecter(compte)).toBe(true);

    // La demande quitte le tableau sans qu'aucun rechargement ne soit demandé.
    expect(composant.demandesEnAttente).toHaveLength(0);
    expect(composant.messageAcces).toContain('f.zwawi@misfat.com');
  });

  it('referme la connexion au refus', () => {
    const fixture = ouvrir();
    const composant = fixture.componentInstance;

    composant.refuserDemande(composant.demandesEnAttente[0]);
    fixture.detectChanges();

    const compte = comptes.chercherParEmail('f.zwawi@misfat.com')!;
    expect(compte.statut).toBe('REFUSE');
    expect(comptes.peutSeConnecter(compte)).toBe(false);
    expect(composant.demandesEnAttente).toHaveLength(0);
  });

  it('annonce un tableau vide plutôt que de le laisser muet', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentInstance.setActive('acces');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    const hote: HTMLElement = fixture.nativeElement;
    expect(hote.querySelector('.acces-card .cell-empty')?.textContent)
      .toContain('Aucune demande en attente');
  });
});
