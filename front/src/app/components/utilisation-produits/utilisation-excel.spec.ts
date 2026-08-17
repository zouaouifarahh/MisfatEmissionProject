import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurUtilisation
} from './utilisation-excel';
import {
  reconnaitreGamme, reconnaitreTypeSaisie, retenirFacteurGamme,
  grandeurValorisee, uniteValorisee, calculerEmissionUsage,
  classeBadgeGamme, emojiGamme, DUREE_VIE_DEFAUT_KM, REPLI_MONETAIRE
} from './utilisation-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Classeur synthétique au format de la matrice maître. */
function classeurUtilisation(enTetes: string[], lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Utilisation');
  return classeur;
}

const EN_TETES = ['Référence', 'Gamme', 'Établissement', 'Type Saisie',
                  'Quantité Vendue', 'Kilométrage (km)', 'Montant'];

describe('Gammes de produits', () => {

  it('reconnaît les gammes depuis un libellé libre', () => {
    expect(reconnaitreGamme('Filtre à Air')).toBe('Filtre à Air');
    expect(reconnaitreGamme('filtre carburant diesel')).toBe('Filtre Carburant');
    expect(reconnaitreGamme('Filtre à Huile')).toBe('Filtre à Huile');
    expect(reconnaitreGamme('Habitacle')).toBe('Filtre Habitacle');
    expect(reconnaitreGamme('gamme inconnue')).toBeNull();
    expect(reconnaitreGamme('', 'Filtre à Air')).toBe('Filtre à Air');
  });

  it('ne ramène pas « filtre à air habitacle » au filtre à air', () => {
    // L'habitacle a un impact d'usage quatre fois moindre : la confusion
    // multiplierait ses émissions par quatre.
    expect(reconnaitreGamme('filtre à air habitacle')).toBe('Filtre Habitacle');
  });

  it('associe à chaque gamme sa pastille et son emoji', () => {
    expect(classeBadgeGamme('Filtre à Air')).toBe('gamme-air');
    expect(classeBadgeGamme('Filtre Carburant')).toBe('gamme-carburant');
    expect(classeBadgeGamme('Filtre à Huile')).toBe('gamme-huile');
    expect(classeBadgeGamme('Filtre Habitacle')).toBe('gamme-habitacle');
    expect(emojiGamme('Filtre à Air')).toBe('💨');
  });

  it('reconnaît l\'approche de valorisation', () => {
    expect(reconnaitreTypeSaisie('Kilométrage')).toBe('Kilométrage');
    expect(reconnaitreTypeSaisie('Monétaire')).toBe('Monétaire');
    expect(reconnaitreTypeSaisie('Consommation Directe')).toBe('Consommation');
  });
});

