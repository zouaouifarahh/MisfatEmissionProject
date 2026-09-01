import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { DashboardComponent } from './dashboard';
import { signalerMesuresLocalesModifiees } from '../../../shared/dispatch/mesures-locales';

/**
 * Histogramme pluriannuel et analyse décisionnelle.
 *
 * <p>Deux exigences se rejoignent ici : l'axe des abscisses doit suivre la
 * table des exercices sans intervention, et la phrase d'analyse ne doit
 * avancer que des chiffres tirés du calcul affiché juste au-dessus.</p>
 */
describe('DashboardComponent — historique pluriannuel', () => {

  /** Exercices ouverts en base ; l'histogramme doit tous les tracer. */
  const ANNEES = [
    { id: 1, valeur: 2024, statut: 'CLOTURE' },
    { id: 2, valeur: 2025, statut: 'CLOTURE' },
    { id: 3, valeur: 2026, statut: 'EN_COURS' }
  ];

  /**
   * Empreintes servies par exercice, en tCO₂e.
   *
   * <p>C'est l'unité que l'agrégat serveur déclare et renvoie : la division par
   * mille est faite avant la réponse. Le bilan les reconvertit en kilogrammes
   * pour les cumuler avec les relevés restés dans le navigateur, puis
   * l'historique revient aux tonnes — les valeurs ci-dessous se retrouvent donc
   * telles quelles sur le graphique.</p>
   */
  const PAR_ANNEE: Record<string, { s1: number; s2: number; s3: number }> = {
    '2024': { s1: 10, s2: 40, s3: 50 },   // 100 t au total
    '2025': { s1: 20, s2: 60, s3: 40 },   // 120 t — hausse de 20 %
    '2026': { s1: 5, s2: 30, s3: 25 }     //  60 t — baisse de 50 %
  };

  const statsPour = (annee: string | null) => {
    const part = (annee && PAR_ANNEE[annee]) || { s1: 0, s2: 0, s3: 0 };
    return {
      mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: part.s1 ? 6 : 0,
      total: part.s1 + part.s2 + part.s3,
      scope1: part.s1, scope2: part.s2, scope3: part.s3,
      byScope: { SCOPE_1: part.s1, SCOPE_2: part.s2, SCOPE_3: part.s3 },
      byCategory: {},
      byScopeCategory: {
        SCOPE_1: { 'Combustion dans les usines': part.s1 },
        SCOPE_2: { 'Électricité achetée': part.s2 },
        SCOPE_3: { 'Category 1: Purchased goods and services': part.s3 }
      },
      byFiliale: [], byCurrency: {}, unconvertedCurrencies: []
    };
  };

  let httpMock: HttpTestingController;

  /** Sert toutes les requêtes, y compris celles que les réponses déclenchent. */
  const servirTout = () => {
    for (let passe = 0; passe < 8; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) return;

      for (const requete of attente) {
        const url = requete.request.url;
        if (url.includes('/stats/aggregate')) {
          requete.flush(statsPour(requete.request.params.get('year')));
        } else if (url.includes('/annees')) {
          requete.flush(ANNEES);
        } else {
          requete.flush([]);
        }
      }
    }
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  const monter = () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    servirTout();
    fixture.detectChanges();
    return fixture;
  };

  it('trace un repère par exercice ouvert en base', () => {
    const fixture = monter();
    const composant = fixture.componentInstance;

    // L'axe suit la table des exercices : aucune année n'est codée en dur.
    expect(composant.historique.map(p => p.annee)).toEqual([2024, 2025, 2026]);
    expect(composant.historiqueRenseigne).toBe(true);

    const reperes = (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.historique-graphe .hist-axe-x .hist-annee');
    expect(reperes).toHaveLength(3);
    expect(reperes[0].textContent?.trim()).toBe('2024');
  });

  it('empile les trois scopes en aires dégradées', () => {
    const fixture = monter();
    const composant = fixture.componentInstance;

    // 2025 pèse 120 tCO₂e, réparties entre les trois scopes.
    const point = composant.historique.find(p => p.annee === 2025)!;
    expect(point.scope1).toBe(20);
    expect(point.scope2).toBe(60);
    expect(point.scope3).toBe(40);
    expect(point.total).toBe(120);

    // Une aire et une courbe par scope, chacune remplie de son dégradé.
    const aires = composant.airesHistorique;
    expect(aires.map(a => a.id)).toEqual(['s1', 's2', 's3']);
    expect(aires.every(a => a.aire.startsWith('M') && a.aire.endsWith('Z'))).toBe(true);
    expect(aires.every(a => a.ligne.includes(' C '))).toBe(true);

    const hote: HTMLElement = fixture.nativeElement;
    expect(hote.querySelectorAll('.hist-toile svg linearGradient')).toHaveLength(3);
    expect(hote.querySelectorAll('.hist-toile svg path.hist-ligne')).toHaveLength(3);
  });

  it('met l\'échelle sur l\'exercice le plus chargé', () => {
    const composant = monter().componentInstance;

    // 2025 pèse le plus (120 t) : sa courbe touche le haut de la zone.
    const marqueurs = composant.marqueursHistorique;
    const plusHaut = marqueurs.find(m => m.annee === 2025)!;
    const moitie = marqueurs.find(m => m.annee === 2026)!;

    expect(plusHaut.y).toBeLessThan(moitie.y);

    // 2026 pèse la moitié : son ordonnée est au milieu de la zone utile.
    const hautZone = plusHaut.y;
    const basZone = composant.svgHaut - 12;
    expect(moitie.y).toBeCloseTo(hautZone + (basZone - hautZone) / 2, 1);
  });

  it('laisse de l\'air au-dessus du plus grand exercice', () => {
    // L'échelle s'arrêtait exactement sur le plus grand exercice : son point
    // culminant se posait sur la marge haute, et le marqueur qui le désigne —
    // un disque centré sur l'ordonnée — s'y trouvait coupé de moitié. Le
    // sommet touchait le bord, ce qui se lit comme un tracé tronqué.
    const composant = monter().componentInstance;

    const plusHaut = Math.min(...composant.marqueursHistorique.map(m => m.y));
    expect(plusHaut).toBeGreaterThan(16);

    // Le repère du haut porte le plafond, non le maximum collecté : 120 tCO₂e
    // au plus fort exercice, une échelle qui monte à 140.
    const sommet = composant.grilleHistorique[0];
    expect(sommet.libelle).toBe(composant.formatCompact(140));
  });

  it('arrondit le plafond plutôt que de le laisser au décimal près', () => {
    // « 140 » se lit, « 134,4 » se déchiffre. L'arrondi porte la marge au-delà
    // des douze pour cent visés, jamais en deçà.
    const composant = monter().componentInstance;
    const sommet = Number(composant.grilleHistorique[0].libelle.replace(',', '.'));

    expect(sommet).toBeGreaterThanOrEqual(120 * 1.1);
    expect(sommet % 10).toBe(0);
  });

  it('trace une seule trajectoire cible pour 2030', () => {
    // Le graphique portait deux objectifs pour cette même année : un « −30 % »
    // générique et le jalon SBTi « −50 % ». Deux cibles pour un millésime ne
    // sont pas une redondance d'affichage — c'est une trajectoire dont on ne
    // sait plus laquelle engage. Seule celle du jalon SBTi subsiste.
    const fixture = monter();
    const composant = fixture.componentInstance;
    const cible = composant.cibleHistorique!;

    // Premier exercice collecté : 2024, 100 tCO₂e. La cible vaut 50 tCO₂e.
    expect(cible.valeur).toBeCloseTo(50, 6);
    expect(cible.libelle).toContain('Cible SBTi −50 % (2030)');

    expect(composant.jalonsHistorique.map(j => j.annee)).not.toContain(2030);
    expect((fixture.nativeElement as HTMLElement).querySelector('line.hist-cible')).toBeTruthy();
  });

  it('écarte les étiquettes de trajectoire qui se recouvriraient', () => {
    // Un jalon à −25 % et une cible à −50 % peuvent tomber à quelques unités
    // l'un de l'autre sur une échelle écrasée : leurs libellés s'écrivaient
    // alors l'un sur l'autre, et aucun des deux ne se lisait.
    const composant = monter().componentInstance;
    const etiquettes = composant.etiquettesHistorique;

    expect(etiquettes.length).toBeGreaterThan(1);

    const ordonnees = etiquettes.map(e => e.y).sort((a, b) => a - b);
    for (let i = 1; i < ordonnees.length; i++) {
      expect(ordonnees[i] - ordonnees[i - 1]).toBeGreaterThanOrEqual(15.9);
    }
  });

  it('rend chaque repère cliquable pour changer d\'exercice', () => {
    const fixture = monter();
    const composant = fixture.componentInstance;

    composant.choisirAnnee(2024);
    servirTout();
    fixture.detectChanges();

    expect(composant.selectedAnnee).toBe(2024);
    expect(composant.estAnneeActive(2024)).toBe(true);
    expect(composant.estAnneeActive(2025)).toBe(false);
  });

  it('ne rejoue pas le calcul quand seul l\'exercice consulté change', () => {
    const fixture = monter();
    const composant = fixture.componentInstance;
    const avant = composant.historique;

    composant.choisirAnnee(2024);
    servirTout();
    fixture.detectChanges();

    // Le graphique montre déjà toutes les années : le redessiner serait inutile.
    expect(composant.historique).toBe(avant);
  });

  it('relit la série quand une saisie change la donnée', () => {
    // Le mémo est bâti sur le seul périmètre : il ne pouvait pas savoir que la
    // donnée avait bougé sans que le périmètre change. Les cartes se
    // recalculaient pendant que la courbe restait sur son chargement
    // précédent — et la trajectoire SBTi, qui lit pourtant le même tableau,
    // affichait la valeur du jour sous une courbe de la veille.
    const fixture = monter();
    const composant = fixture.componentInstance;
    const avant = composant.historique;

    signalerMesuresLocalesModifiees();
    servirTout();
    fixture.detectChanges();

    expect(composant.historique).not.toBe(avant);
  });

  describe('mini-cartes de synthèse', () => {

    it('annonce le total de l\'exercice consulté, en ordre de grandeur', () => {
      const composant = monter().componentInstance;

      // Exercice en cours : 2026, 60 tCO₂e servies.
      expect(composant.anneeCarte).toBe(2026);
      expect(composant.totalCarte).toBe(60);

      // Les paliers d'abréviation, et le seuil qui a fait afficher « 8,85 M »
      // là où l'empreinte valait 8 859 tCO₂e : un millier reste un millier.
      expect(composant.formatCompact(60)).toBe('60');
      expect(composant.formatCompact(999)).toBe('999');
      expect(composant.formatCompact(1_000)).toBe('1,00 k');
      expect(composant.formatCompact(8_859)).toBe('8,86 k');
      expect(composant.formatCompact(1_250_000)).toBe('1,25 M');
      expect(composant.formatCompact(3_790_000_000)).toBe('3,79 Md');

      // Le seuil « M » ne se franchit qu'au million : c'est ce qui faisait
      // afficher « 8,85 M » là où l'empreinte valait 8 859 tCO₂e.
      expect(composant.formatCompact(999_999)).toContain(' k');
      expect(composant.formatCompact(1_000_000)).toBe('1,00 M');
    });

    it('ne chiffre aucune variation sur un exercice encore ouvert', () => {
      // 2026 est EN_COURS : sa collecte est partielle par construction. La
      // comparer à une année close rapporte l'avancement de la saisie et non
      // l'évolution des émissions — c'est ce qui affichait « −100 % » sur un
      // exercice à peine commencé, un chiffre qui se lit comme un effondrement.
      const composant = monter().componentInstance;

      expect(composant.exerciceEnCours).toBe(true);
      expect(composant.variationCarte).toBeNull();
      expect(composant.motifSansVariation).toContain('Collecte en cours');
    });

    it('chiffre la variation dès que l\'exercice est clos', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      composant.choisirAnnee(2025);
      servirTout();
      fixture.detectChanges();

      // 2025 (120 t) contre 2024 (100 t) : un cinquième de plus.
      const variation = composant.variationCarte!;
      expect(composant.exerciceEnCours).toBe(false);
      expect(variation.pct).toBeCloseTo(20, 6);
      expect(variation.precedent).toBe(2024);
      expect(variation.hausse).toBe(true);
    });

    it('nomme le scope dominant et sa part', () => {
      const composant = monter().componentInstance;

      // 2026 : Scope 2 pèse 30 t sur 60 t.
      const dominant = composant.scopeDominantCarte!;
      expect(dominant.libelle).toBe('Scope 2');
      expect(dominant.pct).toBeCloseTo(50, 6);
      expect(dominant.couleur).toBe('#E0803F');
    });

    it('reste muette sur le premier exercice plutôt que d\'inventer une variation', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      composant.choisirAnnee(2024);
      servirTout();
      fixture.detectChanges();

      expect(composant.variationCarte).toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('.hk-vide')).toBeTruthy();
    });

    it('affiche les trois mini-cartes sous le titre', () => {
      const hote: HTMLElement = monter().nativeElement;
      expect(hote.querySelectorAll('.historique-card .hist-kpis .hist-kpi')).toHaveLength(3);
    });
  });

  describe('analyse décisionnelle', () => {

    it('nomme le total, le scope majeur et sa cause', () => {
      const composant = monter().componentInstance;
      const analyse = composant.analyseExercice;

      // Exercice en cours : 2026, dont le Scope 2 pèse 30 t sur 60 t.
      expect(analyse).toContain('En 2026');
      expect(analyse).toContain("l'empreinte globale s'élève à");
      expect(analyse).toContain('Scope 2');
      expect(analyse).toContain('50,0 % des émissions');
      expect(analyse).toContain('électricité achetée');
    });

    it('annonce la collecte en cours plutôt qu\'une baisse qui n\'existe pas', () => {
      // Sur un exercice ouvert, « en baisse de 50 % » fabriquerait une bonne
      // nouvelle : ce n'est pas l'empreinte qui a diminué, c'est la saisie qui
      // n'est pas finie.
      const composant = monter().componentInstance;

      expect(composant.analyseVariation).toContain('encore ouvert');
      expect(composant.analyseVariation).toContain('attend la clôture');
      expect(composant.analyseVariation).not.toContain('baisse');
      expect(composant.iconeVariation).toBe('⏳');
    });

    it('inverse la lecture quand les émissions progressent', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      composant.choisirAnnee(2025);
      servirTout();
      fixture.detectChanges();

      // 2025 (120 t) contre 2024 (100 t) : un cinquième de plus.
      expect(composant.analyseVariation).toContain('hausse de 20,0 %');
      expect(composant.analyseVariation).toContain("augmentation de l'intensité carbone");
      expect(composant.iconeVariation).toBe('📈');
    });

    it('se tait plutôt que d\'inventer une variation sur le premier exercice', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      composant.choisirAnnee(2024);
      servirTout();
      fixture.detectChanges();

      // Aucun exercice antérieur collecté : annoncer une hausse de 100 % ne
      // dirait rien de la trajectoire.
      expect(composant.analyseVariation).toBe('');
    });

    it('affiche le bandeau au style Misfat sous le graphique', () => {
      const hote: HTMLElement = monter().nativeElement;

      const bandeau = hote.querySelector('.smart-insight')!;
      expect(bandeau).toBeTruthy();
      expect(bandeau.querySelector('.insight-icone')?.textContent).toContain('💡');
      expect(bandeau.querySelector('.insight-principal')?.textContent).toContain('En 2026');
    });
  });
});
