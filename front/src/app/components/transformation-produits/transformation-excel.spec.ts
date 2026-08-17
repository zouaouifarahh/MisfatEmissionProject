import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurTransformation
} from './transformation-excel';
import {
  reconnaitreProcede, reconnaitreTypeSaisie, saisieDepuisUnite, normaliserUnite,
  enKilogrammes, retenirFacteurProcede, grandeurValorisee, uniteValorisee,
  calculerEmissionProcede, classeBadgeProcede, emojiProcede,
  REPLI_MONETAIRE, MASSE_PAR_UNITE
} from './transformation-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Classeur synthétique au format de la matrice maître. */
function classeurTransformation(enTetes: string[], lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Transformation');
  return classeur;
}

const EN_TETES = ['Référence', 'Nom Produit', 'Client', 'Type Transformation',
                  'Type Saisie', 'Quantité', 'Unité'];

describe('Procédés et approches', () => {

  it('reconnaît les procédés depuis un libellé libre', () => {
    expect(reconnaitreProcede('Assemblage')).toBe('Assemblage Mécanique');
    expect(reconnaitreProcede('Usinage')).toBe('Usinage / Découpe');
    expect(reconnaitreProcede('découpe laser')).toBe('Usinage / Découpe');
    expect(reconnaitreProcede('Moulage')).toBe('Moulage / Extrusion');
    expect(reconnaitreProcede('extrusion plastique')).toBe('Moulage / Extrusion');
    expect(reconnaitreProcede('Traitement thermique')).toBe('Traitement Thermique');
    expect(reconnaitreProcede('Produit Fini')).toBe('Produit Fini Direct');
    expect(reconnaitreProcede('procédé inconnu')).toBeNull();
  });

  it('ne ramène pas « produit fini assemblé » à un assemblage', () => {
    // Un produit fini ne subit précisément plus aucune transformation.
    expect(reconnaitreProcede('produit fini assemblé')).toBe('Produit Fini Direct');
  });

  it('associe à chaque procédé sa pastille et son emoji', () => {
    expect(classeBadgeProcede('Assemblage Mécanique')).toBe('procede-assemblage');
    expect(classeBadgeProcede('Traitement Thermique')).toBe('procede-thermique');
    expect(classeBadgeProcede('Usinage / Découpe')).toBe('procede-usinage');
    expect(classeBadgeProcede('Moulage / Extrusion')).toBe('procede-moulage');
    expect(classeBadgeProcede('Produit Fini Direct')).toBe('procede-fini');
    expect(emojiProcede('Traitement Thermique')).toBe('🔥');
  });

  it('déduit l\'approche du libellé ou, à défaut, de l\'unité', () => {
    expect(reconnaitreTypeSaisie('Monétaire')).toBe('Monétaire');
    expect(reconnaitreTypeSaisie('Énergétique')).toBe('Énergétique');
    expect(saisieDepuisUnite('TND')).toBe('Monétaire');
    expect(saisieDepuisUnite('kWh')).toBe('Énergétique');
    expect(saisieDepuisUnite('Tonnes')).toBe('Masse');
  });

  it('ramène les unités et les masses à leur forme canonique', () => {
    expect(normaliserUnite('t')).toBe('Tonnes');
    expect(normaliserUnite('pcs')).toBe('Unités');
    expect(normaliserUnite('dt')).toBe('TND');

    // Confondre tonnes et kilogrammes fausserait d'un facteur mille.
    expect(enKilogrammes(5, 'Tonnes')).toBe(5000);
    expect(enKilogrammes(5000, 'kg')).toBe(5000);
    // Les pièces sont converties par la masse unitaire conventionnelle.
    expect(MASSE_PAR_UNITE).toBe(0.45);
    expect(enKilogrammes(10000, 'Unités')).toBe(4500);
    // Une devise n'a pas d'équivalent massique.
    expect(enKilogrammes(120, 'TND')).toBeNull();
  });
});

