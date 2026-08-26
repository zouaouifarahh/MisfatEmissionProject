import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ImportDataComponent } from './import-data.component';
import { DispatchStore, LigneValorisee } from '../../shared/dispatch/dispatch-store';

/**
 * Enregistrement en base des lignes d'import corrigées.
 *
 * <p>Jusqu'ici, corriger une ligne ne la faisait vivre que dans le navigateur :
 * elle alimentait les écrans de catégorie et le bilan, mais un poste réinstallé
 * ou un autre utilisateur n'en voyait rien. La validation des corrections écrit
 * désormais ces lignes en base.</p>
 *
 * <p>Deux exigences se répondent et sont testées ensemble : n'écrire que ce qui
 * est réellement valide, et n'écrire qu'une fois. Sans la seconde, valider deux
 * fois le même écran doublerait le bilan.</p>
 */
describe('Import — validation, persistance et notification', () => {

  const URL_CORRECTIONS = 'http://localhost:8082/api/v1/emissions/corrections';

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
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ImportDataComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    const fixture = TestBed.createComponent(ImportDataComponent);
    composant = fixture.componentInstance;
    magasin = TestBed.inject(DispatchStore);
    http = TestBed.inject(HttpTestingController);
    http.match(() => true).forEach(r => r.flush([]));
  });

  const publier = (lignes: LigneValorisee[]) => magasin.publier({
    lignes, fichier: 'BG MISFAT 2025.xlsx', importeLe: '2026-01-01',
    exclues: 0, nonVentilees: 0, exercice: 2025, entityId: null
  });

  /** Requête d'enregistrement en attente, s'il y en a une. */
  const requeteCorrections = () => http.match(r => r.url === URL_CORRECTIONS);

  describe('règle de validité', () => {

    it('tient une ligne sous repli ADEME pour invalide', () => {
      const ligne = ligneDe({ origineFacteur: 'ADEME Fallback' });
      expect(magasin.estValide(ligne)).toBe(false);
    });

    it('tient une ligne sans catégorie pour invalide', () => {
      const ligne = ligneDe({ origineFacteur: 'MS SQL BDD', categorieAbsente: true });
      expect(magasin.estValide(ligne)).toBe(false);
    });

    it('tient pour valide une ligne documentée, catégorisée et chiffrée', () => {
      const ligne = ligneDe({ origineFacteur: 'MS SQL BDD' });
      expect(magasin.estValide(ligne)).toBe(true);
    });

    it('reconnaît une correction manuelle comme un facteur valable', () => {
      // C'est tout l'objet de la correction : la ligne cesse d'être une
      // anomalie sans pour autant provenir du référentiel.
      const ligne = ligneDe({ origineFacteur: 'Correction manuelle', facteur: 0.5 });
      expect(magasin.estValide(ligne)).toBe(true);
    });

    it('écarte une ligne à quantité nulle', () => {
      const ligne = ligneDe({ origineFacteur: 'MS SQL BDD', quantite: 0 });
      expect(magasin.estValide(ligne)).toBe(false);
    });
  });

  describe('validation des corrections', () => {

    beforeEach(() => publier([
      ligneDe({ cle: 'BG#1', origineFacteur: 'ADEME Fallback' }),
      ligneDe({ cle: 'BG#2', origineFacteur: 'ADEME Fallback' })
    ]));

    it('enregistre la ligne corrigée avec le facteur saisi, non celui du repli', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });

      const requetes = requeteCorrections();
      expect(requetes.length).toBe(1);

      const charge = requetes[0].request.body as any[];
      expect(charge.length).toBe(1);
      expect(charge[0].cle).toBe('BG#1');
      // Le facteur transmis est celui que l'utilisateur a validé.
      expect(charge[0].factor).toBe(0.5);
      expect(charge[0].quantity).toBe(10_000);
      // L'exercice de la balance, non le jour de la correction.
      expect(charge[0].measureDate).toBe('2025-12-31');

      requetes[0].flush({ clesEnregistrees: ['BG#1'], ecartees: 0, motifs: [] });
    });

    it('n\'envoie pas les lignes restées en anomalie', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });

      const charge = requeteCorrections()[0].request.body as any[];
      // BG#2 est toujours sous repli : elle n'a rien à faire en base.
      expect(charge.map(l => l.cle)).toEqual(['BG#1']);
    });

    it('annonce le succès dans un message reprenant le compte enregistré', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].flush({ clesEnregistrees: ['BG#1'], ecartees: 0, motifs: [] });

      expect(composant.toastMessage).toContain('1 ligne(s) corrigée(s)');
      expect(composant.toastMessage).toContain('intégrée(s) aux catégories correspondantes');
      expect(composant.toastSecondaire).toBe('');
    });

    it('signale séparément les lignes que le serveur a écartées', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].flush({
        clesEnregistrees: [], ecartees: 1, motifs: ['Achats… : aucun facteur à rattacher']
      });

      expect(composant.toastSecondaire).toContain('1 ligne(s) n\'ont pas pu être enregistrées');
    });

    it('garde les corrections à l\'écran quand l\'écriture échoue', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].error(new ProgressEvent('error'), { status: 0 });

      // La ligne reste corrigée dans le magasin : les écrans de catégorie
      // l'affichent déjà, annoncer une perte serait faux.
      const ligne = magasin.instantane.lignes.find(l => l.cle === 'BG#1')!;
      expect(ligne.facteur).toBe(0.5);
      expect(ligne.persisteeEnBase).toBeFalsy();
      expect(composant.toastMessage).toContain('non enregistrées en base');
    });
  });

  describe('non-duplication', () => {

    beforeEach(() => publier([ligneDe({ cle: 'BG#1', origineFacteur: 'ADEME Fallback' })]));

    it('ne réenvoie pas une ligne que le serveur a confirmée', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].flush({ clesEnregistrees: ['BG#1'], ecartees: 0, motifs: [] });

      // Seconde validation, sans nouvelle correction : plus rien à écrire.
      composant.appliquerCorrectionsImport({ corrections: [], suppressions: [] });
      expect(requeteCorrections().length).toBe(0);
    });

    it('réenvoie une ligne que le serveur n\'a pas confirmée', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].flush({ clesEnregistrees: [], ecartees: 1, motifs: ['rejet'] });

      composant.appliquerCorrectionsImport({ corrections: [], suppressions: [] });
      expect(requeteCorrections().length).toBe(1);
    });

    it('remet à écrire une ligne dont le facteur est corrigé à nouveau', () => {
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections()[0].flush({ clesEnregistrees: ['BG#1'], ecartees: 0, motifs: [] });

      // L'utilisateur se ravise : la mesure en base ne reflète plus son choix.
      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.8 }], suppressions: []
      });

      const requetes = requeteCorrections();
      expect(requetes.length).toBe(1);
      expect((requetes[0].request.body as any[])[0].factor).toBe(0.8);
    });
  });

  describe('rafraîchissement de la répartition', () => {

    beforeEach(() => publier([
      ligneDe({ cle: 'BG#1', origineFacteur: 'ADEME Fallback' }),
      ligneDe({ cle: 'BG#2', origineFacteur: 'MS SQL BDD', facteur: 0.1, emissionKg: 1_000 })
    ]));

    it('porte la destination sur chaque poste, pour qu\'il reste cliquable', () => {
      composant.voirDetails({
        id: -1, fileName: 'BG MISFAT 2025.xlsx', importDate: '2026-01-01T00:00:00Z',
        totalRows: 2, createdReferences: 0, createdSources: 0, createdFactors: 0,
        errorCount: 0, status: 'SUCCESS', errorDetail: null, importedBy: null
      });

      // Sans la destination, cliquer la ligne de répartition ouvrait un
      // sous-tableau vide : le filtre ne trouvait aucune ligne.
      const postes = composant.repartitionDetaillee;
      expect(postes.length).toBeGreaterThan(0);
      expect(postes.every(p => !!p.ecran)).toBe(true);

      composant.ouvrirSelection({
        libelle: postes[0].categorie, genre: 'poste', ecran: postes[0].ecran
      });
      expect(composant.lignesDetail.length).toBe(2);
    });

    it('recalcule lignes et total après une correction', () => {
      composant.voirDetails({
        id: -1, fileName: 'BG MISFAT 2025.xlsx', importDate: '2026-01-01T00:00:00Z',
        totalRows: 2, createdReferences: 0, createdSources: 0, createdFactors: 0,
        errorCount: 0, status: 'SUCCESS', errorDetail: null, importedBy: null
      });

      const avant = composant.totalDetaille;

      composant.appliquerCorrectionsImport({
        corrections: [{ id: 'BG#1', facteur: 0.5 }], suppressions: []
      });
      requeteCorrections().forEach(r =>
        r.flush({ clesEnregistrees: ['BG#1'], ecartees: 0, motifs: [] }));

      // 10 000 × 0,5 = 5 000 au lieu de 3 100 : le tableau suit la correction.
      expect(composant.totalDetaille).toBeCloseTo(avant + 1_900, 6);
      expect(composant.repartitionDetaillee[0].lignes).toBe(2);
    });
  });
});
