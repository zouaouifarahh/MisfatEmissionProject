import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurFinDeVie
} from './fin-de-vie-excel';
import {
  reconnaitreFiliere, reconnaitreTypeSaisie, normaliserUnite, enKilogrammes,
  retenirFacteurFiliere, grandeurValorisee, uniteValorisee, calculerEmissionFinDeVie,
  classeBadgeFiliere, emojiFiliere, libelleFiliere, REPLI_MONETAIRE
} from './fin-de-vie-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Classeur synthétique au format de la matrice maître. */
function classeurFinDeVie(enTetes: string[], lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Fin de vie');
  return classeur;
}

const EN_TETES = ['Référence', 'Produit', 'Filière', 'Type Saisie', 'Masse (Tonnes)', 'Montant'];

describe('Filières de traitement', () => {

  it('reconnaît les filières depuis un libellé libre', () => {
    expect(reconnaitreFiliere('Recyclage')).toBe('Recyclage');
    expect(reconnaitreFiliere('valorisation matière')).toBe('Recyclage');
    expect(reconnaitreFiliere('Incinération')).toBe('Incinération');
    expect(reconnaitreFiliere('Enfouissement')).toBe('Enfouissement');
    expect(reconnaitreFiliere('mise en décharge')).toBe('Enfouissement');
    expect(reconnaitreFiliere('Déchets Dangereux')).toBe('Déchets Dangereux');
    expect(reconnaitreFiliere('filière inconnue')).toBeNull();
  });

  it('ne ramène pas « recyclage d\'huiles usagées » au recyclage matière', () => {
    // Le traitement spécialisé vaut 0,310 contre 0,021 : la confusion
    // diviserait les émissions par quinze.
    expect(reconnaitreFiliere('recyclage huiles usagées')).toBe('Déchets Dangereux');
  });

  it('associe à chaque filière sa pastille, son emoji et son libellé', () => {
    expect(classeBadgeFiliere('Recyclage')).toBe('filiere-recyclage');
    expect(classeBadgeFiliere('Incinération')).toBe('filiere-incineration');
    expect(classeBadgeFiliere('Enfouissement')).toBe('filiere-enfouissement');
    expect(classeBadgeFiliere('Déchets Dangereux')).toBe('filiere-dangereux');
    expect(emojiFiliere('Recyclage')).toBe('♻️');
    expect(libelleFiliere('Recyclage')).toBe('Recyclage / Valorisation matière');
  });

  it('reconnaît l\'approche de valorisation', () => {
    expect(reconnaitreTypeSaisie('Monétaire')).toBe('Monétaire');
    expect(reconnaitreTypeSaisie('Masse/Filière')).toBe('Masse');
  });
});

describe('Conversion des masses', () => {

  it('ramène les tonnes au kilogramme', () => {
    // Confondre tonnes et kilogrammes fausserait d'un facteur mille.
    expect(enKilogrammes(10, 'Tonnes')).toBe(10000);
    expect(enKilogrammes(10000, 'kg')).toBe(10000);
    expect(enKilogrammes(10, 'TND')).toBeNull();
    expect(normaliserUnite('t')).toBe('Tonnes');
  });
});

