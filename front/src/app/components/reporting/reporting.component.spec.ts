import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ReportingComponent } from './reporting.component';
import { EntityContextService } from '../../core/entity-context.service';
import { ActivityDataService, DonneesActivite, releveVide } from '../../core/activity-data.service';

/**
 * Rapport carbone exécutif : configuration puis rendu du document.
 *
 * <p>Le rapport se lit du panneau de configuration au document imprimable :
 * ce banc emprunte le même chemin, en servant un périmètre chiffré et en
 * vérifiant que le pré-cochage, les tableaux et l'analyse en découlent.</p>
 */
describe('ReportingComponent', () => {

  /**
   * Agrégats servis par emission-service, en tCO₂e.
   *
   * <p>C'est l'unité que l'API déclare et renvoie réellement — le serveur divise
   * par mille avant de répondre. La fixture les annonçait en kilogrammes, ce qui
   * masquait le mélange d'unités du bilan : les 240 t ci-dessous valent
   * 240 000 kg, magnitude sur laquelle portent les assertions.</p>
   */
  const STATS = {
    mode: 'PHYSIQUE', unit: 'tCO2e', currency: null, measureCount: 12,
    total: 240, scope1: 40, scope2: 60, scope3: 140,
    byScope: { SCOPE_1: 40, SCOPE_2: 60, SCOPE_3: 140 },
    byCategory: {},
    byScopeCategory: {
      SCOPE_1: { 'Combustion dans les usines': 40 },
      SCOPE_2: { 'Électricité achetée': 60 },
      SCOPE_3: { 'Category 1: Purchased goods and services': 140 }
    },
    byFiliale: [], byCurrency: {}, unconvertedCurrencies: []
  };

  const FILIALES = [
    { id: 7, code: 'MT', libelle: 'MISFAT TUNISIE', pays: 'Tunisie', devise: 'TND',
      usines: [{ id: 1, nom: 'MISFAT I', filialeId: 7 }] }
  ];

  let httpMock: HttpTestingController;

  /**
   * Sert toutes les requêtes en attente, y compris celles que les réponses
   * précédentes déclenchent à leur tour.
   */
  const servirTout = () => {
    for (let passe = 0; passe < 6; passe++) {
      const attente = httpMock.match(() => true);
      if (!attente.length) return;

      for (const requete of attente) {
        if (requete.request.url.includes('/stats/aggregate')) requete.flush(STATS);
        else if (requete.request.url.includes('/filiales')) requete.flush(FILIALES);
        else if (requete.request.url.includes('/annees')) requete.flush([{ id: 1, valeur: 2024, statut: 'EN_COURS' }]);
        else requete.flush([]);
      }
    }
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ReportingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), EntityContextService]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  /**
   * Renseigne l'activité de l'exercice consulté.
   *
   * <p>Les dénominateurs des ratios ne vivent plus dans le rapport : ils sont
   * tenus par l'écran de pilotage, et le rapport les lit.</p>
   */
  const poserActivite = (champs: Partial<DonneesActivite>) => {
    const activite = TestBed.inject(ActivityDataService);
    const annee = TestBed.inject(EntityContextService).filter.year ?? 2024;
    activite.enregistrer(null, { ...releveVide(annee), ...champs, annee });
  };

  /** Monte le composant et sert le périmètre jusqu'à stabilisation. */
  const monter = () => {
    const fixture = TestBed.createComponent(ReportingComponent);
    fixture.detectChanges();
    servirTout();
    fixture.detectChanges();
    return fixture;
  };

  it('rend le document sans lever d\'exception de rendu', () => {
    const fixture = monter();
    const hote: HTMLElement = fixture.nativeElement;

    expect(hote.querySelector('.rep-document')).toBeTruthy();
    expect(hote.querySelector('.doc-titre h1')?.textContent).toContain('Bilan Carbone Exécutif');

    // La date est formatée par Intl : le pipe `date` exigerait des données de
    // locale que l'application n'enregistre pas, et viderait le rapport.
    expect(fixture.componentInstance.dateImpressionLongue).toMatch(/\d{4}/);
    expect(fixture.componentInstance.dateImpressionCourte).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('propose la nomenclature complète des trois scopes', () => {
    const composant = monter().componentInstance;

    expect(composant.postesDuScope('SCOPE_1').length).toBe(4);
    expect(composant.postesDuScope('SCOPE_2').length).toBe(3);
    expect(composant.postesDuScope('SCOPE_3').length).toBe(15);
    expect(composant.nombrePostes).toBe(22);
  });

  it('coche d\'office les seules catégories qui pèsent', () => {
    const composant = monter().componentInstance;

    expect(composant.estRetenu('combustion-etablissements')).toBe(true);
    expect(composant.estRetenu('electricite-achetee')).toBe(true);
    expect(composant.estRetenu('biens-services')).toBe(true);

    // Aucune mesure : la catégorie reste proposée, décochée.
    expect(composant.estRetenu('franchises')).toBe(false);
    expect(composant.estRetenu('process-industriels')).toBe(false);
    expect(composant.nombreRetenus).toBe(3);
  });

  it('rattache chaque intitulé de la base à son poste et à son scope', () => {
    const composant = monter().componentInstance;

    expect(composant.bilan?.scope1Kg).toBe(40_000);
    expect(composant.bilan?.scope2Kg).toBe(60_000);
    expect(composant.bilan?.scope3Kg).toBe(140_000);
    expect(composant.bilan?.totalKg).toBe(240_000);
    expect(composant.bilan?.horsNomenclature).toEqual([]);
  });

  it('sélectionne puis restreint l\'intégralité du bilan', () => {
    const composant = monter().componentInstance;

    composant.toutCocher();
    expect(composant.nombreRetenus).toBe(22);
    expect(composant.scopeEntierementRetenu('SCOPE_3')).toBe(true);

    composant.uniquementActives();
    expect(composant.nombreRetenus).toBe(3);

    composant.toutDecocher();
    expect(composant.nombreRetenus).toBe(0);
    expect(composant.scopesRetenus).toEqual([]);
  });

  it('bascule un scope entier depuis son en-tête', () => {
    const composant = monter().componentInstance;

    composant.basculerScope('SCOPE_2');
    expect(composant.scopeEntierementRetenu('SCOPE_2')).toBe(true);
    expect(composant.retenusDuScope('SCOPE_2')).toBe(3);

    composant.basculerScope('SCOPE_2');
    expect(composant.retenusDuScope('SCOPE_2')).toBe(0);
  });

  it('fait suivre les totaux et le donut à la sélection', () => {
    const composant = monter().componentInstance;

    // Pré-cochage : les trois postes chiffrés, soit tout le bilan.
    expect(composant.totalRetenuKg).toBe(240_000);
    expect(composant.couvertureRetenue).toBeCloseTo(100, 5);
    expect(composant.segmentsDonut.length).toBe(3);

    composant.basculerPoste('biens-services');
    expect(composant.totalRetenuKg).toBe(100_000);
    expect(composant.couvertureRetenue).toBeCloseTo(41.666, 2);
    expect(composant.segmentsDonut.length).toBe(2);
  });

  it('n\'affiche au détail que les catégories cochées', () => {
    const fixture = monter();
    const composant = fixture.componentInstance;

    composant.uniquementActives();
    fixture.detectChanges();

    const libelles = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.doc-tableau tbody .col-cat')
    ).map(cellule => cellule.textContent ?? '');

    expect(libelles.length).toBe(3);
    expect(libelles.some(l => l.includes('Combustibles fossiles'))).toBe(true);
    expect(libelles.some(l => l.includes('Franchises'))).toBe(false);
  });

  it('rédige une analyse appuyée sur les chiffres du rapport', () => {
    const composant = monter().componentInstance;
    const analyse = composant.analyse.join(' ');

    expect(analyse).toContain('240,00 tCO₂e');
    expect(analyse).toContain('Scope 3');

    // Aucune société n'est sélectionnée : le rapport annonce la consolidation
    // groupe, et non l'une des filiales qui la composent.
    expect(analyse).toContain('Groupe MISFAT');
  });

  it('suit la société retenue dans l\'en-tête', () => {
    const fixture = monter();
    const entityService = TestBed.inject(EntityContextService);

    entityService.selectEntity({
      id: 7, code: 'MT', apiCode: 'MT', label: 'MISFAT TUNISIE',
      country: 'Tunisie', flag: 'TN', currency: 'TND'
    });
    servirTout();
    fixture.detectChanges();

    const composant = fixture.componentInstance;
    expect(composant.bilan?.entityId).toBe(7);
    expect(composant.bilan?.libelleSociete).toBe('MISFAT TUNISIE');
    expect(composant.bilan?.pays).toBe('Tunisie');
    expect(composant.bilan?.devise).toBe('TND');

    const hote: HTMLElement = fixture.nativeElement;
    expect(hote.querySelector('.doc-meta dd')?.textContent).toContain('MISFAT TUNISIE');
  });

  describe('Mode 1 — ratios d\'intensité et trajectoire', () => {

    it('affiche trois mini-cartes de ratio sous les cartes de scope', () => {
      const fixture = monter();
      const cartes = (fixture.nativeElement as HTMLElement).querySelectorAll('.doc-ratios .ratio');

      expect(cartes).toHaveLength(3);
      expect(fixture.componentInstance.ratiosSynthese.map(r => r.id))
        .toEqual(['economique', 'production', 'collaborateur']);
    });

    it('affiche un tiret et une infobulle tant que l\'activité manque', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      expect(composant.ratiosRenseignes).toBe(false);
      for (const ratio of composant.ratiosSynthese) {
        expect(ratio.valeur).toBeNull();
        expect(ratio.affichage).toBe('—');
        expect(ratio.infobulle).toContain('Donnée d\'activité absente');
      }

      const carte = (fixture.nativeElement as HTMLElement).querySelector('.doc-ratios .ratio')!;
      expect(carte.classList.contains('ratio-vide')).toBe(true);
      expect(carte.getAttribute('title')).toContain('chiffre d\'affaires');
    });

    it('calcule les trois ratios dans les unités attendues', () => {
      const composant = monter().componentInstance;

      // 240 tCO2e ; 48 M de devise ; 1 000 000 pièces ; 480 ETP.
      poserActivite({ chiffreAffairesM: 48, production: 1_000_000, effectif: 480 });

      const [economique, production, collaborateur] = composant.ratiosSynthese;

      expect(economique.valeur).toBeCloseTo(5, 6);          // 240 / 48
      // Vue consolidée : aucune monnaie n'est nommée, le périmètre en mêle plusieurs.
      expect(economique.unite).toBe('tCO₂e / M');

      expect(production.valeur).toBeCloseTo(0.24, 6);       // 240 000 kg / 1 M
      expect(production.unite).toBe('kgCO₂e / unité');

      expect(collaborateur.valeur).toBeCloseTo(0.5, 6);     // 240 / 480
      expect(collaborateur.unite).toBe('tCO₂e / ETP');
    });

    it('libelle le ratio économique dans la devise du périmètre', () => {
      const fixture = monter();

      TestBed.inject(EntityContextService).selectEntity({
        id: 7, code: 'MT', apiCode: 'MT', label: 'MISFAT TUNISIE',
        country: 'Tunisie', flag: 'TN', currency: 'TND'
      });
      servirTout();
      fixture.detectChanges();

      // La devise vient du bilan, jamais d'un symbole codé en dur : un bilan
      // tunisien libellé en euros se tromperait d'un facteur trois.
      expect(fixture.componentInstance.bilan!.devise).toBe('TND');
      expect(fixture.componentInstance.ratiosSynthese[0].unite).toBe('tCO₂e / M TND');
    });

    it('annonce l\'absence d\'objectif plutôt qu\'un écart nul', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      expect(composant.trajectoire).toBeNull();
      expect(composant.badgeTrajectoire).toBe('Objectif non défini');

      const bloc = (fixture.nativeElement as HTMLElement).querySelector('.doc-trajectoire')!;
      expect(bloc.classList.contains('traj-sans-objectif')).toBe(true);
      expect(bloc.textContent).toContain('Aucun objectif de réduction n\'est fixé');
    });

    it('mesure l\'écart à la cible et l\'effort réalisé', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      // Cible : −25 % de 240 tCO2e, soit 180 tCO2e. L'exercice en pèse 240.
      composant.parametres.objectifPct = 25;
      composant.parametres.anneeCible = 2030;
      composant.parametresModifies();
      fixture.detectChanges();

      const trajectoire = composant.trajectoire!;
      expect(trajectoire.baseKg).toBe(240_000);
      expect(trajectoire.cibleKg).toBe(180_000);
      expect(trajectoire.ecartKg).toBe(60_000);
      expect(trajectoire.atteint).toBe(false);

      // Aucune réduction constatée : l'effort réalisé est nul.
      expect(trajectoire.progression).toBe(0);
      expect(composant.badgeTrajectoire).toBe('60,00 tCO₂e au-dessus de la cible');
    });

    it('signale un objectif atteint sans écart négatif à l\'écran', () => {
      const composant = monter().componentInstance;

      // Une cible très large est dépassée par construction.
      composant.parametres.objectifPct = 0;
      expect(composant.trajectoire!.atteint).toBe(true);
      expect(composant.badgeTrajectoire).toContain('Objectif atteint');
      expect(composant.badgeTrajectoire).toContain('0,00 tCO₂e sous la cible');
    });

    it('borne la progression à cent pour cent', () => {
      const composant = monter().componentInstance;
      composant.parametres.objectifPct = 1;

      // L'empreinte égale la base : la progression ne peut pas être négative.
      expect(composant.trajectoire!.progression).toBeGreaterThanOrEqual(0);
      expect(composant.trajectoire!.progression).toBeLessThanOrEqual(100);
    });

    it('conserve objectif et données d\'activité d\'une session à l\'autre', () => {
      const composant = monter().componentInstance;

      poserActivite({ chiffreAffairesM: 48 });
      composant.parametres.objectifPct = 25;
      composant.parametresModifies();

      const rouvert = monter().componentInstance;

      // L'activité vient de son propre annuaire, l'objectif du rapport : les
      // deux doivent survivre au rechargement.
      expect(rouvert.ratiosSynthese[0].valeur).toBeCloseTo(5, 6);
      expect(rouvert.trajectoire).not.toBeNull();
    });

    it('lit les dénominateurs de l\'écran de pilotage, pas d\'une copie locale', () => {
      const composant = monter().componentInstance;

      // Une correction saisie ailleurs se répercute sans rechargement.
      poserActivite({ production: 2_000_000 });
      expect(composant.ratiosSynthese[1].valeur).toBeCloseTo(0.12, 6);

      poserActivite({ production: 1_000_000 });
      expect(composant.ratiosSynthese[1].valeur).toBeCloseTo(0.24, 6);
    });
  });

  describe('Mode 2 — rapport normé GHG Protocol', () => {

    it('démarre sur la synthèse et bascule sans recharger le bilan', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;
      const bilanAvant = composant.bilan;

      expect(composant.mode).toBe('synthese');
      expect((fixture.nativeElement as HTMLElement).querySelector('.norme-shell')).toBeNull();

      composant.changerMode('norme');
      fixture.detectChanges();

      const hote: HTMLElement = fixture.nativeElement;
      expect(hote.querySelector('.norme-shell')).toBeTruthy();
      expect(hote.querySelector('.rep-document')).toBeNull();

      // Aucune requête n'est rejouée : le même bilan sert les deux modes.
      expect(composant.bilan).toBe(bilanAvant);
      httpMock.verify();
    });

    it('couvre les onze chapitres réglementaires', () => {
      const fixture = monter();
      fixture.componentInstance.changerMode('norme');
      fixture.detectChanges();

      const chapitres = fixture.componentInstance.chapitres;
      expect(chapitres).toHaveLength(11);
      expect(chapitres.map(c => c.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

      const sommaire = (fixture.nativeElement as HTMLElement)
        .querySelectorAll('.norme-sommaire ol li');
      expect(sommaire).toHaveLength(11);
    });

    it('reprend les tableaux du bilan sans les restreindre à la sélection', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;

      // La synthèse ne retient que les trois postes chiffrés…
      composant.uniquementActives();
      expect(composant.nombreRetenus).toBe(3);

      composant.changerMode('norme');
      composant.toutDeplier();
      fixture.detectChanges();

      // …le rapport normé, lui, expose la nomenclature entière.
      const lignes = (fixture.nativeElement as HTMLElement)
        .querySelectorAll('#chapitre-donnees .doc-tableau tbody tr');
      expect(lignes).toHaveLength(composant.nombrePostes);
    });

    it('déplie et replie les chapitres', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;
      composant.changerMode('norme');

      expect(composant.estDeplie('couverture')).toBe(true);
      expect(composant.estDeplie('signature')).toBe(false);

      composant.basculerChapitre('signature');
      expect(composant.estDeplie('signature')).toBe(true);

      composant.toutReplier();
      expect(composant.estDeplie('couverture')).toBe(false);

      composant.toutDeplier();
      expect(composant.chapitres.every(c => composant.estDeplie(c.id))).toBe(true);
    });

    it('déplie tout le rapport avant de l\'imprimer', () => {
      const fixture = monter();
      const composant = fixture.componentInstance;
      composant.changerMode('norme');
      composant.toutReplier();

      // `print` n'existe pas sous jsdom : on ne teste que la préparation.
      window.print = () => undefined;
      composant.imprimer();

      expect(composant.chapitres.every(c => composant.estDeplie(c.id))).toBe(true);
    });

    describe('édition qualitative', () => {

      it('propose un texte dérivé du bilan, jamais vide', () => {
        const composant = monter().componentInstance;
        const defaut = composant.texte('couverture.objet');

        expect(defaut).toContain('240,00');
        expect(defaut).toContain('GHG Protocol');
        expect(composant.estAmende('couverture.objet')).toBe(false);
      });

      it('enregistre le commentaire du responsable RSE', () => {
        const composant = monter().componentInstance;

        composant.modifierBloc('verification.statut');
        expect(composant.brouillon).toBe(composant.texte('verification.statut'));

        composant.brouillon = 'Mission d\'assurance limitée confiée au cabinet X en mars.';
        composant.enregistrerBloc();

        expect(composant.texte('verification.statut'))
          .toBe('Mission d\'assurance limitée confiée au cabinet X en mars.');
        expect(composant.estAmende('verification.statut')).toBe(true);
        expect(composant.blocEnEdition).toBeNull();
      });

      it('abandonne la saisie sans l\'écrire', () => {
        const composant = monter().componentInstance;
        const avant = composant.texte('qualite.incertitude');

        composant.modifierBloc('qualite.incertitude');
        composant.brouillon = 'Texte abandonné';
        composant.annulerBloc();

        expect(composant.texte('qualite.incertitude')).toBe(avant);
        expect(composant.estAmende('qualite.incertitude')).toBe(false);
      });

      it('rétablit le texte proposé', () => {
        const composant = monter().componentInstance;

        composant.modifierBloc('methodologie.approche');
        composant.brouillon = 'Approche maison';
        composant.enregistrerBloc();
        expect(composant.estAmende('methodologie.approche')).toBe(true);

        composant.reinitialiserBloc('methodologie.approche');
        expect(composant.estAmende('methodologie.approche')).toBe(false);
        expect(composant.texte('methodologie.approche')).toContain('donnée d\'activité');
      });

      it('conserve les commentaires d\'un rechargement à l\'autre', () => {
        const composant = monter().componentInstance;

        composant.modifierBloc('divulgations.initiatives');
        composant.brouillon = 'Passage du fret routier au ferroviaire sur l\'axe Tunis–Sousse.';
        composant.enregistrerBloc();

        // Un second montage relit le stockage, comme après un rafraîchissement.
        const rouvert = monter().componentInstance;
        expect(rouvert.texte('divulgations.initiatives'))
          .toContain('ferroviaire');
      });
    });

    describe('indicateurs saisis', () => {

      it('laisse les ratios vides tant que le dénominateur manque', () => {
        const composant = monter().componentInstance;

        // Aucun ratio n'est inventé : le rapport dit ce qui manque.
        expect(composant.ratios.every(r => r.valeur === null)).toBe(true);
        expect(composant.ratios[0].manque).toContain('production');
        expect(composant.formaterRatio(composant.ratios[0])).toBe('—');
      });

      it('calcule les ratios d\'intensité une fois l\'activité renseignée', () => {
        const composant = monter().componentInstance;

        // 240 tCO2e pour 1 000 000 pièces = 0,24 g par pièce.
        poserActivite({ production: 1_000_000, effectif: 480 });

        const parPiece = composant.ratios[0];
        expect(parPiece.valeur).toBeCloseTo(0.00024, 8);
        expect(composant.formaterRatio(parPiece)).toContain('240,00');

        expect(composant.ratios[2].valeur).toBeCloseTo(240 / 480, 6);
      });

      it('mesure l\'écart à l\'objectif de réduction', () => {
        const composant = monter().componentInstance;

        composant.parametres.objectifPct = 25;
        composant.parametres.anneeCible = 2030;

        // Sans bilan d'année de référence, la base est l'exercice consulté.
        const objectif = composant.objectif!;
        expect(objectif.baseKg).toBe(240_000);
        expect(objectif.cibleKg).toBe(180_000);
        expect(objectif.resteKg).toBe(60_000);
        expect(objectif.atteint).toBe(false);
      });

      it('ne propose aucun objectif tant qu\'il n\'est pas fixé', () => {
        const composant = monter().componentInstance;
        expect(composant.objectif).toBeNull();
      });
    });
  });

  it('annonce un périmètre sans mesure plutôt qu\'une empreinte nulle', () => {
    const composant = monter().componentInstance;

    composant.toutDecocher();
    expect(composant.analyse.join(' ')).toContain('atteste du périmètre examiné');
    expect(composant.donutRenseigne).toBe(false);
  });
});
