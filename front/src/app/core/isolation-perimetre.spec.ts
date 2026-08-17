import { describe, it, expect, beforeEach } from 'vitest';

import {
  ORGANISATION_GROUPE,
  PerimetreOrganisation,
  exercicesDeLaLigne,
  memeEtablissement,
  releveDeLExercice,
  releveDeLaSociete,
  releveDuPerimetre
} from './perimetre';
import { totauxLocaux, totauxLocauxParEtablissement } from '../shared/dispatch/mesures-locales';
import { posteDepuisIntitule, scopeDuPoste } from './nomenclature-scopes';

/**
 * Étanchéité du périmètre [société + exercice].
 *
 * <p>C'est la règle sur laquelle repose tout le reporting : consulter
 * « MISFAT TUNISIE » et « 2024 » ne doit laisser remonter ni une mesure de
 * 2025, ni celle d'une autre société.</p>
 */
describe('Isolation stricte du périmètre', () => {

  const MISFAT: PerimetreOrganisation = {
    entityId: 7,
    etablissements: ['MISFAT I', 'MISFAT II'],
    societeUnique: false
  };

  describe('rattachement à l\'exercice', () => {

    it('retient la ligne sur l\'exercice de sa période', () => {
      const ligne = { dateDebut: '2024-01-01', dateFin: '2024-12-31' };
      expect(releveDeLExercice(ligne, 2024)).toBe(true);
      expect(releveDeLExercice(ligne, 2025)).toBe(false);
      expect(releveDeLExercice(ligne, 2026)).toBe(false);
    });

    it('rattache une période à cheval aux deux exercices qu\'elle documente', () => {
      const ligne = { dateDebut: '2024-12-01', dateFin: '2025-01-31' };
      expect(exercicesDeLaLigne(ligne)).toEqual([2024, 2025]);
      expect(releveDeLExercice(ligne, 2024)).toBe(true);
      expect(releveDeLExercice(ligne, 2025)).toBe(true);
      expect(releveDeLExercice(ligne, 2023)).toBe(false);
    });

    it('retombe sur la date de création à défaut de période', () => {
      const ligne = { creeLe: '2024-03-08T10:00:00' };
      expect(releveDeLExercice(ligne, 2024)).toBe(true);
      expect(releveDeLExercice(ligne, 2025)).toBe(false);
    });

    it('écarte une ligne qu\'aucune date ne rattache à un exercice', () => {
      // La rattacher d'office au millésime affiché lui prêterait une date
      // qu'elle n'a pas, et gonflerait le bilan de l'année consultée.
      expect(releveDeLExercice({}, 2024)).toBe(false);
    });

    it('retient tout en vue pluriannuelle', () => {
      expect(releveDeLExercice({}, null)).toBe(true);
      expect(releveDeLExercice({ dateDebut: '2019-01-01' }, null)).toBe(true);
    });
  });

  describe('rattachement à la société', () => {

    it('rapproche les écritures d\'un même établissement', () => {
      expect(memeEtablissement('MISFAT I', 'Misfat 1')).toBe(true);
      expect(memeEtablissement('MISFAT_1', 'misfat 1')).toBe(true);
      expect(memeEtablissement('Usine MISFAT', 'TN MISFAT TUNISIE')).toBe(true);
    });

    it('ne confond jamais deux usines d\'un même groupe', () => {
      // Le numéro de site est ce qui les distingue : un rapprochement par
      // inclusion ferait passer les lignes de MISFAT II pour celles de MISFAT I.
      expect(memeEtablissement('MISFAT I', 'MISFAT II')).toBe(false);
      expect(memeEtablissement('MISFAT', 'MISFAT 2')).toBe(false);
      expect(memeEtablissement('FR SOLAUFIL FRANCE', 'Misfat 1')).toBe(false);
      expect(memeEtablissement('', 'Misfat 1')).toBe(false);
    });

    it('écarte l\'établissement d\'une autre société', () => {
      expect(releveDeLaSociete({ etablissement: 'MISFAT I' }, MISFAT)).toBe(true);
      expect(releveDeLaSociete({ etablissement: 'SOLAUFIL FRANCE' }, MISFAT)).toBe(false);
    });

    it('n\'attribue une ligne sans établissement que s\'il n\'y a qu\'une société', () => {
      expect(releveDeLaSociete({ etablissement: '' }, MISFAT)).toBe(false);
      expect(releveDeLaSociete({ etablissement: '' }, { ...MISFAT, societeUnique: true })).toBe(true);
    });

    it('ne restreint rien en vue consolidée groupe', () => {
      expect(releveDeLaSociete({ etablissement: 'SOLAUFIL' }, ORGANISATION_GROUPE)).toBe(true);
    });
  });

  it('exige les deux conditions à la fois', () => {
    const ligne = { etablissement: 'MISFAT I', dateDebut: '2024-06-01', dateFin: '2024-06-30' };

    expect(releveDuPerimetre(ligne, 2024, MISFAT)).toBe(true);
    expect(releveDuPerimetre(ligne, 2025, MISFAT)).toBe(false);
    expect(releveDuPerimetre({ ...ligne, etablissement: 'SOLAUFIL' }, 2024, MISFAT)).toBe(false);
  });
});

