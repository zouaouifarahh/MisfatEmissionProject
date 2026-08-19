import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DechetsComponent } from './dechets/dechets';
import { InvestissementsComponent } from './investissements/investissements';

/**
 * Bannières filtrantes et reprise du facteur en masse.
 *
 * <p>Une alerte qui annonce « 62 % de couverture » laissait l'utilisateur
 * chercher lui-même, parmi des centaines de lignes, celles qui manquaient. Et
 * corriger un facteur ligne à ligne sur toute une catégorie n'était pas
 * seulement long : rien ne garantissait que la même valeur ait été saisie
 * partout.</p>
 *
 * <p>Ces bancs vérifient les deux sur le rendu, non sur l'intention.</p>
 */
describe('Alertes filtrantes et reprise en masse', () => {

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });

  /** Monte un écran et sert à vide les requêtes qu'il déclenche. */
  const monter = <T,>(composant: new (...args: any[]) => T) => {
    const fixture = TestBed.createComponent(composant);
    fixture.detectChanges();

    for (let passe = 0; passe < 3; passe++) {
      const attente = TestBed.inject(HttpTestingController).match(() => true);
      if (!attente.length) break;
      attente.forEach(r => r.flush([]));
      fixture.detectChanges();
    }
    return fixture;
  };

  const redessiner = (fixture: any) => {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  };

  describe('bannière d\'alerte cliquable', () => {

    /** Deux lignes, dont une seule adossée au référentiel : couverture 50 %. */
    const LIGNES = [
      {
        id: 1, scope: 'SCOPE_3', categorie: 'Déchets', etablissement: 'MISFAT I',
        typeDechet: 'Chutes de média', provenance: 'Réel', filiere: 'Recyclage',
        prestataire: '', reutilise: 'Non', quantiteTotale: 12, unite: 'T',
        montant: null, devise: 'TND', reference: 'MS3C5RE', facteur: 0.021,
        uniteFacteur: 'kg', baseAppliquee: 'EPA-ORD 2024', emissionCalculee: 252,
        dateDebut: '2026-01-01', dateFin: '2026-12-31', noteEstimation: '', creeLe: ''
      },
      {
        id: 2, scope: 'SCOPE_3', categorie: 'Déchets', etablissement: 'MISFAT I',
        typeDechet: 'Boues', provenance: 'Estimation', filiere: 'Enfouissement',
        prestataire: '', reutilise: 'Non', quantiteTotale: 8, unite: 'T',
        montant: null, devise: 'TND', reference: '', facteur: 0.2,
        uniteFacteur: 'kg', baseAppliquee: 'ADEME Fallback', emissionCalculee: 1600,
        dateDebut: '2026-01-01', dateFin: '2026-12-31', noteEstimation: '', creeLe: ''
      }
    ];

    it('porte un filtre sur la carte de couverture', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify(LIGNES));
      const composant = monter(DechetsComponent).componentInstance;

      const couverture = composant.kpisCategorie
        .find(c => c.libelle.includes('Couverture'));

      // La carte annonce ce qu'elle filtrera : les lignes qu'aucun facteur du
      // référentiel n'adosse.
      expect(couverture?.filtreStatut).toBe('Fallback');
    });

    it('rend la carte cliquable dans le DOM', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify(LIGNES));
      const hote: HTMLElement = monter(DechetsComponent).nativeElement;

      const cliquables = hote.querySelectorAll('.kpi-carte.kpi-cliquable');
      expect(cliquables.length).toBeGreaterThan(0);

      // Un lecteur d'écran doit savoir que la carte agit.
      expect(cliquables[0].getAttribute('role')).toBe('button');
      expect(cliquables[0].getAttribute('tabindex')).toBe('0');
    });

    it('filtre le tableau au clic sur la carte', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify(LIGNES));
      const fixture = monter(DechetsComponent);
      const composant = fixture.componentInstance;

      expect(composant.emissionsFiltrees.length).toBe(2);

      const carte = (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('.kpi-carte.kpi-cliquable')!;
      carte.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      redessiner(fixture);

      // Seule la ligne sous repli demeure : c'est ce que l'alerte signalait.
      expect(composant.filtreStatut).toBe('Fallback');
      expect(composant.emissionsFiltrees.length).toBe(1);
      expect(composant.emissionsFiltrees[0].reference).toBe('');
    });

    it('relâche le filtre au second clic', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify(LIGNES));
      const fixture = monter(DechetsComponent);
      const composant = fixture.componentInstance;

      const carte = () => (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLElement>('.kpi-carte.kpi-cliquable')!;

      carte().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      redessiner(fixture);
      carte().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      redessiner(fixture);

      // Le même geste ramène au tableau complet : rien à aller défaire ailleurs.
      expect(composant.filtreStatut).toBe('Tous');
      expect(composant.emissionsFiltrees.length).toBe(2);
    });
  });

  describe('reprise du facteur en masse', () => {

    /** Trois immobilisations d'aluminium, sous facteur de repli. */
    const IMMOS = [1, 2, 3].map(id => ({
      id, scope: 'SCOPE_3', categorie: 'Investissements', numeroImmo: `IMM-${id}`,
      designation: `Actif ${id}`, categorieCarbone: 'Alum / Aluminium',
      categorieTexte: 'Aluminium', replique: false, montant: 10_000 * id,
      devise: 'TND', facteur: 0.42, uniteFacteur: 'TND', libelleFacteur: '',
      baseAppliquee: 'ADEME Fallback', origineFacteur: 'ADEME Fallback',
      emissionCalculee: 4_200 * id, creeLe: ''
    }));

    const monterCapex = () => {
      localStorage.setItem('listeEmissionsInvestissements', JSON.stringify(IMMOS));
      return monter(InvestissementsComponent);
    };

    it('ne propose la reprise qu\'une fois une catégorie choisie', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      // Appliquer un facteur à tout l'inventaire n'aurait aucun sens : un
      // facteur documente une matière, pas un lot.
      expect(composant.masseDisponible).toBe(false);

      composant.filtreCategorie = 'Alum / Aluminium';
      redessiner(fixture);
      expect(composant.masseDisponible).toBe(true);
    });

    it('applique le facteur à toutes les lignes filtrées', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';
      composant.masseFacteur = '0,5';
      composant.appliquerReprise();
      redessiner(fixture);

      const reprises = composant.listeEmissions;
      expect(reprises.every(l => Math.abs(l.facteur - 0.5) < 1e-9)).toBe(true);
      // 10 000 × 0,5, 20 000 × 0,5, 30 000 × 0,5.
      expect(reprises.map(l => l.emissionCalculee)).toEqual([5_000, 10_000, 15_000]);
    });

    it('chiffre l\'écart produit', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';
      composant.masseFacteur = '0,5';
      composant.appliquerReprise();

      // L'utilisateur voit ce que sa reprise déplace, plutôt que de le
      // découvrir dans le rapport.
      expect(composant.masseMessage).toContain('3 ligne(s)');
      expect(composant.masseMessage).toContain('kgCO₂e');
    });

    it('persiste la reprise', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';
      composant.masseFacteur = '0,5';
      composant.appliquerReprise();

      const relues = JSON.parse(localStorage.getItem('listeEmissionsInvestissements') ?? '[]');
      expect(relues.every((l: any) => Math.abs(l.facteur - 0.5) < 1e-9)).toBe(true);
    });

    it('refuse un facteur nul ou illisible', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';

      for (const saisie of ['0', '-1', 'abc', '']) {
        composant.masseFacteur = saisie;
        composant.appliquerReprise();

        expect(composant.masseErreur).toContain('strictement positif');
        // Rien n'a bougé : le refus est sans effet de bord.
        expect(composant.listeEmissions[0].facteur).toBeCloseTo(0.42, 10);
      }
    });

    it('ne touche pas aux lignes d\'une autre catégorie', () => {
      const melange = [
        ...IMMOS,
        { ...IMMOS[0], id: 9, categorieCarbone: 'Inox / Stainless Steel', facteur: 0.39 }
      ];
      localStorage.setItem('listeEmissionsInvestissements', JSON.stringify(melange));

      const fixture = monter(InvestissementsComponent);
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';
      composant.masseFacteur = '0,5';
      composant.appliquerReprise();

      const inox = composant.listeEmissions.find(l => l.id === 9)!;
      expect(inox.facteur).toBeCloseTo(0.39, 10);
    });

    it('inscrit la provenance de la valeur saisie', () => {
      const fixture = monterCapex();
      const composant = fixture.componentInstance;

      composant.filtreCategorie = 'Alum / Aluminium';
      composant.masseFacteur = '0,5';
      composant.appliquerReprise();

      // Une valeur saisie à la main ne doit pas se confondre avec une valeur du
      // référentiel : la base documentaire le dit.
      expect(composant.listeEmissions[0].baseAppliquee).toContain('reprise en masse');
    });
  });
});
