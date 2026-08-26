import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ImportDataComponent } from './import-data.component';
import { DispatchStore, LigneValorisee } from '../../shared/dispatch/dispatch-store';

/**
 * Interactivité de la modale « Détail de l'import ».
 *
 * <p>Un avertissement qui annonce « 19 lignes sans catégorie » laissait
 * l'utilisateur les chercher lui-même dans une balance de plusieurs centaines
 * de postes. La carte devient le chemin le plus court vers ce qu'elle
 * signale.</p>
 *
 * <p>Corriger ou écarter une ligne passe par le magasin de répartition, seul
 * capable de republier à tous ses abonnés : les totaux de la modale, ceux des
 * écrans et le bilan suivent ensemble, sans rechargement.</p>
 */
describe('Détail de l\'import — cartes et sous-tableau', () => {

  const ligneDe = (sur: Partial<LigneValorisee> = {}): LigneValorisee => ({
    cle: 'BG#1', feuille: 'BG MISFAT 2025', ligneSource: 2, mainAccount: '601000',
    nom: 'Achats matières premières', categorieCarboneTexte: 'Metals',
    categorieAbsente: false, reference: '', quantite: 10_000, colonneValeur: 'Débit',
    colonnesEcartees: [], ecran: 'biens-services', scope: 'SCOPE_3',
    motif: 'compte 601000', origineRoutage: 'compte', motCle: '601000', exclu: false,
    facteur: 0.31, uniteFacteur: 'TND', libelleFacteur: 'Metals',
    baseAppliquee: 'ADEME Fallback', origineFacteur: 'ADEME Fallback',
    emissionKg: 3_100, referenceCarbone: '', ...sur
  } as LigneValorisee);

  let composant: ImportDataComponent;
  let magasin: DispatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ImportDataComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    const fixture = TestBed.createComponent(ImportDataComponent);
    composant = fixture.componentInstance;
    magasin = TestBed.inject(DispatchStore);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush([]));
  });

  /** Publie une répartition, comme le ferait un dépôt de balance. */
  const publier = (lignes: LigneValorisee[]) => magasin.publier({
    lignes, fichier: 'BG MISFAT 2025.xlsx', importeLe: '2026-01-01',
    exclues: 0, nonVentilees: 0, exercice: 2025, entityId: null
  });

  describe('reconnaissance de ce qu\'une alerte signale', () => {

    it('distingue le repli ADEME de la catégorie absente', () => {
      expect(composant.genreAvertissement('4 ligne(s) valorisée(s) par un facteur de repli ADEME…'))
        .toBe('repli');
      expect(composant.genreAvertissement('19 ligne(s) comptable(s) sans catégorie carbone…'))
        .toBe('sans-categorie');
    });

    it('ne rend pas cliquable une alerte purement informative', () => {
      // « 48 poste(s) écarté(s) du bilan à dessein » n'a rien à corriger : lui
      // donner une loupe promettait un tableau que rien ne pouvait remplir, et
      // l'utilisateur y lisait « aucune ligne ne correspond » comme un défaut.
      const ecartes = '48 poste(s) écarté(s) du bilan à dessein (personnel, financier…). '
        + 'Aucune action requise.';

      expect(composant.genreAvertissement(ecartes)).toBe('informatif');
      expect(composant.avertissementActionnable(ecartes)).toBe(false);
    });

    it('rend cliquables les seules alertes corrigeables', () => {
      expect(composant.avertissementActionnable('4 ligne(s) … repli ADEME …')).toBe(true);
      expect(composant.avertissementActionnable('13 ligne(s) sans catégorie carbone …')).toBe(true);
      expect(composant.avertissementActionnable('7 ligne(s) restent à qualifier')).toBe(false);
    });

    it('reconnaît l\'alerte propre aux immobilisations', () => {
      // Les deux replis ne désignent pas la même colonne à compléter : les
      // confondre enverrait l'utilisateur corriger le mauvais classeur.
      const texte = '3 immobilisation(s) sans catégorie carbone exploitable…';
      expect(composant.ecranAvertissement(texte)).toBe('investissements');
      expect(composant.ecranAvertissement('19 ligne(s) comptable(s) sans catégorie…'))
        .toBeUndefined();
    });
  });

  describe('sous-tableau filtré', () => {

    beforeEach(() => publier([
      ligneDe({ cle: 'BG#1', origineFacteur: 'ADEME Fallback' }),
      ligneDe({ cle: 'BG#2', origineFacteur: 'MS SQL BDD', facteur: 0.1, emissionKg: 1_000 }),
      ligneDe({ cle: 'BG#3', categorieAbsente: true, ecran: 'dechets', scope: 'SCOPE_3' })
    ]));

    it('n\'affiche rien tant qu\'aucune carte n\'est cliquée', () => {
      expect(composant.selectionDetail).toBeNull();
      expect(composant.lignesDetail).toEqual([]);
    });

    it('ouvre les lignes sous repli', () => {
      composant.ouvrirSelection({ libelle: 'repli', genre: 'repli' });

      const cles = composant.lignesDetail.map(l => l.cle);
      expect(cles).toContain('BG#1');
      expect(cles).not.toContain('BG#2');
    });

    it('ouvre les lignes sans catégorie hors immobilisations', () => {
      composant.ouvrirSelection({ libelle: 'sans cat', genre: 'sans-categorie' });

      expect(composant.lignesDetail.map(l => l.cle)).toEqual(['BG#3']);
    });

    it('ouvre les lignes d\'un poste de la répartition', () => {
      composant.ouvrirSelection({
        libelle: 'Biens et services', genre: 'poste', ecran: 'biens-services'
      });

      expect(composant.lignesDetail.map(l => l.cle)).toEqual(['BG#1', 'BG#2']);
    });

    it('totalise les émissions du sous-tableau', () => {
      composant.ouvrirSelection({ libelle: 'p', genre: 'poste', ecran: 'biens-services' });
      expect(composant.totalDetailSelection).toBeCloseTo(4_100, 6);
    });

    it('se referme au second clic sur la même carte', () => {
      const selection = { libelle: 'repli', genre: 'repli' as const };

      composant.ouvrirSelection(selection);
      expect(composant.selectionDetail).not.toBeNull();

      composant.ouvrirSelection(selection);
      expect(composant.selectionDetail).toBeNull();
    });
  });

  describe('décompte vivant des avertissements', () => {

    /** Six lignes sous repli : de quoi voir l'alerte décroître. */
    const sousRepli = () => Array.from({ length: 6 }, (_, rang) =>
      ligneDe({ cle: `BG#${rang + 1}`, origineFacteur: 'ADEME Fallback' }));

    beforeEach(() => {
      publier(sousRepli());
      composant.logDetaille = {
        id: 1, fileName: 'BG MISFAT 2025.xlsx', importDate: '2026-01-01T00:00:00Z',
        totalRows: 6, createdReferences: 0, createdSources: 0, createdFactors: 0,
        errorCount: 0, status: 'SUCCESS', errorDetail: null, importedBy: null
      };
    });

    it('annonce le compte réel des lignes sous repli', () => {
      const alerte = composant.avertissementsDetailles.find(a => /repli ADEME/.test(a));
      expect(alerte).toContain('6 ligne(s)');
    });

    it('décroît à mesure que les lignes sont écartées', () => {
      // Quatre supprimées : l'alerte doit annoncer les deux qui restent, non
      // les six d'origine — sinon elle enverrait chercher ce qui n'existe plus.
      for (const cle of ['BG#1', 'BG#2', 'BG#3', 'BG#4']) {
        composant.supprimerLigneDetail(magasin.instantane.lignes.find(l => l.cle === cle)!);
      }

      const alerte = composant.avertissementsDetailles.find(a => /repli ADEME/.test(a));
      expect(alerte).toContain('2 ligne(s)');
    });

    it('disparaît quand plus aucune ligne n\'est concernée', () => {
      for (const ligne of [...magasin.instantane.lignes]) {
        composant.supprimerLigneDetail(ligne);
      }

      expect(composant.avertissementsDetailles.some(a => /repli ADEME/.test(a))).toBe(false);
    });

    it('décroît aussi quand une ligne est corrigée plutôt qu\'écartée', () => {
      // Corriger le facteur sort la ligne du repli : le magasin réinscrit son
      // origine, et l'alerte cesse de la compter.
      const ligne = magasin.instantane.lignes[0];
      composant.editerLigne(ligne);
      composant.facteurEdite = '0,5';
      composant.enregistrerEdition(ligne);

      const restantes = magasin.instantane.lignes
        .filter(l => l.origineFacteur === 'ADEME Fallback').length;
      expect(restantes).toBe(5);

      // La ligne corrigée n'a pas disparu : elle a changé d'origine. C'est ce
      // qui la fait sortir du tableau des erreurs sans la retirer du bilan.
      const corrigee = magasin.instantane.lignes[0];
      expect(corrigee.origineFacteur).toBe('Correction manuelle');
      expect(corrigee.facteur).toBe(0.5);
    });

    it('recalcule le total du dépôt après suppression', () => {
      const avant = composant.totalDetaille;
      composant.supprimerLigneDetail(magasin.instantane.lignes[0]);

      // Le total suit sans rechargement : c'est ce que l'utilisateur observe.
      expect(composant.totalDetaille).toBeLessThan(avant);
      expect(composant.totalDetaille).toBeCloseTo(avant - 3_100, 6);
    });
  });

  describe('correction de la catégorie manquante', () => {

    beforeEach(() => publier([
      ligneDe({ cle: 'BG#1', categorieAbsente: true, categorieCarboneTexte: '' }),
      ligneDe({ cle: 'BG#2', categorieAbsente: false, categorieCarboneTexte: 'Metals' })
    ]));

    it('propose la saisie de catégorie sur cette alerte seulement', () => {
      composant.ouvrirSelection({ libelle: 'sans cat', genre: 'sans-categorie' });
      expect(composant.corrigeLaCategorie).toBe(true);

      composant.ouvrirSelection({ libelle: 'repli', genre: 'repli' });
      expect(composant.corrigeLaCategorie).toBe(false);
    });

    it('propose les catégories déjà présentes dans le dépôt', () => {
      expect(composant.categoriesProposees).toContain('Metals');
    });

    it('renseigne la catégorie et sort la ligne du décompte', () => {
      composant.ouvrirSelection({ libelle: 'sans cat', genre: 'sans-categorie' });
      const ligne = magasin.instantane.lignes.find(l => l.cle === 'BG#1')!;

      composant.editerLigne(ligne);
      composant.categorieEditee = 'Metals';
      composant.enregistrerEdition(ligne);

      const corrigee = magasin.instantane.lignes.find(l => l.cle === 'BG#1')!;
      expect(corrigee.categorieCarboneTexte).toBe('Metals');
      expect(corrigee.categorieAbsente).toBe(false);

      // Elle ne figure plus dans le sous-tableau de l'alerte.
      expect(composant.lignesDetail.map(l => l.cle)).not.toContain('BG#1');
    });

    it('refuse une catégorie vide sans rien changer', () => {
      composant.ouvrirSelection({ libelle: 'sans cat', genre: 'sans-categorie' });
      const ligne = magasin.instantane.lignes.find(l => l.cle === 'BG#1')!;

      composant.editerLigne(ligne);
      composant.categorieEditee = '   ';
      composant.enregistrerEdition(ligne);

      expect(composant.erreurEdition).toContain('catégorie carbone');
      expect(magasin.instantane.lignes.find(l => l.cle === 'BG#1')!.categorieAbsente).toBe(true);
    });
  });

  describe('validation groupée depuis le panneau', () => {

    beforeEach(() => {
      publier([
        ligneDe({ cle: 'BG#1', categorieAbsente: true, categorieCarboneTexte: '' }),
        ligneDe({ cle: 'BG#2', categorieAbsente: true, categorieCarboneTexte: '' }),
        ligneDe({ cle: 'BG#3', categorieAbsente: false, categorieCarboneTexte: 'Metals' })
      ]);
      composant.logDetaille = {
        id: 1, fileName: 'BG MISFAT 2025.xlsx', importDate: '2026-01-01T00:00:00Z',
        totalRows: 3, createdReferences: 0, createdSources: 0, createdFactors: 0,
        errorCount: 0, status: 'SUCCESS', errorDetail: null, importedBy: null
      };
    });

    it('expose les champs que le panneau lit sur une ligne ventilée', () => {
      // La clé sert d'identifiant : l'identifiant négatif d'une ligne ventilée
      // est reconstruit à chaque conversion et ne survivrait pas au retour.
      expect(composant.champsCorrectionImport.identifiant).toBe('cle');
      expect(composant.champsCorrectionImport.libelle).toBe('nom');
    });

    it('propose les catégories déjà documentées du dépôt', () => {
      expect(composant.categoriesProposees).toEqual(['Metals']);
    });

    it('applique catégories et suppressions en un geste', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', categorie: 'Metals' }],
        suppressions: ['BG#2']
      });

      const lignes = magasin.instantane.lignes;
      expect(lignes.map(l => l.cle)).toEqual(['BG#1', 'BG#3']);
      expect(lignes.find(l => l.cle === 'BG#1')!.categorieAbsente).toBe(false);
    });

    it('décompte l\'alerte à mesure des corrections', () => {
      const compte = () => composant.avertissementsDetailles
        .find((a: string) => /sans catégorie carbone/.test(a));

      expect(compte()).toContain('2 ligne(s)');

      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', categorie: 'Metals' }], suppressions: []
      });
      expect(compte()).toContain('1 ligne(s)');

      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#2', categorie: 'Metals' }], suppressions: []
      });
      // Plus aucune ligne concernée : l'encadré disparaît.
      expect(compte()).toBeUndefined();
    });

    it('applique un facteur saisi et recalcule l\'émission', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#3', facteur: 0.5 }], suppressions: []
      });

      const ligne = magasin.instantane.lignes.find(l => l.cle === 'BG#3')!;
      expect(ligne.facteur).toBeCloseTo(0.5, 10);
      // 10 000 × 0,5 : le total du dépôt suit.
      expect(ligne.emissionKg).toBeCloseTo(5_000, 6);
    });

    it('rend compte de ce qui a été appliqué et referme', () => {
      composant.ouvrirSelection({ libelle: 'sans cat', genre: 'sans-categorie' });

      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', categorie: 'Metals' }], suppressions: ['BG#2']
      });

      expect(composant.correctionMessage).toContain('1 correction(s)');
      expect(composant.correctionMessage).toContain('1 ligne(s) retirée(s)');
      expect(composant.selectionDetail).toBeNull();
    });

    it('réinjecte la ligne corrigée dans le total de sa destination', () => {
      const avant = magasin.totalPour('biens-services');

      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', categorie: 'Metals' }], suppressions: []
      });

      // La revalorisation change l'émission : le total de la catégorie bouge,
      // donc les écrans et le bilan aussi.
      expect(magasin.totalPour('biens-services')).not.toBe(avant);
    });
  });

  describe('correction et suppression', () => {

    beforeEach(() => publier([ligneDe()]));

    it('corrige le facteur et recalcule l\'émission', () => {
      const ligne = magasin.instantane.lignes[0];

      composant.editerLigne(ligne);
      composant.facteurEdite = '0,5';
      composant.enregistrerEdition(ligne);

      const [apres] = magasin.instantane.lignes;
      expect(apres.facteur).toBeCloseTo(0.5, 10);
      // 10 000 × 0,5 : le total de la modale suit sans rechargement.
      expect(apres.emissionKg).toBeCloseTo(5_000, 6);
    });

    it('inscrit la provenance de la correction', () => {
      const ligne = magasin.instantane.lignes[0];
      composant.editerLigne(ligne);
      composant.facteurEdite = '0,5';
      composant.enregistrerEdition(ligne);

      expect(magasin.instantane.lignes[0].baseAppliquee).toContain('détail import');
    });

    it('refuse un facteur invalide sans rien changer', () => {
      const ligne = magasin.instantane.lignes[0];

      composant.editerLigne(ligne);
      composant.facteurEdite = '0';
      composant.enregistrerEdition(ligne);

      expect(composant.erreurEdition).toContain('strictement positif');
      expect(magasin.instantane.lignes[0].facteur).toBeCloseTo(0.31, 10);
      // L'édition reste ouverte : la saisie est à corriger, non à recommencer.
      expect(composant.ligneEditee).toBe('BG#1');
    });

    it('abandonne l\'édition sans rien modifier', () => {
      const ligne = magasin.instantane.lignes[0];

      composant.editerLigne(ligne);
      composant.facteurEdite = '9,99';
      composant.annulerEdition();

      expect(composant.ligneEditee).toBeNull();
      expect(magasin.instantane.lignes[0].facteur).toBeCloseTo(0.31, 10);
    });

    it('écarte une ligne du bilan', () => {
      const ligne = magasin.instantane.lignes[0];
      composant.supprimerLigneDetail(ligne);

      expect(magasin.instantane.lignes).toHaveLength(0);
      // La ligne n'est pas devenue inclassable : elle a été jugée hors périmètre.
      expect(magasin.instantane.exclues).toBe(1);
    });

    it('met à jour le total de la destination après suppression', () => {
      composant.supprimerLigneDetail(magasin.instantane.lignes[0]);
      expect(magasin.totalPour('biens-services')).toBe(0);
    });
  });
});
