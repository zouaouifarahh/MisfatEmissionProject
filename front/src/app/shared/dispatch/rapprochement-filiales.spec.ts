import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from '../../backoffice/components/dashboard/dashboard';
import { Filiale } from '../../models/organization.model';

/**
 * Rapprochement des noms d'usines et de filiales.
 *
 * <p>Les écrans de saisie écrivent « Misfat 1 », l'organigramme
 * « TN MISFAT TUNISIE » : sans souplesse, toutes les émissions finiraient
 * « non affectées » et les quotes-parts seraient fausses.</p>
 */
describe('Rapprochement souple des filiales', () => {
  let composant: DashboardComponent;

  const FILIALES = [
    { id: 1, libelle: 'TN MISFAT TUNISIE', usines: [{ id: 11, nom: 'MISFAT I', filialeId: 1 }] },
    { id: 2, libelle: 'FR SOLAUFIL FRANCE', usines: [] },
    { id: 3, libelle: 'TN AZUR TUNISIE', usines: [{ id: 31, nom: 'AZUR 2', filialeId: 3 }] },
    { id: 4, libelle: 'MA MISFAT MAROC', usines: [] }
  ] as unknown as Filiale[];

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardComponent);
    composant = fixture.componentInstance;
    composant.filiales = FILIALES;
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
  }, 30_000);

  /** L'appariement est privé : le test emprunte le même chemin que le calcul. */
  const filialeDe = (usine: string): number | null =>
    (composant as any).filialeDeLUsine(usine);

  const motCle = (libelle: string): string =>
    (composant as any).motCleOrganisation(libelle);

  it('réduit un libellé à son enseigne', () => {
    expect(motCle('TN MISFAT TUNISIE')).toBe('TUNISIE');
    expect(motCle('MISFAT 1')).toBe('MISFAT');
    expect(motCle('MISFAT I')).toBe('MISFAT');
    expect(motCle('Misfat')).toBe('MISFAT');
    expect(motCle('FR SOLAUFIL FRANCE')).toBe('SOLAUFIL');
    expect(motCle('  azur-2  ')).toBe('AZUR');
  });

  it('rattache les variantes d\'écriture à leur usine', () => {
    // Correspondance exacte après nettoyage : « MISFAT 1 » et « MISFAT I ».
    expect(filialeDe('MISFAT 1')).toBe(1);
    expect(filialeDe('Misfat I')).toBe(1);

    // Rapprochement souple sur l'enseigne.
    expect(filialeDe('AZUR')).toBe(3);
    expect(filialeDe('azur 2')).toBe(3);
    expect(filialeDe('SOLAUFIL')).toBe(2);
    expect(filialeDe('Solaufil Tunisie')).toBe(2);
  });

  it('retombe sur la société principale plutôt que « non affectée »', () => {
    // Une usine inconnue de l'organigramme ne doit pas fausser les parts en
    // se rangeant dans un poste sans nom.
    expect(filialeDe('Atelier inconnu')).toBe(1);
    expect(filialeDe('')).toBe(1);
  });

  it('respecte la société sélectionnée au filtre global', () => {
    composant.selectedFilialeId = 3;

    // Le périmètre consulté prime sur la société principale du groupe.
    expect(filialeDe('Atelier inconnu')).toBe(3);

    // Une usine clairement identifiée garde pourtant son rattachement.
    expect(filialeDe('MISFAT 1')).toBe(1);
  });
});
