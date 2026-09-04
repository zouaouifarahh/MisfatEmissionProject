import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';
import { ActivityDataService, DonneesActivite, releveVide } from '../../../core/activity-data.service';

/**
 * Cartes d'activité du tableau de bord.
 *
 * <p>Deux libellés induisaient en erreur. Le chiffre d'affaires s'affichait en
 * millions sous l'étiquette « M TND » : « 182 » ne dit pas de quoi il s'agit,
 * et l'ordre de grandeur se lisait de travers d'un coup d'œil.</p>
 *
 * <p>La page portait par ailleurs deux jeux de cartes sur les mêmes relevés :
 * la vue d'ensemble en haut, quatre cartes à courbe en bas. Le second est
 * retiré, comme la carte de productivité carbone ; à leur place, un lexique dit
 * ce que chaque indicateur mesure.</p>
 */
describe('Tableau de bord — cartes d\'activité', () => {

  const FILIALES = [
    { id: 1, libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND' }
  ];

  const reponseServeur: EmissionStats = {
    mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: 34,
    total: 120, scope1: 50, scope2: 30, scope3: 40,
    byScope: { SCOPE_1: 50, SCOPE_2: 30, SCOPE_3: 40 },
    byCategory: {}, byScopeCategory: {},
    byFiliale: [{ filialeId: 1, value: 120, share: 100, measureCount: 34 }],
    byCurrency: {}, unconvertedCurrencies: []
  };

  const EXERCICE = 2024;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  const poserActivite = (annee: number, champs: Partial<DonneesActivite>) => {
    TestBed.inject(ActivityDataService)
      .enregistrer(null, { ...releveVide(annee), ...champs, annee });
  };

  const monter = () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;
      for (const requete of attente) {
        if (requete.request.url.includes('/emissions/stats/aggregate')) requete.flush(reponseServeur);
        else if (requete.request.url.includes('/filiales')) requete.flush(FILIALES);
        else if (requete.request.url.includes('/annees')) {
          requete.flush([{ id: 1, valeur: EXERCICE, statut: 'EN_COURS' }]);
        } else requete.flush([]);
      }
      fixture.detectChanges();
    }

    fixture.componentInstance.selectedAnnee = EXERCICE;
    fixture.detectChanges();
    return fixture;
  };

  /** La carte d'activité portant un identifiant donné. */
  const carte = (composant: DashboardComponent, id: string) =>
    composant.kpisEntreprise.find(k => k.id === id)!;

  describe('chiffre d\'affaires', () => {

    it('s\'exprime dans la devise, non en millions', () => {
      const composant = monter().componentInstance;
      expect(carte(composant, 'ca').unite).toBe('TND');
      expect(carte(composant, 'ca').unite).not.toContain('M ');
    });

    it('rend la valeur entière plutôt que son millionième', () => {
      // 182,5 millions se lit « 182 500 000 TND », non « 182,5 ».
      poserActivite(EXERCICE, { chiffreAffairesM: 182.5 });
      const composant = monter().componentInstance;

      expect(composant.getValeurActuelle(carte(composant, 'ca')).valeur).toBe(182_500_000);
    });

    it('laisse les autres cartes dans leur unité', () => {
      // La production et les ventes restent en millions d'unités : seul le
      // chiffre d'affaires changeait d'échelle.
      const composant = monter().componentInstance;

      expect(carte(composant, 'production').unite).toBe('M unités');
      expect(carte(composant, 'ventes').unite).toBe('M unités');
      expect(carte(composant, 'effectifs').unite).toBe('employés');
    });
  });

  describe('cartes retirées et lexique', () => {

    it('ne montre plus la carte de productivité carbone', () => {
      poserActivite(EXERCICE, { chiffreAffairesM: 24 });
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('[data-teinte="productivite"]')).toBeNull();
      expect(hote.textContent).not.toContain('Productivité carbone');
    });

    it("ne garde qu'un seul jeu de cartes d'indicateurs", () => {
      // Les quatre cartes à courbe du bas de page reprenaient les relevés que
      // la vue d'ensemble donne déjà en haut : mêmes chiffres, deux endroits.
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelector('.kpi-trend-grid')).toBeNull();
      expect(hote.querySelectorAll('.synthese-card').length).toBe(4);
    });

    it('explique les quatre indicateurs à la direction', () => {
      // Un comité lit « 2 kg CO₂e / unité » sans savoir ce que la ligne mesure :
      // chaque carte a désormais sa définition, dans le même ordre.
      const hote: HTMLElement = monter().nativeElement;

      expect(hote.querySelectorAll('.kpi-lexique-entree').length).toBe(4);
      expect(hote.textContent).toContain('impact carbone généré par chaque unité produite');
      expect(hote.textContent).toContain('Volume total des unités produites');
    });
  });
});
