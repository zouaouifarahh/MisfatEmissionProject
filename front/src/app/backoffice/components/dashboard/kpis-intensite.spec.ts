import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { EmissionStats } from '../../../services/emission-stats.service';
import { ActivityDataService, DonneesActivite, releveVide } from '../../../core/activity-data.service';

/**
 * Ratios d'intensité et productivité carbone du tableau de bord.
 *
 * <p>Deux fautes se logeaient ici. La première tenait à l'unité : l'empreinte
 * est servie en tonnes, et un ratio par unité produite doit passer au
 * kilogramme sous peine de n'afficher que des zéros — une pièce de filtration
 * pèse quelques centaines de grammes de CO₂.</p>
 *
 * <p>La seconde tenait au dénominateur manquant. Un ratio sans activité
 * renseignée rendait zéro, et un zéro se lit comme une intensité nulle,
 * c'est-à-dire comme une performance parfaite. La jauge affichait même un
 * badge vert « BON » sur un périmètre dont personne n'avait saisi la
 * production.</p>
 *
 * <p>Les unités sont celles de l'écran Consolidation Groupe : tCO₂e par salarié
 * et par million de chiffre d'affaires, kgCO₂e par unité produite. Deux écrans
 * qui annoncent le même ratio ne doivent pas le calculer différemment.</p>
 */
