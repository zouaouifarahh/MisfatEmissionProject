import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { InvestissementsComponent } from './investissements';
import { CorrectionAnomaliesComponent } from '../../shared/ui/correction-anomalies';

/**
 * Correction des lignes qu'une bannière d'alerte signale.
 *
 * <p>« 1 572 immobilisations sans catégorie carbone » laissait l'utilisateur
 * les chercher dans un tableau paginé de plusieurs milliers d'entrées, puis les
 * corriger une à une. La bannière mène désormais aux lignes, et le panneau les
 * traite en un geste.</p>
 *
 * <p>Ce que ces bancs protègent : qu'une correction fasse réellement basculer
 * la ligne en état documenté — sans quoi elle resterait comptée dans l'alerte —
 * et que rien ne soit écrit avant la validation, l'utilisateur gardant le droit
 * de se raviser.</p>
 */
describe('Correction des immobilisations en anomalie', () => {

  /** Facteur du référentiel, servi comme l'API le renvoie. */
  const FACTEURS = [{
    id: 1, factorValue: 0.38, unit: 'TND', dataType: 'MONETAIRE', currency: 'TND',
    databaseSource: 'Base carbone interne', referenceYear: 2024, validityLabel: null,
    carbonReference: {
      referenceCode: 'MS3C15ME', typeName: 'Metals / Metal products, monetary',
      category: { name: 'Category 15: Investments', scope: { code: 'SCOPE_3' } }
    }
  }];

  /** Trois immobilisations dont la famille a été appliquée d'office. */
  const ANOMALIES = [1, 2, 3].map(id => ({
    id, scope: 'SCOPE_3', categorie: 'Investissements', numeroImmo: `IMM-${id}`,
    designation: `Actif ${id}`, categorieCarbone: 'Équipements Ind. (Fallback #N/A)',
    categorieTexte: '#N/A', replique: true, montant: 10_000 * id, devise: 'TND',
    facteur: 0.25, uniteFacteur: 'TND', libelleFacteur: '',
    baseAppliquee: 'ADEME Fallback', origineFacteur: 'ADEME Fallback',
    emissionCalculee: 2_500 * id, creeLe: ''
  }));

  let composant: any;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('listeEmissionsInvestissements', JSON.stringify(ANOMALIES));

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    const fixture = TestBed.createComponent(InvestissementsComponent);
    composant = fixture.componentInstance;
    fixture.detectChanges();

    for (let passe = 0; passe < 3; passe++) {
      const attente = TestBed.inject(HttpTestingController).match(() => true);
      if (!attente.length) break;
      attente.forEach(r => r.flush(r.request.url.includes('emission-factors') ? FACTEURS : []));
      fixture.detectChanges();
    }
  });

  describe('ouverture depuis la bannière', () => {

    it('compte les lignes que la bannière annonce', () => {
      expect(composant.nombreReplis).toBe(3);
      expect(composant.lignesEnAnomalie).toHaveLength(3);
    });

    it('ouvre et referme le panneau', () => {
      expect(composant.correctionOuverte).toBe(false);

      composant.ouvrirCorrection();
      expect(composant.correctionOuverte).toBe(true);

      composant.fermerCorrection();
      expect(composant.correctionOuverte).toBe(false);
    });

    it('propose les catégories documentées, jamais celle de repli', () => {
      // Proposer « Équipements Ind. (Fallback #N/A) » comme correction
      // reviendrait à offrir de remplacer le repli par lui-même.
      expect(composant.categoriesProposees).not.toContain(composant.categorieRepli);
      expect(composant.categoriesProposees.length).toBeGreaterThan(0);
    });
  });

  describe('application des corrections', () => {

    it('sort une ligne corrigée du décompte de l\'alerte', () => {
      composant.appliquerCorrections({
        corrections: [{ id: 1, categorie: 'Metals / Metal Products' }],
        suppressions: []
      });

      // C'est ce qui fait décroître la bannière : la ligne cesse d'être un repli.
      expect(composant.nombreReplis).toBe(2);
      expect(composant.listeEmissions.find((l: any) => l.id === 1).replique).toBe(false);
    });

    it('revalorise la ligne par le référentiel', () => {
      composant.appliquerCorrections({
        corrections: [{ id: 1, categorie: 'Metals / Metal Products' }],
        suppressions: []
      });

      const corrigee = composant.listeEmissions.find((l: any) => l.id === 1);
      // Le facteur du référentiel remplace le 0,250 de sécurité, et l'émission
      // suit : 10 000 × 0,38.
      expect(corrigee.facteur).toBeCloseTo(0.38, 10);
      expect(corrigee.emissionCalculee).toBeCloseTo(3_800, 4);
      expect(corrigee.referenceCarbone).toBe('MS3C15ME');
    });

    it('laisse primer un facteur saisi à la main', () => {
      composant.appliquerCorrections({
        corrections: [{ id: 2, categorie: 'Metals / Metal Products', facteur: 0.9 }],
        suppressions: []
      });

      const corrigee = composant.listeEmissions.find((l: any) => l.id === 2);
      expect(corrigee.facteur).toBeCloseTo(0.9, 10);
      // 20 000 × 0,9.
      expect(corrigee.emissionCalculee).toBeCloseTo(18_000, 4);
      expect(corrigee.baseAppliquee).toContain('Correction manuelle');
    });

    it('retire les lignes supprimées', () => {
      composant.appliquerCorrections({ corrections: [], suppressions: [1, 3] });

      expect(composant.listeEmissions.map((l: any) => l.id)).toEqual([2]);
      expect(composant.nombreReplis).toBe(1);
    });

    it('fait disparaître l\'alerte quand tout est traité', () => {
      composant.appliquerCorrections({
        corrections: [
          { id: 1, categorie: 'Metals / Metal Products' },
          { id: 2, categorie: 'Metals / Metal Products' }
        ],
        suppressions: [3]
      });

      // La bannière est portée par *ngIf="nombreReplis" : à zéro, elle s'efface.
      expect(composant.nombreReplis).toBe(0);
    });

    it('persiste corrections et suppressions', () => {
      composant.appliquerCorrections({
        corrections: [{ id: 1, categorie: 'Metals / Metal Products' }],
        suppressions: [3]
      });

      const relues = JSON.parse(localStorage.getItem('listeEmissionsInvestissements') ?? '[]');
      expect(relues.map((l: any) => l.id)).toEqual([1, 2]);
      expect(relues.find((l: any) => l.id === 1).replique).toBe(false);
    });

    it('rend compte de ce qui a été fait', () => {
      composant.appliquerCorrections({
        corrections: [{ id: 1, categorie: 'Metals / Metal Products' }],
        suppressions: [2]
      });

      expect(composant.correctionMessage).toContain('1 ligne(s) corrigée(s)');
      expect(composant.correctionMessage).toContain('1 retirée(s)');
      expect(composant.correctionOuverte).toBe(false);
    });

    it('réinjecte la ligne corrigée dans le tableau principal', () => {
      composant.filtreCategorie = 'Metals / Metal Products';
      expect(composant.emissionsFiltrees).toHaveLength(0);

      composant.appliquerCorrections({
        corrections: [{ id: 1, categorie: 'Metals / Metal Products' }],
        suppressions: []
      });

      // Le compteur de la catégorie s'incrémente : la ligne y est visible.
      expect(composant.emissionsFiltrees).toHaveLength(1);
      expect(composant.emissionsFiltrees[0].id).toBe(1);
    });
  });

  describe('panneau isolé — rien n\'est écrit avant validation', () => {

    const monterPanneau = () => {
      const fixture = TestBed.createComponent(CorrectionAnomaliesComponent);
      const panneau = fixture.componentInstance;
      panneau.ouvert = true;
      panneau.lignes = [...ANOMALIES];
      panneau.categories = ['Metals / Metal Products'];
      fixture.detectChanges();
      return { fixture, panneau };
    };

    it('ne compte que les saisies exploitables', () => {
      const { panneau } = monterPanneau();

      expect(panneau.nombreCorrigees).toBe(0);

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      expect(panneau.nombreCorrigees).toBe(1);

      // Une saisie blanche ne compte pas pour une correction.
      panneau.noterCategorie(ANOMALIES[1], '   ');
      expect(panneau.nombreCorrigees).toBe(1);
    });

    it('n\'émet rien tant que la validation n\'est pas demandée', () => {
      const { panneau } = monterPanneau();

      let emis = 0;
      panneau.appliquer.subscribe(() => emis++);

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      panneau.basculerSuppression(ANOMALIES[1]);

      // Appliquer au fil de la frappe recalculerait le bilan à chaque
      // caractère, et priverait l'utilisateur du droit de se raviser.
      expect(emis).toBe(0);
    });

    it('rend les corrections et les suppressions à la validation', () => {
      const { panneau } = monterPanneau();

      let recu: any = null;
      panneau.appliquer.subscribe(r => (recu = r));

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      panneau.noterFacteur(ANOMALIES[1], '0,42');
      panneau.basculerSuppression(ANOMALIES[2]);
      panneau.valider();

      expect(recu.corrections).toHaveLength(2);
      expect(recu.corrections[0]).toMatchObject({ id: 1, categorie: 'Metals / Metal Products' });
      expect(recu.corrections[1].facteur).toBeCloseTo(0.42, 10);
      expect(recu.suppressions).toEqual([3]);
    });

    it('arrête la validation sur un facteur illisible', () => {
      const { panneau } = monterPanneau();

      let emis = 0;
      panneau.appliquer.subscribe(() => emis++);

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      panneau.noterFacteur(ANOMALIES[1], 'abc');
      panneau.valider();

      // Appliquer les autres et taire celle-là laisserait croire à une
      // correction complète.
      expect(emis).toBe(0);
      expect(panneau.erreur).toContain('Facteur illisible');
    });

    it('ne corrige pas une ligne marquée pour retrait', () => {
      const { panneau } = monterPanneau();

      let recu: any = null;
      panneau.appliquer.subscribe(r => (recu = r));

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      panneau.basculerSuppression(ANOMALIES[0]);
      panneau.valider();

      expect(recu.corrections).toHaveLength(0);
      expect(recu.suppressions).toEqual([1]);
    });

    it('oublie les saisies quand on renonce', () => {
      const { panneau } = monterPanneau();

      panneau.noterCategorie(ANOMALIES[0], 'Metals / Metal Products');
      panneau.demanderFermeture();

      expect(panneau.nombreCorrigees).toBe(0);
      expect(panneau.suppressions.size).toBe(0);
    });
  });
});
