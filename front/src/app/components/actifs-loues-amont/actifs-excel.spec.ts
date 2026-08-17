import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurActifs
} from './actifs-excel';
import {
  reconnaitreTypeActif, reconnaitreModeSaisie, modeDepuisUnite, normaliserUnite,
  retenirFacteurActif, quantiteAjustee, uniteAjustee, calculerEmissionActif,
  classeBadgeActif, emojiActif, KWH_PAR_M2_AN, KGCO2E_PAR_M2_AN
} from './actifs-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Classeur synthétique au format de la matrice maître. */
function classeurActifs(enTetes: string[], lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Actifs');
  return classeur;
}

const EN_TETES_COMPLETS = [
  'Référence', 'Désignation Actif', 'Type d\'Actif', 'Établissement',
  'Mode Calcul', 'Quantité', 'Unité', 'Période', 'Ratio Occupation'
];

describe('Types d\'actifs et modes de saisie', () => {

  it('reconnaît les types depuis un libellé libre', () => {
    expect(reconnaitreTypeActif('Bâtiment')).toBe('Bâtiment');
    expect(reconnaitreTypeActif('bureau siège')).toBe('Bâtiment');
    expect(reconnaitreTypeActif('Véhicule Leasing')).toBe('Véhicule Leasing');
    expect(reconnaitreTypeActif('Informatique')).toBe('Informatique');
    expect(reconnaitreTypeActif('serveur cloud')).toBe('Informatique');
    expect(reconnaitreTypeActif('Équipement Industrial')).toBe('Équipement Industriel');
    expect(reconnaitreTypeActif('', 'Bâtiment')).toBe('Bâtiment');
    expect(reconnaitreTypeActif('objet non identifié')).toBeNull();
  });

  it('associe à chaque type sa pastille et son emoji', () => {
    expect(classeBadgeActif('Bâtiment')).toBe('actif-batiment');
    expect(classeBadgeActif('Véhicule Leasing')).toBe('actif-vehicule');
    expect(classeBadgeActif('Informatique')).toBe('actif-informatique');
    expect(classeBadgeActif('Équipement Industriel')).toBe('actif-equipement');
    expect(emojiActif('Bâtiment')).toBe('🏢');
  });

  it('déduit le mode de saisie du libellé ou, à défaut, de l\'unité', () => {
    expect(reconnaitreModeSaisie('Surface en m²')).toBe('Surface');
    expect(reconnaitreModeSaisie('Monétaire')).toBe('Monétaire');
    expect(reconnaitreModeSaisie('Consommation directe')).toBe('Consommation');

    expect(modeDepuisUnite('m²')).toBe('Surface');
    expect(modeDepuisUnite('TND')).toBe('Monétaire');
    expect(modeDepuisUnite('kWh')).toBe('Consommation');
    expect(modeDepuisUnite('km')).toBe('Consommation');
  });

  it('ramène les unités à leur forme canonique', () => {
    expect(normaliserUnite('kwh')).toBe('kWh');
    expect(normaliserUnite('m2')).toBe('m²');
    expect(normaliserUnite('litres')).toBe('Litres');
    expect(normaliserUnite('dt')).toBe('TND');
  });
});

describe('Formules de quantité ajustée', () => {

  it('applique le taux d\'occupation à une consommation directe', () => {
    expect(quantiteAjustee({ mode: 'Consommation', quantite: 10000, ratioOccupation: 100 })).toBe(10000);
    expect(quantiteAjustee({ mode: 'Consommation', quantite: 10000, ratioOccupation: 60 })).toBe(6000);
    // Un ratio absent vaut imputation totale.
    expect(quantiteAjustee({ mode: 'Consommation', quantite: 10000, ratioOccupation: null })).toBe(10000);
    expect(quantiteAjustee({ mode: 'Consommation', quantite: null, ratioOccupation: 100 })).toBeNull();
  });

  it('convertit une surface en consommation annuelle', () => {
    // 300 m² × 120 kWh/m²/an × 100 % = 36 000 kWh/an
    expect(quantiteAjustee({ mode: 'Surface', quantite: 300, ratioOccupation: 100 })).toBe(36000);
    // La moitié du plateau loué n'impute que la moitié des kWh.
    expect(quantiteAjustee({ mode: 'Surface', quantite: 300, ratioOccupation: 50 })).toBe(18000);
    expect(uniteAjustee('Surface', 'm²')).toBe('kWh');
    expect(uniteAjustee('Consommation', 'kwh')).toBe('kWh');
    expect(KWH_PAR_M2_AN).toBe(120);
  });

  it('valorise la quantité ajustée par le facteur retenu', () => {
    // 36 000 kWh × 0,420 = 15 120,00 kgCO₂e
    expect(calculerEmissionActif(36000, 0.420)).toBeCloseTo(15120, 2);
    expect(calculerEmissionActif(null, 0.420)).toBe(0);
    expect(calculerEmissionActif(36000, null)).toBe(0);
    // Contrôle de cohérence : 50,40 kgCO₂e par m² et par an.
    expect(KGCO2E_PAR_M2_AN).toBeCloseTo(50.4, 6);
    expect(calculerEmissionActif(300, KGCO2E_PAR_M2_AN)).toBeCloseTo(15120, 2);
  });
});