describe('Tableau de bord — intensités et productivité carbone', () => {

  const FILIALES = [
    { id: 1, libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND' }
  ];

  /** 120 tCO₂e sur l'exercice consulté. */
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

  /**
   * Renseigne l'activité de l'exercice consulté.
   *
   * <p>Sur la consolidation groupe, la société vaut `null` : c'est la forme
   * que le tableau de bord passe à l'annuaire tant qu'aucune filiale n'est
   * choisie.</p>
   */
  const poserActivite = (champs: Partial<DonneesActivite>) => {
    TestBed.inject(ActivityDataService)
      .enregistrer(null, { ...releveVide(EXERCICE), ...champs, annee: EXERCICE });
  };

  /**
   * Monte la console et sert ses appels jusqu'à stabilisation.
   *
   * <p>Plusieurs passes : le filtre global n'émet qu'une fois les exercices
   * revenus, et l'agrégat n'est demandé qu'à ce moment. Servir en une seule
   * vague laisserait la console sans agrégat, donc tous les ratios à zéro.</p>
   */
  const monter = () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);

    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) break;

      for (const requete of attente) {
        if (requete.request.url.includes('/emissions/stats/aggregate')) {
          requete.flush(reponseServeur);
        } else if (requete.request.url.includes('/filiales')) {
          requete.flush(FILIALES);
        } else if (requete.request.url.includes('/annees')) {
          requete.flush([{ id: 1, valeur: EXERCICE, statut: 'EN_COURS' }]);
        } else {
          requete.flush([]);
        }
      }

      fixture.detectChanges();
    }

    fixture.componentInstance.selectedAnnee = EXERCICE;
    fixture.detectChanges();
    return fixture;
  };

  describe('conversion des unités', () => {

    it('rend l\'intensité produit en kgCO₂e, non en tonnes', () => {
      poserActivite({ production: 60_000 });
      const composant = monter().componentInstance;

      // 120 tCO₂e = 120 000 kg, pour 60 000 pièces.
      expect(composant.intensiteCarbone).toBeCloseTo(2, 6);
    });

    it('rend l\'intensité par salarié en tCO₂e', () => {
      poserActivite({ effectif: 400 });
      const composant = monter().componentInstance;

      expect(composant.intensiteEffectif).toBeCloseTo(0.3, 6);
    });

    it('rend l\'intensité au chiffre d\'affaires par million', () => {
      // Le chiffre d'affaires est déjà tenu en millions : il sert de
      // dénominateur tel quel, sans conversion.
      poserActivite({ chiffreAffairesM: 24 });
      const composant = monter().componentInstance;

      expect(composant.intensiteChiffreAffaires).toBeCloseTo(5, 6);
    });

    it('lit les dénominateurs de l\'exercice consulté, pas du dernier renseigné', () => {
      const activite = TestBed.inject(ActivityDataService);
      activite.enregistrer(null, { ...releveVide(EXERCICE), effectif: 400, annee: EXERCICE });
      activite.enregistrer(null, { ...releveVide(2026), effectif: 1_000, annee: 2026 });

      const composant = monter().componentInstance;

      // Rapporter l'empreinte de 2024 à l'effectif de 2026 donnerait un ratio
      // qui ne documente aucune année.
      expect(composant.intensiteEffectif).toBeCloseTo(0.3, 6);
    });
  });

  describe('dénominateur manquant', () => {

    it('rend null plutôt que zéro sur chaque ratio', () => {
      // Aucune activité n'est renseignée : un zéro se lirait comme une
      // empreinte nulle, c'est-à-dire comme une performance parfaite.
      const composant = monter().componentInstance;

      expect(composant.intensiteCarbone).toBeNull();
      expect(composant.intensiteEffectif).toBeNull();
      expect(composant.intensiteChiffreAffaires).toBeNull();
    });

    it('refuse un dénominateur à zéro comme un dénominateur absent', () => {
      poserActivite({ production: 0, effectif: 0, chiffreAffairesM: 0 });
      const composant = monter().componentInstance;

      expect(composant.intensiteCarbone).toBeNull();
      expect(composant.intensiteEffectif).toBeNull();
    });

    it('n\'annonce aucun ratio isolément calculable comme manquant', () => {
      // Une production renseignée suffit à son propre ratio : les autres
      // restent vides sans l'entraîner avec eux.
      poserActivite({ production: 60_000 });
      const composant = monter().componentInstance;

      expect(composant.intensiteCarbone).toBeCloseTo(2, 6);
      expect(composant.intensiteEffectif).toBeNull();
    });

    it('affiche un tiret, et non un nombre, dans les cartes de synthèse', () => {
      const hote: HTMLElement = monter().nativeElement;

      const valeurs = [...hote.querySelectorAll('.synthese-card .synthese-value')]
        .map(n => n.textContent?.trim());

      expect(valeurs).toContain('—');
    });
  });

  describe('jauge d\'intensité', () => {

    it('ne se déclare pas « BON » sur une production non renseignée', () => {
      const composant = monter().componentInstance;
      const jauge = composant.jaugeIntensite;

      expect(jauge.statut).toBe('NON RENSEIGNÉ');
      expect(jauge.renseignee).toBe(false);
      expect(jauge.libelle).toContain('non calculable');
      // L'aiguille reste au repos plutôt que de désigner une valeur.
      expect(jauge.pctEchelle).toBe(0);
    });

    it('situe une intensité mesurée contre le repère sectoriel', () => {
      poserActivite({ production: 60_000 });
      const composant = monter().componentInstance;

      // 2 kgCO₂e / unité pour un repère de 5 : sous les 60 % du seuil.
      const jauge = composant.jaugeIntensite;
      expect(jauge.statut).toBe('BON');
      expect(jauge.renseignee).toBe(true);
      expect(jauge.valeur).toBeCloseTo(2, 6);
    });

    it('passe en critique au-delà du repère', () => {
      // 120 000 kg pour 15 000 pièces : 8 kgCO₂e l'unité, au-dessus de 5.
      poserActivite({ production: 15_000 });
      const composant = monter().componentInstance;

      expect(composant.jaugeIntensite.statut).toBe('CRITIQUE');
    });

    it('bloque l\'aiguille en butée plutôt que de la sortir du cadran', () => {
      poserActivite({ production: 1_000 });
      const composant = monter().componentInstance;

      // 120 kgCO₂e l'unité, très au-delà de l'échelle qui court à 10.
      const jauge = composant.jaugeIntensite;
      expect(jauge.pctEchelle).toBe(100);
      expect(jauge.libelle).toContain('Hors échelle');
    });
  });
});