describe('Facteurs : référentiel MS SQL puis repli ADEME', () => {

  const FACTEUR_BDD: FacteurDetaille[] = [{
    id: 1, referenceCode: 'MS3C10PS', typeName: 'Machining, steel components',
    categoryName: 'Category 10: Processing of sold products', scopeCode: 'SCOPE_3',
    factorValue: 0.134, unit: 'kg', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  }];

  it('applique les replis ADEME par procédé quand la base est vide', () => {
    const assemblage = retenirFacteurProcede([], { procede: 'Assemblage Mécanique', unite: 'kg' });
    expect(assemblage.origine).toBe('ADEME');
    expect(assemblage.valeur).toBe(0.050);
    expect(assemblage.unite).toBe('kg');

    expect(retenirFacteurProcede([], { procede: 'Usinage / Découpe', unite: 'Tonnes' }).valeur).toBe(0.120);
    expect(retenirFacteurProcede([], { procede: 'Moulage / Extrusion', unite: 'kg' }).valeur).toBe(0.250);
  });

  it('valorise un produit fini à zéro, quelle que soit son unité', () => {
    const fini = retenirFacteurProcede([], { procede: 'Produit Fini Direct', unite: 'Unités' });
    expect(fini.origine).toBe('ADEME');
    expect(fini.valeur).toBe(0);
    expect(calculerEmissionProcede(50000, fini.valeur)).toBe(0);
  });

  it('applique le repli monétaire à la transformation facturée', () => {
    const monetaire = retenirFacteurProcede([], {
      procede: 'Usinage / Découpe', unite: 'TND', monetaire: true
    });
    expect(monetaire.valeur).toBe(REPLI_MONETAIRE);
    expect(monetaire.valeur).toBe(0.180);
  });

  it('couvre le traitement thermique et les comptages en pièces', () => {
    const thermique = retenirFacteurProcede([], { procede: 'Traitement Thermique', unite: 'kg' });
    expect(thermique.origine).toBe('ADEME');
    expect(thermique.valeur).toBe(0.380);

    // Un comptage en pièces est converti par la masse unitaire conventionnelle.
    const usinagePieces = retenirFacteurProcede([], { procede: 'Usinage / Découpe', unite: 'Unités' });
    expect(usinagePieces.origine).toBe('ADEME');
    expect(usinagePieces.valeur).toBe(0.120);
    expect(usinagePieces.unite).toBe('kg');
  });

  it('n\'invente aucun facteur physique pour une devise', () => {
    expect(retenirFacteurProcede([], { procede: 'Usinage / Découpe', unite: 'TND' }).origine)
      .toBe('Aucun');
  });

  it('préfère le facteur MS SQL au repli quand il documente le procédé', () => {
    const retenu = retenirFacteurProcede(FACTEUR_BDD, { procede: 'Usinage / Découpe', unite: 'kg' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.134);
    expect(retenu.baseAppliquee).toBe('DESNZ 2024');
  });
});

describe('Formule de valorisation', () => {

  it('ramène la masse au kilogramme avant valorisation', () => {
    const source = { procede: 'Usinage / Découpe' as const, quantite: 5, unite: 'Tonnes' };
    expect(grandeurValorisee(source)).toBe(5000);
    expect(uniteValorisee(source)).toBe('kg');

    // 5 000 kg × 0,120 = 600,00 kgCO₂e
    expect(calculerEmissionProcede(5000, 0.120)).toBeCloseTo(600, 2);
  });

  it('prend le montant tel quel en approche monétaire', () => {
    const source = { procede: 'Usinage / Découpe' as const, quantite: 12000, unite: 'TND', monetaire: true };
    expect(grandeurValorisee(source)).toBe(12000);
    expect(uniteValorisee(source)).toBe('TND');
    expect(calculerEmissionProcede(12000, 0.180)).toBeCloseTo(2160, 2);
  });
});

describe('Parser de la matrice maître', () => {

  it('reconnaît les en-têtes et tous leurs alias', () => {
    const carte = mapperColonnes(['Code Produit', 'Composant', 'Acheteur', 'Opération',
                                  'Approche', 'Masse (Tonnes)', 'Unité']);
    expect(carte['reference']).toBe(0);
    expect(carte['produit']).toBe(1);
    expect(carte['client']).toBe(2);
    expect(carte['procede']).toBe(3);
    expect(carte['typeSaisie']).toBe(4);
    expect(carte['quantite']).toBe(5);
    expect(carte['unite']).toBe(6);
  });

  it('ne confond pas « Type Saisie » et « Type Transformation »', () => {
    const carte = mapperColonnes(['Produit', 'Type Transformation', 'Type Saisie', 'Quantité', 'Unité']);
    expect(carte['procede']).toBe(1);
    expect(carte['typeSaisie']).toBe(2);
    expect(detecterLigneEnTete([['Produit', 'Type Transformation', 'Quantité', 'Unité']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['Référence', 'Client'])))
      .toEqual(['Nom Produit', 'Type Procédé', 'Quantité / Volume', 'Unité']);
    expect(colonnesManquantes(mapperColonnes(EN_TETES))).toEqual([]);
  });

  it('applique les valeurs par défaut et convertit les masses', () => {
    const resultat = lireClasseurTransformation(classeurTransformation(
      ['Nom Produit', 'Type Transformation', 'Quantité', 'Unité'],
      [['Composants métalliques', 'Usinage', 5, 'Tonnes']]
    ))!;

    expect(resultat.lignes.length).toBe(1);
    const ligne = resultat.lignes[0];

    expect(ligne.reference).toBe('TRF-0001');
    expect(ligne.procede).toBe('Usinage / Découpe');
    expect(ligne.typeSaisie).toBe('Masse');
    expect(ligne.grandeur).toBe(5000);
    expect(ligne.uniteGrandeur).toBe('kg');
    expect(ligne.defautsAppliques).toContain('référence');
    expect(ligne.defautsAppliques).toContain('type de saisie');
  });

  it('écarte les lignes de total et les quantités illisibles', () => {
    const resultat = lireClasseurTransformation(classeurTransformation(EN_TETES, [
      ['', 'Composants métalliques', 'MECAFILTER', 'Usinage', '', 5, 'Tonnes'],
      ['', 'Boîtiers plastiques', 'MECAFILTER', 'Moulage', '', '#N/A', 'kg'],
      ['', '', '', '', '', 99999, '']
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /quantité/.test(r.motif))).toBe(true);
  });

  it('valorise une matrice complète avec les replis ADEME', () => {
    const resultat = lireClasseurTransformation(classeurTransformation(EN_TETES, [
      ['P-1', 'Composants métalliques', 'MECAFILTER', 'Usinage', 'Masse', 5000, 'kg'],
      ['P-2', 'Boîtiers plastiques', 'MECAFILTER', 'Moulage', 'Masse', 2, 'Tonnes'],
      ['P-3', 'Filtres prêts au montage', 'FORD', 'Produit Fini', 'Masse', 50000, 'Unités'],
      ['P-4', 'Prestation découpe', 'FORD', 'Usinage', 'Monétaire', 12000, 'TND']
    ]))!;

    const valorisees = resultat.lignes.map(ligne => {
      const facteur = retenirFacteurProcede([], {
        procede: ligne.procede!, unite: ligne.unite, monetaire: ligne.typeSaisie === 'Monétaire'
      });
      return {
        reference: ligne.reference,
        origine: facteur.origine,
        emission: calculerEmissionProcede(ligne.grandeur, facteur.valeur)
      };
    });

    // 5 000 kg × 0,120 = 600 kgCO₂e
    expect(valorisees[0].emission).toBeCloseTo(600, 2);
    // 2 t → 2 000 kg × 0,250 = 500 kgCO₂e
    expect(valorisees[1].emission).toBeCloseTo(500, 2);
    // Un produit fini ne subit aucune transformation, même compté en pièces.
    expect(valorisees[2].emission).toBe(0);
    // 12 000 TND × 0,180 = 2 160 kgCO₂e
    expect(valorisees[3].emission).toBeCloseTo(2160, 2);

    expect(valorisees.every(v => v.origine === 'ADEME')).toBe(true);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('1 250,75')).toBeCloseTo(1250.75, 3);
    expect(nombreTolerant('#N/A')).toBeNull();
    expect(nombreTolerant(5000)).toBe(5000);
  });
});