describe('Facteurs : référentiel MS SQL puis repli ADEME', () => {

  const FACTEUR_BDD: FacteurDetaille[] = [{
    id: 1, referenceCode: 'MS3C12EOL', typeName: 'Recycling, mixed materials',
    categoryName: 'Category 12: End-of-life treatment of sold products', scopeCode: 'SCOPE_3',
    factorValue: 0.018, unit: 'kg', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  }];

  it('applique les replis ADEME par filière quand la base est vide', () => {
    const recyclage = retenirFacteurFiliere([], { filiere: 'Recyclage' });
    expect(recyclage.origine).toBe('ADEME');
    expect(recyclage.valeur).toBe(0.021);
    expect(recyclage.unite).toBe('kg');

    expect(retenirFacteurFiliere([], { filiere: 'Incinération' }).valeur).toBe(0.410);
    expect(retenirFacteurFiliere([], { filiere: 'Enfouissement' }).valeur).toBe(0.580);
    expect(retenirFacteurFiliere([], { filiere: 'Déchets Dangereux' }).valeur).toBe(0.310);
  });

  it('applique le repli monétaire à une fin de vie facturée', () => {
    const monetaire = retenirFacteurFiliere([], {
      filiere: 'Recyclage', monetaire: true, devise: 'TND'
    });
    expect(monetaire.valeur).toBe(REPLI_MONETAIRE);
    expect(monetaire.valeur).toBe(0.150);
  });

  it('préfère le facteur MS SQL au repli quand il documente la filière', () => {
    const retenu = retenirFacteurFiliere(FACTEUR_BDD, { filiere: 'Recyclage' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.018);
    expect(retenu.baseAppliquee).toBe('DESNZ 2024');

    // Une filière non documentée bascule sur son repli.
    expect(retenirFacteurFiliere(FACTEUR_BDD, { filiere: 'Enfouissement' }).origine).toBe('ADEME');
  });
});

describe('Formule de valorisation', () => {

  it('ramène la masse au kilogramme avant valorisation', () => {
    const source = { typeSaisie: 'Masse' as const, masse: 10, unite: 'Tonnes', montant: null };
    // 10 tonnes = 10 000 kg
    expect(grandeurValorisee(source)).toBe(10000);
    expect(uniteValorisee('Masse', 'Tonnes')).toBe('kg');

    // 10 000 kg × 0,021 = 210,00 kgCO₂e
    expect(calculerEmissionFinDeVie(10000, 0.021)).toBeCloseTo(210, 2);
  });

  it('écarte les filières les unes des autres par leur intensité', () => {
    // Une même masse pèse vingt-huit fois plus en décharge qu'en recyclage.
    expect(calculerEmissionFinDeVie(10000, 0.580)).toBeCloseTo(5800, 2);
    expect(calculerEmissionFinDeVie(10000, 0.410)).toBeCloseTo(4100, 2);
  });

  it('prend le montant tel quel en approche monétaire', () => {
    const source = { typeSaisie: 'Monétaire' as const, masse: null, unite: 'TND', montant: 20000 };
    expect(grandeurValorisee(source)).toBe(20000);
    expect(calculerEmissionFinDeVie(20000, 0.150)).toBeCloseTo(3000, 2);
  });
});

describe('Parser de la matrice maître', () => {

  it('reconnaît les en-têtes et tous leurs alias', () => {
    const carte = mapperColonnes(['ID', 'Gamme', 'Mode Fin de vie', 'Approche',
                                  'Masse (kg)', 'Coût']);
    expect(carte['reference']).toBe(0);
    expect(carte['produit']).toBe(1);
    expect(carte['filiere']).toBe(2);
    expect(carte['typeSaisie']).toBe(3);
    expect(carte['masseKg']).toBe(4);
    expect(carte['montant']).toBe(5);
  });

  it('distingue « Masse (Tonnes) » de « Masse (kg) »', () => {
    const enTonnes = mapperColonnes(['Produit', 'Filière', 'Masse (Tonnes)']);
    expect(enTonnes['masseTonnes']).toBe(2);
    expect(enTonnes['masseKg']).toBeUndefined();

    const enKg = mapperColonnes(['Produit', 'Filière', 'Masse (kg)']);
    expect(enKg['masseKg']).toBe(2);
    expect(detecterLigneEnTete([['Produit', 'Filière', 'Masse (Tonnes)']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['Référence'])))
      .toEqual(['Produit / Gamme', 'Filière Traitement', 'Masse ou Montant']);
    expect(colonnesManquantes(mapperColonnes(EN_TETES))).toEqual([]);
  });

  it('applique les valeurs par défaut et convertit les masses', () => {
    const resultat = lireClasseurFinDeVie(classeurFinDeVie(
      ['Produit', 'Filière', 'Masse (Tonnes)'],
      [['Filtres à air usagés', 'Recyclage', 10]]
    ))!;

    expect(resultat.lignes.length).toBe(1);
    const ligne = resultat.lignes[0];

    expect(ligne.reference).toBe('FDV-0001');
    expect(ligne.filiere).toBe('Recyclage');
    expect(ligne.typeSaisie).toBe('Masse');
    expect(ligne.unite).toBe('Tonnes');
    expect(ligne.grandeur).toBe(10000);
    expect(ligne.uniteGrandeur).toBe('kg');
    expect(ligne.defautsAppliques).toContain('référence');
  });

  it('écarte les lignes de total et les masses illisibles', () => {
    const resultat = lireClasseurFinDeVie(classeurFinDeVie(EN_TETES, [
      ['', 'Filtres à air usagés', 'Recyclage', '', 10, ''],
      ['', 'Filtres à huile', 'Incinération', '', '#N/A', ''],
      ['', '', '', '', 999, '']
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /ni masse ni montant/.test(r.motif))).toBe(true);
  });

  it('valorise une matrice complète avec les replis ADEME', () => {
    const resultat = lireClasseurFinDeVie(classeurFinDeVie(EN_TETES, [
      ['F-1', 'Filtres à air usagés', 'Recyclage', 'Masse', 10, ''],
      ['F-2', 'Filtres habitacle', 'Incinération', 'Masse', 5, ''],
      ['F-3', 'Boîtiers plastiques', 'Enfouissement', 'Masse', 2, ''],
      ['F-4', 'Filtres à huile', 'Déchets Dangereux', 'Masse', 1, '']
    ]))!;

    const valorisees = resultat.lignes.map(ligne => {
      const facteur = retenirFacteurFiliere([], {
        filiere: ligne.filiere!, monetaire: ligne.typeSaisie === 'Monétaire'
      });
      return {
        reference: ligne.reference,
        origine: facteur.origine,
        emission: calculerEmissionFinDeVie(ligne.grandeur, facteur.valeur)
      };
    });

    // 10 t → 10 000 kg × 0,021 = 210 kgCO₂e
    expect(valorisees[0].emission).toBeCloseTo(210, 2);
    // 5 t → 5 000 kg × 0,410 = 2 050 kgCO₂e
    expect(valorisees[1].emission).toBeCloseTo(2050, 2);
    // 2 t → 2 000 kg × 0,580 = 1 160 kgCO₂e
    expect(valorisees[2].emission).toBeCloseTo(1160, 2);
    // 1 t → 1 000 kg × 0,310 = 310 kgCO₂e
    expect(valorisees[3].emission).toBeCloseTo(310, 2);

    expect(valorisees.every(v => v.origine === 'ADEME')).toBe(true);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('10,5')).toBeCloseTo(10.5, 3);
    expect(nombreTolerant('1 250')).toBe(1250);
    expect(nombreTolerant('#N/A')).toBeNull();
  });
});
