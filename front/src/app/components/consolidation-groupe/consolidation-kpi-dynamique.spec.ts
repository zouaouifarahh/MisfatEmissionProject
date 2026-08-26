import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { of } from 'rxjs';

import { ConsolidationGroupeComponent } from './consolidation-groupe.component';
import { OrganizationService } from '../../services/organization.service';
import { BilanCarboneService } from '../../core/bilan-carbone.service';
import { EntityContextService } from '../../core/entity-context.service';
import {
  ActivityDataService, releveVide, chiffreAffairesEnMillions
} from '../../core/activity-data.service';

/**
 * Liaison entre la saisie des KPI et la Consolidation Groupe.
 *
 * <p>Les ratios du tableau ne dépendent pas des seules émissions : ils
 * divisent par un effectif, un chiffre d'affaires, un volume produit, tous
 * saisis dans un autre écran. Tant que la consolidation lisait ces
 * dénominateurs une fois pour toutes, elle affichait un tableau juste au
 * moment de son ouverture et faux ensuite.</p>
 *
 * <p>Deux désaccords se cumulaient. L'écran s'ouvrait sur le dernier millésime
 * ouvert — 2026 — sans regarder l'exercice consulté : un KPI saisi sur 2025
 * n'apparaissait nulle part. Et rien ne l'abonnait à l'annuaire d'activité :
 * un enregistrement laissait le tableau inchangé.</p>
 */