describe('Facteurs : référentiel MS SQL puis repli ADEME', () => {

  const FACTEUR_BDD: FacteurDetaille[] = [{
    id: 1, referenceCode: 'MS3C8UL', typeName: 'Leased building electricity',
    categoryName: 'Category 8: Upstream leased assets', scopeCode: 'SCOPE_3',
    factorValue: 0.398, unit: 'kWh', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  }];

  it('applique les replis ADEME quand la base est vide', () => {
    const electricite = retenirFacteurActif([], { type: 'Bâtiment', unite: 'kWh' });
    expect(electricite.origine).toBe('ADEME');
    expect(electricite.valeur).toBe(0.420);

    const gaz = retenirFacteurActif([], { type: 'Bâtiment', unite: 'kWh', energie: 'Gaz' });
    expect(gaz.valeur).toBe(0.227);

    // Une surface se valorise en kWh : le facteur porte l'énergie, pas le m².
    const surface = retenirFacteurActif([], { type: 'Bâtiment', unite: 'm²' });
    expect(surface.valeur).toBe(0.420);
    expect(surface.unite).toBe('kWh');
    expect(surface.libelle).toContain('120 kWh/m²/an');

    expect(retenirFacteurActif([], { type: 'Véhicule Leasing', unite: 'km' }).valeur).toBe(0.192);
    expect(retenirFacteurActif([], { type: 'Informatique', unite: 'TND' }).valeur).toBe(0.250);
    expect(retenirFacteurActif([], { type: 'Équipement Industriel', unite: 'TND' }).valeur).toBe(0.310);
  });

  it('préfère le référentiel MS SQL au repli quand il documente le type', () => {
    const retenu = retenirFacteurActif(FACTEUR_BDD, { type: 'Bâtiment', unite: 'kWh' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.398);
    expect(retenu.baseAppliquee).toBe('DESNZ 2024');
    expect(retenu.reference).toBe('MS3C8UL');
  });

  it('n\'invente aucun facteur pour une combinaison non couverte', () => {
    // Les litres de carburant d'un véhicule loué ne sont pas documentés.
    expect(retenirFacteurActif([], { type: 'Véhicule Leasing', unite: 'Litres' }).origine).toBe('Aucun');
    expect(retenirFacteurActif([], { type: 'Informatique', unite: 'kWh' }).origine).toBe('Aucun');
  });
});

describe('Parser de la matrice maître', () => {

  it('reconnaît les en-têtes et tous leurs alias', () => {
    const carte = mapperColonnes(['Code', 'Bien', 'Catégorie', 'Site', 'Approche',
                                  'Valeur', 'UOM', 'Année', '% Occupation']);
    expect(carte['reference']).toBe(0);
    expect(carte['designation']).toBe(1);
    expect(carte['typeActif']).toBe(2);
    expect(carte['etablissement']).toBe(3);
    expect(carte['modeSaisie']).toBe(4);
    expect(carte['quantite']).toBe(5);
    expect(carte['unite']).toBe(6);
    expect(carte['periode']).toBe(7);
    expect(carte['ratio']).toBe(8);
  });

  it('ne confond pas « Type d\'Actif » et « Type Saisie »', () => {
    const carte = mapperColonnes(['Désignation', 'Type d\'Actif', 'Type Saisie', 'Quantité', 'Unité']);
    expect(carte['typeActif']).toBe(1);
    expect(carte['modeSaisie']).toBe(2);
    expect(detecterLigneEnTete([['Désignation', 'Type d\'Actif', 'Quantité', 'Unité']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['Référence', 'Site'])))
      .toEqual(['Désignation Actif', 'Type d\'Actif', 'Quantité / Valeur', 'Unité']);
    expect(colonnesManquantes(mapperColonnes(EN_TETES_COMPLETS))).toEqual([]);
  });

  it('applique les valeurs par défaut sur les colonnes optionnelles', () => {
    const resultat = lireClasseurActifs(classeurActifs(
      ['Désignation Actif', 'Type d\'Actif', 'Quantité', 'Unité'],
      [['Plateau bureaux Tunis', 'Bâtiment', 300, 'm²']]
    ))!;

    expect(resultat.lignes.length).toBe(1);
    const ligne = resultat.lignes[0];

    // Référence engendrée, établissement, mode, période et ratio par défaut.
    expect(ligne.reference).toBe('ACT-0001');
    expect(ligne.etablissement).toBe('Site principal');
    expect(ligne.modeSaisie).toBe('Surface');
    expect(ligne.ratioOccupation).toBe(100);
    expect(ligne.periode).toBe(String(new Date().getFullYear()));
    expect(ligne.quantiteAjustee).toBe(36000);
    expect(ligne.defautsAppliques).toContain('référence');
    expect(ligne.defautsAppliques).toContain('ratio d\'occupation');
  });

  it('lit les valeurs renseignées plutôt que les défauts', () => {
    const resultat = lireClasseurActifs(classeurActifs(EN_TETES_COMPLETS, [
      ['ACT-100', 'Entrepôt loué', 'Bâtiment', 'MISFAT 1', 'Surface en m²', '1 200,5', 'm2', '2025', 60],
      ['ACT-101', 'Flotte commerciale', 'Véhicule Leasing', 'MISFAT 1', 'Consommation', 45000, 'km', '2025', 100],
      ['ACT-102', 'Serveurs cloud', 'Informatique', 'MISFAT 1', 'Monétaire', 18000, 'TND', '2025', 100]
    ]))!;

    expect(resultat.lignes.length).toBe(3);

    const entrepot = resultat.lignes[0];
    expect(entrepot.reference).toBe('ACT-100');
    expect(entrepot.etablissement).toBe('MISFAT 1');
    expect(entrepot.modeSaisie).toBe('Surface');
    expect(entrepot.unite).toBe('m²');
    expect(entrepot.quantite).toBeCloseTo(1200.5, 3);
    expect(entrepot.ratioOccupation).toBe(60);
    // 1 200,5 × 120 × 60 % = 86 436 kWh
    expect(entrepot.quantiteAjustee).toBeCloseTo(86436, 2);
    expect(entrepot.defautsAppliques).toEqual([]);

    expect(resultat.lignes[1].typeActif).toBe('Véhicule Leasing');
    expect(resultat.lignes[1].quantiteAjustee).toBe(45000);
    expect(resultat.lignes[2].modeSaisie).toBe('Monétaire');
  });

  it('écarte les lignes de total et les quantités illisibles', () => {
    const resultat = lireClasseurActifs(classeurActifs(
      ['Désignation Actif', 'Type d\'Actif', 'Quantité', 'Unité'],
      [
        ['Plateau bureaux', 'Bâtiment', 300, 'm²'],
        ['Machine louée', 'Équipement Industrial', '#N/A', 'TND'],
        [null, null, 99999, null]
      ]
    ))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /quantité/.test(r.motif))).toBe(true);
  });

  it('valorise une matrice complète avec les replis ADEME', () => {
    const resultat = lireClasseurActifs(classeurActifs(EN_TETES_COMPLETS, [
      ['', 'Plateau bureaux', 'Bâtiment', '', 'Surface en m²', 300, 'm²', '2025', 100],
      ['', 'Flotte', 'Véhicule Leasing', '', 'Consommation', 45000, 'km', '2025', 100]
    ]))!;

    const valorisees = resultat.lignes.map(ligne => {
      const facteur = retenirFacteurActif([], {
        type: ligne.typeActif!, unite: ligne.unite
      });
      return {
        designation: ligne.designation,
        origine: facteur.origine,
        baseAppliquee: facteur.baseAppliquee,
        emission: calculerEmissionActif(ligne.quantiteAjustee, facteur.valeur)
      };
    });

    // 300 m² → 36 000 kWh × 0,420 = 15 120 kgCO₂e
    expect(valorisees[0].emission).toBeCloseTo(15120, 2);
    expect(valorisees[0].origine).toBe('ADEME');
    expect(valorisees[0].baseAppliquee).toBe('ADEME (repli)');

    // 45 000 km × 0,192 = 8 640 kgCO₂e
    expect(valorisees[1].emission).toBeCloseTo(8640, 2);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('1 200,5')).toBeCloseTo(1200.5, 3);
    expect(nombreTolerant('#N/A')).toBeNull();
    expect(nombreTolerant(300)).toBe(300);
  });
});