describe('Facteurs : référentiel MS SQL puis repli ADEME', () => {

  const FACTEUR_BDD: FacteurDetaille[] = [{
    id: 1, referenceCode: 'MS3C11UA', typeName: 'Air filter, use phase',
    categoryName: 'Category 11: Use of sold products', scopeCode: 'SCOPE_3',
    factorValue: 0.0009, unit: 'km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  }];

  it('applique les replis ADEME par gamme quand la base est vide', () => {
    const air = retenirFacteurGamme([], { gamme: 'Filtre à Air' });
    expect(air.origine).toBe('ADEME');
    expect(air.valeur).toBe(0.0008);
    expect(air.unite).toBe('km·unité');

    expect(retenirFacteurGamme([], { gamme: 'Filtre Carburant' }).valeur).toBe(0.0012);
    expect(retenirFacteurGamme([], { gamme: 'Filtre à Huile' }).valeur).toBe(0.0005);
    expect(retenirFacteurGamme([], { gamme: 'Filtre Habitacle' }).valeur).toBe(0.0002);
  });

  it('applique le repli monétaire à une valorisation au chiffre d\'affaires', () => {
    const monetaire = retenirFacteurGamme([], {
      gamme: 'Filtre à Air', monetaire: true, devise: 'TND'
    });
    expect(monetaire.valeur).toBe(REPLI_MONETAIRE);
    expect(monetaire.valeur).toBe(0.220);
  });

  it('préfère le facteur MS SQL au repli quand il documente la gamme', () => {
    const retenu = retenirFacteurGamme(FACTEUR_BDD, { gamme: 'Filtre à Air' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.0009);
    expect(retenu.baseAppliquee).toBe('DESNZ 2024');

    // Une gamme non documentée bascule sur son repli.
    expect(retenirFacteurGamme(FACTEUR_BDD, { gamme: 'Filtre à Huile' }).origine).toBe('ADEME');
  });
});

describe('Formule du kilométrage couvert', () => {

  it('multiplie le volume vendu par la durée de vie', () => {
    const source = {
      typeSaisie: 'Kilométrage' as const, quantiteVendue: 10000,
      dureeVieKm: 15000, montant: null
    };
    // 10 000 unités × 15 000 km = 150 000 000 km·unité
    expect(grandeurValorisee(source)).toBe(150_000_000);
    expect(uniteValorisee('Kilométrage')).toBe('km·unité');

    // × 0,0008 = 120 000,00 kgCO₂e
    expect(calculerEmissionUsage(150_000_000, 0.0008)).toBeCloseTo(120000, 2);
  });

  it('retient la durée de vie par défaut quand elle n\'est pas renseignée', () => {
    expect(DUREE_VIE_DEFAUT_KM).toBe(15000);
    expect(grandeurValorisee({
      typeSaisie: 'Kilométrage', quantiteVendue: 100, dureeVieKm: null, montant: null
    })).toBe(1_500_000);
  });

  it('prend le montant tel quel en approche monétaire', () => {
    expect(grandeurValorisee({
      typeSaisie: 'Monétaire', quantiteVendue: null, dureeVieKm: null, montant: 50000
    })).toBe(50000);
    expect(calculerEmissionUsage(50000, 0.220)).toBeCloseTo(11000, 2);
  });

  it('ne valorise rien sans quantité ni durée exploitable', () => {
    expect(grandeurValorisee({
      typeSaisie: 'Kilométrage', quantiteVendue: null, dureeVieKm: 15000, montant: null
    })).toBeNull();
    expect(grandeurValorisee({
      typeSaisie: 'Kilométrage', quantiteVendue: 100, dureeVieKm: 0, montant: null
    })).toBeNull();
    expect(calculerEmissionUsage(null, 0.0008)).toBe(0);
  });
});

describe('Parser de la matrice maître', () => {

  it('reconnaît les en-têtes et tous leurs alias', () => {
    const carte = mapperColonnes(['Code Produit', 'Type Filtre', 'Site', 'Approche',
                                  'Unités', 'Km/Unité', 'CA']);
    expect(carte['reference']).toBe(0);
    expect(carte['gamme']).toBe(1);
    expect(carte['etablissement']).toBe(2);
    expect(carte['typeSaisie']).toBe(3);
    expect(carte['quantite']).toBe(4);
    expect(carte['dureeVie']).toBe(5);
    expect(carte['montant']).toBe(6);
  });

  it('ne confond pas « Type Saisie » et « Type Filtre »', () => {
    const carte = mapperColonnes(['Type Filtre', 'Type Saisie', 'Quantité Vendue']);
    expect(carte['gamme']).toBe(0);
    expect(carte['typeSaisie']).toBe(1);
    expect(detecterLigneEnTete([['Type Filtre', 'Quantité Vendue']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['Référence', 'Site'])))
      .toEqual(['Gamme / Type Filtre', 'Quantité Vendue ou Montant']);
    expect(colonnesManquantes(mapperColonnes(EN_TETES))).toEqual([]);
  });

  it('applique les valeurs par défaut sur les colonnes optionnelles', () => {
    const resultat = lireClasseurUtilisation(classeurUtilisation(
      ['Gamme', 'Quantité Vendue'],
      [['Filtre à Air', 10000]]
    ))!;

    expect(resultat.lignes.length).toBe(1);
    const ligne = resultat.lignes[0];

    expect(ligne.reference).toBe('USE-0001');
    expect(ligne.etablissement).toBe('Site Principal');
    expect(ligne.typeSaisie).toBe('Kilométrage');
    expect(ligne.dureeVieKm).toBe(15000);
    expect(ligne.grandeur).toBe(150_000_000);
    expect(ligne.defautsAppliques).toContain('référence');
    expect(ligne.defautsAppliques).toContain('durée de vie');
  });

  it('écarte les lignes de total et les gammes sans grandeur', () => {
    const resultat = lireClasseurUtilisation(classeurUtilisation(EN_TETES, [
      ['', 'Filtre à Air', '', '', 10000, 15000, ''],
      ['', 'Filtre à Huile', '', '', '#N/A', '', ''],
      ['', '', '', '', 99999, '', '']
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /ni quantité vendue ni montant/.test(r.motif))).toBe(true);
  });

  it('valorise une matrice complète avec les replis ADEME', () => {
    const resultat = lireClasseurUtilisation(classeurUtilisation(EN_TETES, [
      ['P-1', 'Filtre à Air', 'MISFAT 1', 'Kilométrage', 10000, 15000, ''],
      ['P-2', 'Filtre Carburant', 'MISFAT 1', 'Kilométrage', 5000, 20000, ''],
      ['P-3', 'Filtre Habitacle', 'MISFAT 1', 'Monétaire', '', '', 50000]
    ]))!;

    const valorisees = resultat.lignes.map(ligne => {
      const facteur = retenirFacteurGamme([], {
        gamme: ligne.gamme!, monetaire: ligne.typeSaisie === 'Monétaire', devise: 'TND'
      });
      return {
        reference: ligne.reference,
        origine: facteur.origine,
        emission: calculerEmissionUsage(ligne.grandeur, facteur.valeur)
      };
    });

    // 10 000 × 15 000 km × 0,0008 = 120 000 kgCO₂e
    expect(valorisees[0].emission).toBeCloseTo(120000, 2);
    // 5 000 × 20 000 km × 0,0012 = 120 000 kgCO₂e
    expect(valorisees[1].emission).toBeCloseTo(120000, 2);
    // 50 000 TND × 0,220 = 11 000 kgCO₂e
    expect(valorisees[2].emission).toBeCloseTo(11000, 2);

    expect(valorisees.every(v => v.origine === 'ADEME')).toBe(true);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('10 000')).toBe(10000);
    expect(nombreTolerant('15 000,5')).toBeCloseTo(15000.5, 3);
    expect(nombreTolerant('#N/A')).toBeNull();
  });
});
