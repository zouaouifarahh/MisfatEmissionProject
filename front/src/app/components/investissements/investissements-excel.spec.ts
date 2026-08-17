import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  reconnaitreCategorie, estCelluleAbsente, retenirFacteurCapex, calculerEmissionCapex,
  montantTolerant, enTonnes, tauxCouverture, repliCategorie, categorieAppariee,
  classeBadgeCategorie, emojiCategorie, CATEGORIE_REPLI, CATEGORIES
} from './investissements-facteur';

import {
  detecterLigneEnTete, mapperColonnes, colonnesManquantes,
  lireFeuilleImmobilisations, lireClasseurImmobilisations
} from './investissements-excel';

import { FacteurDetaille } from '../../services/referential.service';

/** Extraction d'immobilisations conforme aux captures transmises. */
const EXTRACTION = [
  ['MISFAT — Immobilisations, exercice 2025', null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  ['Numéro d\'immobilisation', 'Classe', 'Nom', 'Date', 'Amort.', 'Acquisitions', 'Catégorie Carbone'],
  ['20113', 'MO', 'MOULE 25.088 ARGO', '12/03/2025', 0, '34 001,000', 'Metals / Metal Products'],
  ['21580', 'EQ', 'PROFILE ALUMINIUM 6M', '04/05/2025', 0, 12500, 'Alum / Aluminium'],
  ['IME-00851', 'EQ', 'CUVE INOX 500L', '19/06/2025', 0, 8000, 'Inox / Stainless Steel'],
  ['21999', 'CL', 'SPLIT 24000 BTU ATELIER', '02/07/2025', 0, 4200, 'Air-Conditioning & Heating'],
  ['22010', 'EQ', 'CONVOYEUR A BANDE', '15/08/2025', 0, 60000, '#N/A'],
  ['22011', 'EQ', 'PALETTISEUR AUTOMATIQUE', '20/09/2025', 0, 15000, null],
  [null, null, 'Total général', null, null, 133701, null]
];

const classeurDe = (matrice: unknown[][], nom = 'Immobilisations'): XLSX.WorkBook => {
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(matrice), nom);
  return classeur;
};

