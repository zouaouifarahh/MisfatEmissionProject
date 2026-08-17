import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';

/**
 * Clic réel dans le menu latéral, propagation d'événement comprise.
 *
 * <p>Les tests précédents appelaient {@code setActive()} directement et
 * court-circuitaient donc le chemin d'événement du DOM : un clic qui remonte
 * jusqu'à un parent et réécrase l'onglet leur échappait entièrement.</p>
 */
describe('DashboardComponent — clic dans le menu latéral', () => {

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  }, 30_000);

  /** Déploie le menu jusqu'aux catégories du Scope 3. */
  const ouvrirMenuScope3 = () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const composant = fixture.componentInstance;

    composant.menus.emissions = true;
    composant.menus.mesureCategories = true;
    composant.activeScope = 'scope3';
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  };

  /** Retrouve l'entrée de menu portant un libellé donné. */
  const entreeMenu = (hote: HTMLElement, libelle: string): HTMLElement | null => {
    const entrees = Array.from(hote.querySelectorAll<HTMLElement>('.nested-sub-item'));
    return entrees.find(e => (e.textContent ?? '').includes(libelle)) ?? null;
  };

  it('fixe l\'onglet sur la catégorie cliquée, sans retomber sur « mesure »', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    const entree = entreeMenu(hote, 'Utilisation des produits');
    expect(entree).toBeTruthy();

    // Clic authentique : l'événement remonte la hiérarchie comme dans le
    // navigateur, et déclencherait un gestionnaire parent s'il en existait un.
    entree!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    // L'onglet doit rester sur la catégorie, jamais revenir à « mesure ».
    expect(fixture.componentInstance.activeSub).toBe('utilisation-produits');
    expect(fixture.componentInstance.activeSub).not.toBe('mesure');
  }, 30_000);

  it('fixe l\'onglet pour chaque catégorie développée du Scope 3', () => {
    const attendus: [string, string][] = [
      ['Biens et services achetés', 'biens-services'],
      ['Transport en amont', 'transport-amont'],
      ['Transformation des produits', 'transformation-produits'],
      ['Utilisation des produits', 'utilisation-produits'],
      ['Fin de vie des produits', 'fin-de-vie-produits'],
      ['Actifs loués en aval', 'actifs-loues-aval'],
      ['Franchises', 'franchises']
    ];

    for (const [libelle, identifiant] of attendus) {
      const fixture = ouvrirMenuScope3();
      const entree = entreeMenu(fixture.nativeElement, libelle);
      expect(entree).toBeTruthy();

      entree!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(fixture.componentInstance.activeSub).toBe(identifiant);
    }
  }, 30_000);

  it('déploie l\'écran de la catégorie après un clic réel', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Utilisation des produits')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    const principal = hote.querySelector('main.dash-main');
    expect(principal?.querySelector('app-utilisation-produits')).toBeTruthy();
    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  }, 30_000);

  it('le bouton « Mesure » ne bascule que le sous-menu, sans écraser la catégorie', () => {
    const fixture = ouvrirMenuScope3();
    const composant = fixture.componentInstance;
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Utilisation des produits')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(composant.activeSub).toBe('utilisation-produits');

    // Replier le sous-menu ne doit pas perdre la catégorie active.
    const boutonMesure = hote.querySelector<HTMLElement>('.sub-btn-split');
    expect(boutonMesure).toBeTruthy();

    boutonMesure!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(composant.menus.mesureCategories).toBe(false);
    // L'onglet reste celui que l'utilisateur avait choisi.
    expect(composant.activeSub).toBe('utilisation-produits');
  }, 30_000);

  it('« mesure » ne peut jamais devenir l\'onglet actif', () => {
    const composant = ouvrirMenuScope3().componentInstance;

    composant.setActive('utilisation-produits');
    expect(composant.activeSub).toBe('utilisation-produits');

    // Séquence rapportée par la console : la catégorie, puis « mesure ».
    // Le second appel ne doit plus écraser le premier.
    composant.setActive('mesure');
    expect(composant.activeSub).toBe('utilisation-produits');
    expect(composant.activeSub).not.toBe('mesure');

    // Il n'a fait que replier le sous-menu, sa seule fonction.
    expect(composant.menus.mesureCategories).toBe(false);
  }, 30_000);

  it('déploie l\'écran de fin de vie après un clic réel', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Fin de vie des produits')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('fin-de-vie-produits');

    const principal = hote.querySelector('main.dash-main');
    const ecran = principal?.querySelector('app-fin-de-vie-produits');
    expect(ecran).toBeTruthy();
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(9);

    // Ni écran vide, ni panneau « à développer ».
    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  }, 30_000);

  it('déploie l\'écran des actifs loués en aval après un clic réel', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Actifs loués en aval')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('actifs-loues-aval');

    const ecran = hote.querySelector('main.dash-main')?.querySelector('app-actifs-loues-aval');
    expect(ecran).toBeTruthy();
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(9);

    // La déclaration de non-applicabilité doit être offerte d'emblée.
    expect(ecran?.querySelector('.declaration-toggle')?.textContent)
      .toContain('Aucun actif loué en aval sur cet exercice');

    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  }, 30_000);

  it('déploie l\'écran des franchises après un clic réel', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Franchises')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('franchises');

    const ecran = hote.querySelector('main.dash-main')?.querySelector('app-franchises');
    expect(ecran).toBeTruthy();
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(9);

    expect(ecran?.querySelector('.declaration-toggle')?.textContent)
      .toContain('Aucun réseau de franchise sous enseigne');

    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  }, 30_000);

  it('déploie l\'écran des investissements après un clic réel', () => {
    const fixture = ouvrirMenuScope3();
    const hote: HTMLElement = fixture.nativeElement;

    entreeMenu(hote, 'Investissements')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSub).toBe('investissements');

    const ecran = hote.querySelector('main.dash-main')?.querySelector('app-investissements');
    expect(ecran).toBeTruthy();

    // Onze colonnes depuis l'ajout de « Référence carbone » et « Code article
    // ERP » : le numéro d'immobilisation identifie un actif comptable, il ne
    // sert plus de clé de valorisation carbone.
    expect(ecran?.querySelectorAll('.data-table thead th').length).toBe(11);

    const entetes = [...(ecran?.querySelectorAll('.data-table thead th') ?? [])]
      .map(th => th.textContent?.trim() ?? '');
    expect(entetes).toContain('Référence carbone');
    expect(entetes).toContain('Code article ERP');

    // Les quatre indicateurs de synthèse doivent coiffer le tableau.
    expect(ecran?.querySelectorAll('.kpi-carte').length).toBe(4);

    expect(hote.querySelector('.ecran-a-venir')).toBeNull();
  }, 30_000);

  it('la bascule du scope ne change pas l\'onglet actif', () => {
    const composant = ouvrirMenuScope3().componentInstance;

    composant.setActive('transformation-produits');
    composant.toggleScope('scope1');

    expect(composant.activeScope).toBe('scope1');
    expect(composant.activeSub).toBe('transformation-produits');
  }, 30_000);
});