describe('Relevé des saisies d\'écran sur un périmètre', () => {

  beforeEach(() => localStorage.clear());

  const MISFAT: PerimetreOrganisation = {
    entityId: 7, etablissements: ['MISFAT I'], societeUnique: false
  };

  /** Trois lignes : deux exercices, deux sociétés. */
  const poser = () => localStorage.setItem('listeEmissions', JSON.stringify([
    { id: 1, etablissement: 'MISFAT I', dateDebut: '2024-01-01', dateFin: '2024-12-31', emissionCalculee: 1000 },
    { id: 2, etablissement: 'MISFAT I', dateDebut: '2025-01-01', dateFin: '2025-12-31', emissionCalculee: 5000 },
    { id: 3, etablissement: 'SOLAUFIL FRANCE', dateDebut: '2024-01-01', dateFin: '2024-12-31', emissionCalculee: 7000 }
  ]));

  it('ne retient que l\'exercice et la société demandés', () => {
    poser();

    const totaux = totauxLocaux(2024, MISFAT);
    expect(totaux).toHaveLength(1);
    expect(totaux[0].emissionKg).toBe(1000);
    expect(totaux[0].lignes).toBe(1);
    expect(totaux[0].scope).toBe('SCOPE_1');
  });

  it('exclut totalement les autres exercices', () => {
    poser();

    expect(totauxLocaux(2026, MISFAT)).toEqual([]);
    expect(totauxLocaux(2025, MISFAT)[0].emissionKg).toBe(5000);
  });

  it('consolide tout le groupe sur tous les exercices', () => {
    poser();

    const totaux = totauxLocaux(null, ORGANISATION_GROUPE);
    expect(totaux[0].emissionKg).toBe(1000 + 5000 + 7000);
    expect(totaux[0].lignes).toBe(3);
  });

  it('ignore les lignes ventilées, déjà comptées par le magasin de répartition', () => {
    localStorage.setItem('listeEmissions', JSON.stringify([
      { id: -1, etablissement: 'MISFAT I', dateDebut: '2024-01-01', emissionCalculee: 9999 },
      { id: 2, etablissement: 'MISFAT I', dateDebut: '2024-01-01', emissionCalculee: 100 }
    ]));

    expect(totauxLocaux(2024, MISFAT)[0].emissionKg).toBe(100);
  });

  it('ventile par établissement sur le même périmètre', () => {
    poser();

    const parEtablissement = totauxLocauxParEtablissement(2024, MISFAT);
    expect(parEtablissement.get('MISFAT I')).toBe(1000);
    expect(parEtablissement.has('SOLAUFIL FRANCE')).toBe(false);
  });
});

describe('Rapprochement des nomenclatures', () => {

  it('reconnaît l\'identifiant d\'écran', () => {
    expect(posteDepuisIntitule('transport-amont')).toBe('transport-amont');
    expect(posteDepuisIntitule('electricite-achetee')).toBe('electricite-achetee');
  });

  it('reconnaît le numéro de catégorie GHG', () => {
    expect(posteDepuisIntitule('Category 4: Upstream transportation')).toBe('transport-amont');
    expect(posteDepuisIntitule('Category 15: Investments')).toBe('investissements');
    expect(posteDepuisIntitule('Category 1')).toBe('biens-services');
  });

  it('reconnaît les libellés français du tableau de bord', () => {
    expect(posteDepuisIntitule('Combustion dans les usines')).toBe('combustion-etablissements');
    expect(posteDepuisIntitule('Émissions de réfrigérants')).toBe('emissions-refrigerants');
    expect(posteDepuisIntitule('Déchets')).toBe('dechets');
  });

  it('range chaque poste dans son scope', () => {
    expect(scopeDuPoste('combustion-vehicules')).toBe('SCOPE_1');
    expect(scopeDuPoste('electricite-achetee')).toBe('SCOPE_2');
    expect(scopeDuPoste('investissements')).toBe('SCOPE_3');
  });

  it('avoue son ignorance plutôt que de rattacher au hasard', () => {
    expect(posteDepuisIntitule('Poste inconnu du référentiel')).toBeNull();
    expect(posteDepuisIntitule('')).toBeNull();
    expect(posteDepuisIntitule(null)).toBeNull();
  });
});