describe('Catégorie 15 — socle des investissements', () => {

  it('reconnaît chaque famille carbone depuis un libellé libre', () => {
    expect(reconnaitreCategorie('Metals / Metal Products')).toBe('Metals / Metal Products');
    expect(reconnaitreCategorie('Alum / Aluminium')).toBe('Alum / Aluminium');
    expect(reconnaitreCategorie('Inox / Stainless Steel')).toBe('Inox / Stainless Steel');
    expect(reconnaitreCategorie('Air-Conditioning & Heating')).toBe('Air-Conditioning & Heating');
    expect(reconnaitreCategorie('climatisation atelier')).toBe('Air-Conditioning & Heating');
  });

  it('ne ramène pas « aluminium metal products » aux métaux génériques', () => {
    // Les deux contiennent « metal » : le matériau précis doit primer, sinon
    // l'aluminium perdrait son facteur de 0,420 au profit de 0,380.
    expect(reconnaitreCategorie('Aluminium metal products')).toBe('Alum / Aluminium');
    expect(reconnaitreCategorie('Stainless steel products')).toBe('Inox / Stainless Steel');
  });

  it('bascule toute cellule inexploitable sur la famille de repli', () => {
    for (const cellule of ['#N/A', '#N/A!', 'N/A', '#VALEUR!', '#REF!', '-', '', '   ', 'ND']) {
      expect(estCelluleAbsente(cellule)).toBe(true);
      expect(reconnaitreCategorie(cellule)).toBe(CATEGORIE_REPLI);
    }

    expect(estCelluleAbsente('Metals')).toBe(false);
    expect(CATEGORIE_REPLI).toBe('Équipements Ind. (Fallback #N/A)');
    expect(categorieAppariee(CATEGORIE_REPLI)).toBe(false);
    expect(categorieAppariee('Alum / Aluminium')).toBe(true);
  });

  it('applique les facteurs de repli ADEME annoncés', () => {
    expect(repliCategorie('Alum / Aluminium')).toBe(0.420);
    expect(repliCategorie('Metals / Metal Products')).toBe(0.380);
    expect(repliCategorie('Inox / Stainless Steel')).toBe(0.390);
    expect(repliCategorie('Air-Conditioning & Heating')).toBe(0.310);
    expect(repliCategorie(CATEGORIE_REPLI)).toBe(0.250);

    const retenu = retenirFacteurCapex([], { categorie: CATEGORIE_REPLI, devise: 'TND' });
    expect(retenu.origine).toBe('ADEME Fallback');
    expect(retenu.valeur).toBe(0.250);
    expect(retenu.baseAppliquee).toBe('ADEME Fallback');
    expect(retenu.unite).toBe('TND');
  });

  it('associe à chaque famille sa pastille et son emoji', () => {
    expect(classeBadgeCategorie('Metals / Metal Products')).toBe('capex-metal');
    expect(classeBadgeCategorie('Alum / Aluminium')).toBe('capex-alum');
    expect(classeBadgeCategorie('Inox / Stainless Steel')).toBe('capex-inox');
    expect(classeBadgeCategorie('Air-Conditioning & Heating')).toBe('capex-clim');
    expect(classeBadgeCategorie(CATEGORIE_REPLI)).toBe('capex-repli');
    expect(emojiCategorie('Alum / Aluminium')).toBe('🧊');
    expect(CATEGORIES).toHaveLength(5);
  });

  it('préfère le facteur MS SQL au repli quand il documente la famille', () => {
    const facteurs: FacteurDetaille[] = [{
      id: 7, referenceCode: 'MS3C15AL', typeName: 'Aluminium products, monetary',
      categoryName: 'Category 15: Investments', scopeCode: 'SCOPE_3',
      factorValue: 0.455, unit: 'TND', dataType: 'MONETAIRE', currency: 'TND',
      databaseSource: 'EXIOBASE 2024', referenceYear: 2024, validityLabel: null
    }];

    const retenu = retenirFacteurCapex(facteurs, { categorie: 'Alum / Aluminium', devise: 'TND' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.455);
    expect(retenu.baseAppliquee).toBe('EXIOBASE 2024');

    // Le facteur aluminium ne doit pas servir à une autre famille.
    expect(retenirFacteurCapex(facteurs, { categorie: 'Inox / Stainless Steel' }).origine)
      .toBe('ADEME Fallback');
  });

  it('lit les montants comptables, séparateurs et devises compris', () => {
    expect(montantTolerant('34 001,000')).toBeCloseTo(34001, 3);
    expect(montantTolerant('1 234 567,89')).toBeCloseTo(1234567.89, 2);
    expect(montantTolerant('12500')).toBe(12500);
    expect(montantTolerant('8 000 TND')).toBe(8000);
    expect(montantTolerant(4200)).toBe(4200);
    expect(montantTolerant('#N/A')).toBeNull();
    expect(montantTolerant('')).toBeNull();
  });

  it('calcule les émissions et leur conversion en tonnes', () => {
    // L'exemple de la spécification : 34 001 TND × 0,250 = 8 500,25 kgCO₂e
    expect(calculerEmissionCapex(34001, 0.250)).toBeCloseTo(8500.25, 2);
    expect(enTonnes(8500.25)).toBeCloseTo(8.50025, 5);

    expect(calculerEmissionCapex(null, 0.250)).toBe(0);
    expect(calculerEmissionCapex(34001, null)).toBe(0);
  });

  it('mesure la couverture catégorisée hors lignes de repli', () => {
    expect(tauxCouverture([])).toBe(0);
    expect(tauxCouverture(['Alum / Aluminium', 'Metals / Metal Products'])).toBe(100);
    // Trois appariées sur quatre.
    expect(tauxCouverture([
      'Alum / Aluminium', 'Metals / Metal Products', 'Inox / Stainless Steel', CATEGORIE_REPLI
    ])).toBe(75);
  });
});

describe('Catégorie 15 — lecture des extractions d\'immobilisations', () => {

  it('repère l\'en-tête sous les lignes de titre', () => {
    expect(detecterLigneEnTete(EXTRACTION)).toBe(2);
  });

  it('associe chaque colonne attendue à son index', () => {
    const carte = mapperColonnes(EXTRACTION[2]);
    expect(carte['numeroImmo']).toBe(0);
    expect(carte['designation']).toBe(2);
    expect(carte['montant']).toBe(5);
    expect(carte['categorie']).toBe(6);
    expect(colonnesManquantes(carte)).toEqual([]);
  });

  it('n\'attribue pas « Catégorie Carbone » à deux champs à la fois', () => {
    const carte = mapperColonnes(['N° Immo', 'Désignation', 'Catégorie', 'Catégorie Carbone', 'Montant']);
    // La colonne carbone est plus précise : elle prime, et « Catégorie » nue
    // ne doit pas la revendiquer une seconde fois.
    expect(carte['categorie']).toBe(3);
    expect(carte['montant']).toBe(4);
  });

  it('signale une feuille dépourvue de montant', () => {
    const resultat = lireFeuilleImmobilisations(
      XLSX.utils.aoa_to_sheet([['N° Immo', 'Nom', 'Catégorie Carbone'], ['1', 'MOULE', 'Metals']]),
      'Sans montant'
    );
    expect(resultat?.colonnesManquantes).toContain('Acquisitions (TND)');
    expect(resultat?.lignes).toEqual([]);
    expect(resultat?.avertissement).toContain('inexploitable');
  });

  it('lit l\'extraction MISFAT et écarte la seule ligne de total', () => {
    const resultat = lireClasseurImmobilisations(classeurDe(EXTRACTION));
    expect(resultat).toBeTruthy();
    expect(resultat!.colonnesManquantes).toEqual([]);

    // Six immobilisations ; le cumul final n'a ni code ni libellé exploitable.
    expect(resultat!.lignes).toHaveLength(6);
    expect(resultat!.rejets).toHaveLength(1);

    const premiere = resultat!.lignes[0];
    expect(premiere.numeroImmo).toBe('20113');
    expect(premiere.designation).toBe('MOULE 25.088 ARGO');
    expect(premiere.montant).toBeCloseTo(34001, 3);
    expect(premiere.categorie).toBe('Metals / Metal Products');
    expect(premiere.categorieAbsente).toBe(false);

    // Le code alphanumérique est conservé tel quel.
    expect(resultat!.lignes[2].numeroImmo).toBe('IME-00851');
  });

  it('rattrape les #N/A sans jamais écarter la ligne', () => {
    const resultat = lireClasseurImmobilisations(classeurDe(EXTRACTION))!;

    const convoyeur = resultat.lignes.find(l => l.numeroImmo === '22010')!;
    expect(convoyeur.categorieTexte).toBe('#N/A');
    expect(convoyeur.categorie).toBe(CATEGORIE_REPLI);
    expect(convoyeur.categorieAbsente).toBe(true);
    expect(convoyeur.defautsAppliques).toContain('catégorie carbone');
    // Le montant, lui, reste intégralement pris en compte.
    expect(convoyeur.montant).toBe(60000);

    // Une cellule vide subit exactement le même sort.
    const palettiseur = resultat.lignes.find(l => l.numeroImmo === '22011')!;
    expect(palettiseur.categorie).toBe(CATEGORIE_REPLI);

    expect(resultat.repliesNA).toBe(2);
  });

  it('valorise l\'extraction complète avec les replis ADEME', () => {
    const lignes = lireClasseurImmobilisations(classeurDe(EXTRACTION))!.lignes;

    const emissions = lignes.map(ligne => {
      const facteur = retenirFacteurCapex([], { categorie: ligne.categorie, devise: 'TND' });
      return calculerEmissionCapex(ligne.montant, facteur.valeur);
    });

    // 34 001×0,380 + 12 500×0,420 + 8 000×0,390 + 4 200×0,310 + 60 000×0,250
    // + 15 000×0,250 = 12 920,38 + 5 250 + 3 120 + 1 302 + 15 000 + 3 750
    expect(emissions[0]).toBeCloseTo(12920.38, 2);
    expect(emissions[4]).toBeCloseTo(15000, 2);

    const total = emissions.reduce((s, e) => s + e, 0);
    expect(total).toBeCloseTo(41342.38, 2);
    expect(enTonnes(total)).toBeCloseTo(41.34238, 5);

    // Quatre lignes sur six sont appariées à une famille documentée.
    expect(tauxCouverture(lignes.map(l => l.categorie))).toBeCloseTo(66.667, 2);
  });

  it('engendre un numéro quand la colonne du code est absente', () => {
    const resultat = lireFeuilleImmobilisations(
      XLSX.utils.aoa_to_sheet([
        ['Désignation', 'Acquisitions', 'Catégorie Carbone'],
        ['PRESSE HYDRAULIQUE', 21000, 'Metals']
      ]),
      'Sans code'
    )!;

    expect(resultat.colonnesManquantes).toEqual([]);
    expect(resultat.lignes[0].numeroImmo).toBe('IMM-00001');
    expect(resultat.lignes[0].defautsAppliques).toContain('n° d\'immobilisation');
  });
});
