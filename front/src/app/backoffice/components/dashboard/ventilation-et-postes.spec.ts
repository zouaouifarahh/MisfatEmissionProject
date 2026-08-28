import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';

/**
 * Postes du tableau de bord : rattachement des libellés et cloisonnement.
 *
 * <p>Deux défauts laissaient des postes à zéro devant des données bien
 * présentes, et aucun des deux ne se voyait à l'écran.</p>
 *
 * <p>Le premier tenait au rapprochement des libellés : la clé de comparaison
 * était désaccentuée d'un côté seulement. « Émissions de réfrigérants » ne
 * pouvait donc jamais se reconnaître dans la nomenclature — le poste partait en
 * fin de liste hors nomenclature, pendant que la ligne prévue par le
 * référentiel restait affichée à zéro. La même mesure se lisait ainsi deux
 * fois : nulle à sa place, et orpheline plus bas.</p>
 *
 * <p>Le second tient au cloisonnement, qui lui est juste : une balance solde un
 * exercice et un seul. Mais l'écran d'import affichait le total du classeur
 * sans filtre quand le tableau de bord rendait zéro sans un mot.</p>
 */
describe('Tableau de bord — postes et cloisonnement de la ventilation', () => {

  const vide: EmissionStats = {
    mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: 0,
    total: 0, scope1: 0, scope2: 0, scope3: 0,
    byScope: {}, byCategory: {}, byScopeCategory: {}, byFiliale: [],
    byCurrency: {}, unconvertedCurrencies: []
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  /** Monte la console et absorbe ses appels, sans en servir aucun de particulier. */
  function composant(): DashboardComponent {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) requete.flush([]);
      fixture.detectChanges();
    }

    return fixture.componentInstance;
  }

  /** Poste d'un scope, retrouvé par son libellé de nomenclature. */
  const poste = (postes: { nom: string; valeur: number }[], nom: string) =>
    postes.find(p => p.nom === nom);

  describe('rattachement d\'un libellé à la nomenclature', () => {

    it('reconnaît un libellé accentué', () => {
      // C'est le cas qui échouait : la clé était désaccentuée, le libellé de
      // référence ne l'était pas, et les deux ne pouvaient pas se rejoindre.
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope1: 12, total: 12,
        byScopeCategory: { SCOPE_1: { 'Émissions de réfrigérants': 12 } }
      };

      expect(poste(dash.scope1Postes, 'Émissions de réfrigérants')?.valeur).toBe(12);
    });

    it('ne laisse pas de poste orphelin en fin de liste', () => {
      // Le doublon est l'autre moitié du défaut : la mesure comptait bien dans
      // le total, mais sous un poste parallèle que la nomenclature ignore.
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope1: 12, total: 12,
        byScopeCategory: { SCOPE_1: { 'Emissions de refrigerants': 12 } }
      };

      expect(dash.scope1Postes).toHaveLength(3);
      expect(poste(dash.scope1Postes, 'Émissions de réfrigérants')?.valeur).toBe(12);
    });

    it('reconnaît le code court de la nomenclature', () => {
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope3: 19_628, total: 19_628,
        byScopeCategory: { SCOPE_3: { 'C15': 19_628 } }
      };

      expect(poste(dash.scope3Postes, 'Investissements')?.valeur).toBe(19_628);
    });

    it('reconnaît le libellé GHG numéroté', () => {
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope3: 40, total: 40,
        byScopeCategory: { SCOPE_3: { 'Category 15: Investments': 40 } }
      };

      expect(poste(dash.scope3Postes, 'Investissements')?.valeur).toBe(40);
    });

    it('additionne les écritures d\'un même poste', () => {
      // Le classeur, la saisie et la base ne nomment pas la catégorie de la
      // même façon : les trois écritures doivent tomber sur le même poste.
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope3: 6, total: 6,
        byScopeCategory: {
          SCOPE_3: { 'C15': 1, 'Category 15: Investments': 2, 'investissements': 3 }
        }
      };

      expect(poste(dash.scope3Postes, 'Investissements')?.valeur).toBe(6);
      expect(dash.scope3Postes).toHaveLength(15);
    });

    it('garde hors nomenclature ce qu\'aucune règle ne rattache', () => {
      // Une catégorie inconnue n'est pas absorbée de force : elle est ajoutée
      // en fin de liste, pour qu'aucune mesure ne sorte du total affiché.
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope3: 5, total: 5,
        byScopeCategory: { SCOPE_3: { 'Poste maison': 5 } }
      };

      expect(poste(dash.scope3Postes, 'Poste maison')?.valeur).toBe(5);
      expect(dash.scope3Postes).toHaveLength(16);
    });

    it('ne confond pas un libellé commençant par C avec un code', () => {
      // « C15 » désigne le quinzième poste ; « Combustion… » n'est pas un code,
      // et le rattacher au numéro 0 déplacerait la mesure au hasard.
      const dash = composant();
      dash.statsReelles = {
        ...vide, scope1: 9, total: 9,
        byScopeCategory: { SCOPE_1: { 'Combustion dans les usines': 9 } }
      };

      expect(poste(dash.scope1Postes, 'Combustion dans les usines')?.valeur).toBe(9);
    });
  });

  describe('ventilation retenue par le cloisonnement', () => {

    /** Répartition d'un classeur soldant un exercice donné. */
    function publierRepartition(dash: DashboardComponent, exercice: number | null): void {
      (dash as any).dispatchStore.publier({
        fichier: 'Balance 2026.xlsx', importeLe: '', exclues: 0, nonVentilees: 0,
        exercice, entityId: null,
        lignes: [{
          cle: 'a', ecran: 'investissements', scope: 'SCOPE_3',
          emissionKg: 19_628_000, facteur: 0.4, persisteeEnBase: false
        }]
      });
    }

    it('ne dit rien quand la répartition relève du périmètre', () => {
      const dash = composant();
      publierRepartition(dash, 2025);
      (dash as any).dispatchStore.suivrePerimetre(2025, null);

      expect(dash.ventilationHorsPerimetre).toBeNull();
    });

    it('dit ce qui est retenu quand elle documente un autre exercice', () => {
      // Le symptôme signalé : dix-neuf mille tonnes visibles à l'import, zéro
      // au tableau de bord, et rien pour expliquer l'écart.
      const dash = composant();
      publierRepartition(dash, 2026);
      (dash as any).dispatchStore.suivrePerimetre(2025, null);

      const hors = dash.ventilationHorsPerimetre;
      expect(hors).not.toBeNull();
      expect(hors!.exercice).toBe(2026);
      expect(hors!.tonnes).toBeCloseTo(19_628, 0);
      expect(hors!.lignes).toBe(1);
    });

    it('se tait quand il n\'y a aucune répartition', () => {
      const dash = composant();
      (dash as any).dispatchStore.suivrePerimetre(2025, null);

      expect(dash.ventilationHorsPerimetre).toBeNull();
    });

    it('rattache la répartition à l\'exercice consulté sur demande', () => {
      // Le rattachement reste une décision : le bandeau l'expose, il ne
      // l'applique pas de lui-même.
      const dash = composant();
      publierRepartition(dash, 2026);
      (dash as any).dispatchStore.suivrePerimetre(2025, null);
      (dash as any).entityService.selectYear(2025);

      dash.rattacherVentilationALExerciceConsulte();

      expect((dash as any).dispatchStore.instantane.exercice).toBe(2025);
      expect(dash.ventilationHorsPerimetre).toBeNull();
    });
  });
});
