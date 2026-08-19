import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { FiltreMasseComponent } from './filtre-masse';
import { DechetsComponent } from '../../components/dechets/dechets';
import { EmissionListComponent } from '../../components/emission-list/emission-list';

/**
 * Filtre métier et reprise du facteur, écran par écran.
 *
 * <p>Chaque écran filtre selon ce qu'il documente — la combustion par fluide,
 * les déchets par type. Imposer une dimension commune aurait proposé un critère
 * étranger à la moitié d'entre eux, et le filtre serait resté vide.</p>
 *
 * <p>Les valeurs proposées sont relevées dans les lignes présentes : une valeur
 * venue d'un import mais absente du formulaire de saisie resterait autrement
 * infiltrable, alors même qu'elle pèse dans le total.</p>
 */
describe('Filtre métier et reprise du facteur', () => {

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });

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

  describe('composant isolé', () => {

    /** Trois lignes, deux natures : de quoi vérifier que le filtre trie. */
    const LIGNES = [
      { mode: 'Routier', quantite: 100, facteur: 0.2, emissionCalculee: 20, baseAppliquee: '' },
      { mode: 'Routier', quantite: 200, facteur: 0.2, emissionCalculee: 40, baseAppliquee: '' },
      { mode: 'Maritime', quantite: 500, facteur: 0.01, emissionCalculee: 5, baseAppliquee: '' }
    ];

    const monterFiltre = () => {
      const fixture = TestBed.createComponent(FiltreMasseComponent);
      const composant = fixture.componentInstance;
      composant.champ = 'mode';
      composant.source = LIGNES;
      composant.lignes = LIGNES;
      composant.champsMasse = {
        grandeur: 'quantite', facteur: 'facteur',
        emission: 'emissionCalculee', base: 'baseAppliquee'
      };
      fixture.detectChanges();
      return fixture;
    };

    it('relève les valeurs présentes, sans doublon et triées', () => {
      const composant = monterFiltre().componentInstance;
      expect(composant.options).toEqual(['Maritime', 'Routier']);
    });

    it('ignore les valeurs vides', () => {
      const fixture = monterFiltre();
      fixture.componentInstance.source = [...LIGNES, { mode: '', quantite: 0 }];
      expect(fixture.componentInstance.options).toEqual(['Maritime', 'Routier']);
    });

    it('propose la liste de référence quand l\'écran est vierge', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      // Un écran sans donnée affichait un filtre vide : rien n'indiquait ce
      // qu'il savait documenter.
      composant.source = [];
      composant.optionsParDefaut = ['Aérien', 'Ferroviaire', 'Routier'];

      expect(composant.options).toEqual(['Aérien', 'Ferroviaire', 'Routier']);
    });

    it('réunit la liste de référence et les valeurs présentes', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      // « Maritime » vient d'un import et manque au formulaire ; l'écarter
      // rendrait infiltrables les lignes qu'on cherche justement à reprendre.
      composant.optionsParDefaut = ['Aérien', 'Routier'];

      expect(composant.options).toEqual(['Aérien', 'Maritime', 'Routier']);
    });

    it('ne répète pas une valeur présente dans les deux', () => {
      const fixture = monterFiltre();
      fixture.componentInstance.optionsParDefaut = ['Routier', 'Maritime'];

      expect(fixture.componentInstance.options).toEqual(['Maritime', 'Routier']);
    });

    it('ne propose la reprise qu\'une fois un critère choisi', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      expect(composant.disponible).toBe(false);

      composant.valeur = 'Routier';
      expect(composant.disponible).toBe(true);
    });

    it('rend les lignes reprises sans les enregistrer lui-même', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      let recu: any = null;
      composant.reprises.subscribe(e => (recu = e));

      composant.valeur = 'Routier';
      composant.lignes = LIGNES.slice(0, 2);
      composant.saisie = '0,5';
      composant.appliquer();

      // Le composant annonce ; l'écran écrit. Lui seul sait où vivent ses lignes.
      expect(recu).not.toBeNull();
      expect(recu.apres.map((l: any) => l.emissionCalculee)).toEqual([50, 100]);
      expect(composant.compteRendu).toContain('2 ligne(s)');
    });

    it('refuse un facteur invalide sans rien émettre', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      let emis = 0;
      composant.reprises.subscribe(() => emis++);

      composant.valeur = 'Routier';
      composant.saisie = '0';
      composant.appliquer();

      expect(composant.erreur).toContain('strictement positif');
      expect(emis).toBe(0);
      // Le panneau reste ouvert : la saisie est à corriger, non à recommencer.
      expect(composant.ouvert).toBe(false);
    });

    it('se referme sans rien changer sur Annuler', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      composant.valeur = 'Routier';
      composant.ouvrir();
      expect(composant.ouvert).toBe(true);

      composant.fermer();

      expect(composant.ouvert).toBe(false);
      expect(composant.erreur).toBe('');
      // Les lignes n'ont pas été touchées.
      expect(LIGNES[0].facteur).toBeCloseTo(0.2, 10);
    });

    it('relâche le panneau quand le filtre revient à « Tous »', () => {
      const fixture = monterFiltre();
      const composant = fixture.componentInstance;

      composant.choisir('Routier');
      composant.ouvrir();
      composant.choisir('Tous');

      expect(composant.ouvert).toBe(false);
      expect(composant.disponible).toBe(false);
    });
  });

  describe('branchement sur les écrans', () => {

    it('filtre les déchets par type de déchet', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify([
        { id: 1, typeDechet: 'Chutes de média', quantiteTotale: 12, facteur: 0.02,
          emissionCalculee: 240, etablissement: 'MISFAT I', provenance: 'Réel',
          filiere: 'Recyclage', unite: 'T', reference: 'MS3C5RE', baseAppliquee: 'EPA' },
        { id: 2, typeDechet: 'Boues', quantiteTotale: 8, facteur: 0.2,
          emissionCalculee: 1600, etablissement: 'MISFAT I', provenance: 'Réel',
          filiere: 'Enfouissement', unite: 'T', reference: '', baseAppliquee: 'ADEME' }
      ]));

      const fixture = monter(DechetsComponent);
      const composant = fixture.componentInstance as any;

      expect(composant.emissionsFiltrees.length).toBe(2);

      composant.filtreMetier = 'Boues';
      redessiner(fixture);

      expect(composant.emissionsFiltrees.length).toBe(1);
      expect(composant.emissionsFiltrees[0].typeDechet).toBe('Boues');
    });

    it('filtre la combustion par fluide, comme le formulaire de saisie', () => {
      localStorage.setItem('listeEmissions', JSON.stringify([
        { id: 1, emissionSource: 'Gaz naturel', quantite: 100, facteur: 2, unite: 'kWh',
          emissionCalculee: 200, etablissement: 'MISFAT I', reference: 'MS1GZ',
          typeDonnee: 'Physique', hypothese: 'Réelle', scope: 'SCOPE_1',
          categorie: 'Combustion', dateDebut: '', dateFin: '', creeLe: '' },
        { id: 2, emissionSource: 'Gazole/Fioul', quantite: 50, facteur: 3, unite: 'L',
          emissionCalculee: 150, etablissement: 'MISFAT I', reference: 'MS1COC',
          typeDonnee: 'Physique', hypothese: 'Réelle', scope: 'SCOPE_1',
          categorie: 'Combustion', dateDebut: '', dateFin: '', creeLe: '' }
      ]));

      const fixture = monter(EmissionListComponent);
      const composant = fixture.componentInstance as any;

      composant.filtreMetier = 'Gaz naturel';
      redessiner(fixture);

      const filtrees = composant.emissionsFiltrees;
      expect(filtrees.length).toBe(1);
      expect(filtrees[0].emissionSource).toBe('Gaz naturel');
    });

    it('reprend le facteur des seules lignes filtrées et l\'enregistre', () => {
      localStorage.setItem('listeEmissionsDechets', JSON.stringify([
        { id: 1, typeDechet: 'Boues', quantiteTotale: 10, facteur: 0.2,
          emissionCalculee: 2, etablissement: 'MISFAT I', provenance: 'Réel',
          filiere: 'Enfouissement', unite: 'T', reference: '', baseAppliquee: 'ADEME' },
        { id: 2, typeDechet: 'Chutes', quantiteTotale: 10, facteur: 0.02,
          emissionCalculee: 0.2, etablissement: 'MISFAT I', provenance: 'Réel',
          filiere: 'Recyclage', unite: 'T', reference: '', baseAppliquee: 'ADEME' }
      ]));

      const fixture = monter(DechetsComponent);
      const composant = fixture.componentInstance as any;

      composant.filtreMetier = 'Boues';
      redessiner(fixture);

      composant.reprendreEnMasse({
        avant: composant.emissionsFiltrees,
        apres: composant.emissionsFiltrees.map((l: any) => ({ ...l, facteur: 0.5, emissionCalculee: 5 }))
      });

      const relues = JSON.parse(localStorage.getItem('listeEmissionsDechets') ?? '[]');
      const boues = relues.find((l: any) => l.id === 1);
      const chutes = relues.find((l: any) => l.id === 2);

      expect(boues.facteur).toBeCloseTo(0.5, 10);
      // L'autre type n'a pas bougé : la reprise s'arrête au périmètre filtré.
      expect(chutes.facteur).toBeCloseTo(0.02, 10);
    });
  });
});