describe('Consolidation Groupe — liaison dynamique aux KPI', () => {

  const FILIALES = [
    { id: 1, libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND' },
    { id: 2, libelle: 'MISFAT MAROC', pays: 'Maroc', devise: 'MAD' }
  ] as any[];

  const ANNEES = [
    { id: 4, valeur: 2025, statut: 'CLOTUREE' },
    { id: 5, valeur: 2026, statut: 'CLOTUREE' }
  ] as any[];

  /** Empreintes servies par filiale : 1 000 t pour la Tunisie, 400 t pour le Maroc. */
  const bilanDe = (entityId: number | null) => of({
    totalKg: entityId === 1 ? 1_000_000 : 400_000,
    scope1Kg: entityId === 1 ? 600_000 : 200_000,
    scope2Kg: entityId === 1 ? 300_000 : 150_000,
    scope3Kg: entityId === 1 ? 100_000 : 50_000,
    serveurJoignable: true
  } as any);

  let composant: ConsolidationGroupeComponent;
  let activite: ActivityDataService;
  let contexte: EntityContextService;

  const monter = () => {
    const fixture = TestBed.createComponent(ConsolidationGroupeComponent);
    composant = fixture.componentInstance;
    composant.ngOnInit();
    return fixture;
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [ConsolidationGroupeComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        {
          provide: OrganizationService,
          useValue: { getFiliales: () => of(FILIALES), getAnnees: () => of(ANNEES) }
        },
        { provide: BilanCarboneService, useValue: { charger: bilanDe } }
      ]
    });

    activite = TestBed.inject(ActivityDataService);
    contexte = TestBed.inject(EntityContextService);
  });

  /** Ligne du tableau comparatif pour une filiale. */
  const ligne = (libelle: string) =>
    composant.consolidation?.lignes.find(l => l.libelle === libelle) ?? null;

  describe('exercice consulté', () => {

    it('s\'ouvre sur l\'exercice du filtre, non sur le dernier millésime ouvert', () => {
      contexte.selectYear(2025);
      monter();

      // 2026 est le millésime le plus récent ; c'est 2025 qui est consulté.
      expect(composant.exercice).toBe(2025);
    });

    it('recalcule les ratios quand l\'année du filtre change', () => {
      contexte.selectYear(2026);
      monter();

      activite.enregistrer(1, { ...releveVide(2025), effectif: 500 });
      expect(ligne('MISFAT TUNISIE')?.intensiteEffectif).toBeNull();

      // Le passage à 2025 doit faire apparaître le relevé de cet exercice.
      contexte.selectYear(2025);

      expect(composant.exercice).toBe(2025);
      expect(ligne('MISFAT TUNISIE')?.intensiteEffectif).toBeCloseTo(1_000 / 500, 6);
    });
  });

  describe('réaction à l\'enregistrement d\'un KPI', () => {

    beforeEach(() => {
      contexte.selectYear(2025);
      monter();
    });

    it('n\'affiche aucun ratio tant que les dénominateurs manquent', () => {
      const tunisie = ligne('MISFAT TUNISIE');
      expect(tunisie?.total).toBeCloseTo(1_000, 6);
      expect(tunisie?.intensiteEffectif).toBeNull();
      expect(tunisie?.intensiteChiffreAffaires).toBeNull();
      expect(tunisie?.intensiteProduction).toBeNull();
    });

    it('met à jour les trois ratios dès la sauvegarde, sans rechargement', () => {
      activite.enregistrer(1, {
        ...releveVide(2025), effectif: 500, chiffreAffairesM: 450, production: 2_000_000
      });

      const tunisie = ligne('MISFAT TUNISIE');
      // t/salarié = 1 000 / 500
      expect(tunisie?.intensiteEffectif).toBeCloseTo(2, 6);
      // t/M CA = 1 000 / 450
      expect(tunisie?.intensiteChiffreAffaires).toBeCloseTo(1_000 / 450, 6);
      // kg/unité = 1 000 × 1 000 / 2 000 000
      expect(tunisie?.intensiteProduction).toBeCloseTo(0.5, 6);
    });

    it('ne touche pas aux filiales dont les KPI n\'ont pas changé', () => {
      activite.enregistrer(1, { ...releveVide(2025), effectif: 500 });

      expect(ligne('MISFAT MAROC')?.intensiteEffectif).toBeNull();
      expect(ligne('MISFAT MAROC')?.total).toBeCloseTo(400, 6);
    });

    it('retire la filiale du bandeau « à compléter » une fois renseignée', () => {
      expect(composant.aCompleter).toContain('MISFAT TUNISIE');

      activite.enregistrer(1, {
        ...releveVide(2025), effectif: 500, chiffreAffairesM: 450, production: 2_000_000
      });

      expect(composant.aCompleter).not.toContain('MISFAT TUNISIE');
    });

    it('reflète aussi une suppression de relevé', () => {
      activite.enregistrer(1, { ...releveVide(2025), effectif: 500 });
      expect(ligne('MISFAT TUNISIE')?.intensiteEffectif).toBeCloseTo(2, 6);

      activite.supprimer(1, 2025);
      expect(ligne('MISFAT TUNISIE')?.intensiteEffectif).toBeNull();
    });
  });

  describe('unité du chiffre d\'affaires', () => {

    it('convertit une saisie faite en unités plutôt qu\'en millions', () => {
      expect(chiffreAffairesEnMillions(450_000_000)).toBe(450);
    });

    it('laisse intacte une saisie déjà exprimée en millions', () => {
      expect(chiffreAffairesEnMillions(450)).toBe(450);
      expect(chiffreAffairesEnMillions(10_000)).toBe(10_000);
    });

    it('ne convertit ni le vide ni le non-nombre', () => {
      expect(chiffreAffairesEnMillions(null)).toBeNull();
      expect(chiffreAffairesEnMillions(undefined)).toBeNull();
      expect(chiffreAffairesEnMillions(Number.NaN)).toBeNull();
    });

    it('donne le même ratio que la valeur soit saisie en unités ou en millions', () => {
      contexte.selectYear(2025);
      monter();

      activite.enregistrer(1, { ...releveVide(2025), chiffreAffairesM: 450_000_000 });
      const parUnites = ligne('MISFAT TUNISIE')?.intensiteChiffreAffaires;

      activite.enregistrer(1, { ...releveVide(2025), chiffreAffairesM: 450 });
      const parMillions = ligne('MISFAT TUNISIE')?.intensiteChiffreAffaires;

      // Sans requalification, le premier ratio valait un millionième du second.
      expect(parUnites).toBeCloseTo(1_000 / 450, 6);
      expect(parUnites).toBeCloseTo(parMillions!, 6);
    });

    it('requalifie aussi un relevé stocké avant le correctif', () => {
      // Écriture directe dans le stockage : l'annuaire ne l'a jamais normalisée.
      localStorage.setItem('misfat_donnees_activite', JSON.stringify({
        '1': [{ annee: 2025, chiffreAffairesM: 450_000_000, effectif: 500,
                vehiculesFonction: null, production: null, ventes: null }]
      }));

      activite.synchroniser();
      expect(activite.valeur(1, 2025, 'chiffreAffairesM')).toBe(450);
    });
  });
});
