import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurAval
} from './aval-excel';
import {
  reconnaitreModeFret, reconnaitreTypeSaisie, retenirFacteurFret,
  tonnesKilometres, enTonnes, calculerEmissionFret,
  classeBadgeFret, emojiFret, REPLI_MONETAIRE
} from './aval-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Classeur synthétique au format de la matrice aval. */
function classeurAval(enTetes: string[], lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([enTetes, ...lignes]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Expeditions');
  return classeur;
}

/** Facteur de la catégorie 9, tel que présent en base MisfatDB. */
const FACTEURS_BDD: FacteurDetaille[] = [{
  id: 1, referenceCode: 'MS3C9SOFS', typeName: 'Ocean Freight, Spend',
  categoryName: 'Category 9: Shipping', scopeCode: 'SCOPE_3',
  factorValue: 0.0136313219, unit: 'TND', dataType: 'MONETAIRE', currency: 'TND',
  databaseSource: 'EPA-ORD 2024', referenceYear: 2024, validityLabel: null
}];

describe('Modes de fret et approches', () => {

  it('reconnaît les modes depuis un libellé libre', () => {
    expect(reconnaitreModeFret('Routier')).toBe('Routier');
    expect(reconnaitreModeFret('camion semi-remorque')).toBe('Routier');
    expect(reconnaitreModeFret('Maritime')).toBe('Maritime');
    expect(reconnaitreModeFret('porte-conteneurs')).toBe('Maritime');
    expect(reconnaitreModeFret('Aérien')).toBe('Aérien');
    expect(reconnaitreModeFret('Ferroviaire')).toBe('Ferroviaire');
    expect(reconnaitreModeFret('train de marchandises')).toBe('Ferroviaire');
    expect(reconnaitreModeFret('', 'Routier')).toBe('Routier');
    expect(reconnaitreModeFret('téléportation')).toBeNull();
  });

  it('associe à chaque mode sa pastille et son emoji', () => {
    expect(classeBadgeFret('Routier')).toBe('fret-routier');
    expect(classeBadgeFret('Maritime')).toBe('fret-maritime');
    expect(classeBadgeFret('Aérien')).toBe('fret-aerien');
    expect(classeBadgeFret('Ferroviaire')).toBe('fret-ferroviaire');
    expect(emojiFret('Maritime')).toBe('🚢');
  });

  it('reconnaît l\'approche de valorisation', () => {
    expect(reconnaitreTypeSaisie('Tonne.km')).toBe('Tonne.km');
    expect(reconnaitreTypeSaisie('Monétaire')).toBe('Monétaire');
    expect(reconnaitreTypeSaisie('Physique Direct')).toBe('Physique');
  });
});

describe('Formule des tonnes-kilomètres', () => {

  it('multiplie la masse par la distance', () => {
    // 12,5 tonnes × 400 km = 5 000 t.km
    expect(tonnesKilometres(12.5, 400)).toBe(5000);
    expect(tonnesKilometres(null, 400)).toBeNull();
    expect(tonnesKilometres(12.5, null)).toBeNull();
  });

  it('ramène les poids en tonnes selon leur unité', () => {
    // Confondre kilogrammes et tonnes fausserait d'un facteur mille.
    expect(enTonnes(12500, 'kg')).toBe(12.5);
    expect(enTonnes(12.5, 'tonnes')).toBe(12.5);
    expect(enTonnes(null, 'kg')).toBeNull();
  });

  it('valorise les tonnes-kilomètres par le facteur retenu', () => {
    // 5 000 t.km × 0,088 = 440,00 kgCO₂e
    expect(calculerEmissionFret(5000, 0.088)).toBeCloseTo(440, 2);
    expect(calculerEmissionFret(null, 0.088)).toBe(0);
    expect(calculerEmissionFret(5000, null)).toBe(0);
  });
});

describe('Facteurs : référentiel MS SQL puis repli ADEME', () => {

  it('applique les replis ADEME par mode quand la base est vide', () => {
    const routier = retenirFacteurFret([], { mode: 'Routier', monetaire: false });
    expect(routier.origine).toBe('ADEME');
    expect(routier.valeur).toBe(0.088);
    expect(routier.unite).toBe('Tonne.km');

    expect(retenirFacteurFret([], { mode: 'Maritime', monetaire: false }).valeur).toBe(0.016);
    expect(retenirFacteurFret([], { mode: 'Aérien', monetaire: false }).valeur).toBe(1.090);
    expect(retenirFacteurFret([], { mode: 'Ferroviaire', monetaire: false }).valeur).toBe(0.022);
  });

  it('applique le repli monétaire à défaut de facteur documenté', () => {
    const monetaire = retenirFacteurFret([], { mode: 'Routier', monetaire: true, devise: 'TND' });
    expect(monetaire.origine).toBe('ADEME');
    expect(monetaire.valeur).toBe(REPLI_MONETAIRE);
    expect(monetaire.valeur).toBe(0.350);
  });

  it('préfère le facteur MS SQL au repli quand il documente le mode', () => {
    // La base ne documente que le fret maritime valorisé au montant.
    const retenu = retenirFacteurFret(FACTEURS_BDD, {
      mode: 'Maritime', monetaire: true, devise: 'TND'
    });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBeCloseTo(0.0136313219, 8);
    expect(retenu.baseAppliquee).toBe('EPA-ORD 2024');
    expect(retenu.reference).toBe('MS3C9SOFS');

    // Le même mode en physique n'y figure pas : le repli prend le relais.
    const physique = retenirFacteurFret(FACTEURS_BDD, { mode: 'Maritime', monetaire: false });
    expect(physique.origine).toBe('ADEME');
    expect(physique.valeur).toBe(0.016);
  });

  it('n\'applique jamais un facteur maritime à un camion', () => {
    const routier = retenirFacteurFret(FACTEURS_BDD, {
      mode: 'Routier', monetaire: true, devise: 'TND'
    });
    expect(routier.origine).toBe('ADEME');
    expect(routier.reference).toBe('');
  });
});

describe('Parser de la matrice aval', () => {

  const EN_TETES = ['ID Expédition', 'Établissement', 'Destination', 'Mode Transport',
                    'Type Saisie', 'Poids (kg)', 'Distance (km)', 'Montant', 'Devise'];

  it('reconnaît les en-têtes et tous leurs alias', () => {
    const carte = mapperColonnes(['N° Lot', 'Site Départ', 'Client', 'Type Fret',
                                  'Approche', 'Poids (Tonnes)', 'Km Trajet', 'Coût Transport']);
    expect(carte['idExpedition']).toBe(0);
    expect(carte['etablissement']).toBe(1);
    expect(carte['destination']).toBe(2);
    expect(carte['mode']).toBe(3);
    expect(carte['typeSaisie']).toBe(4);
    expect(carte['poidsTonnes']).toBe(5);
    expect(carte['distance']).toBe(6);
    expect(carte['montant']).toBe(7);
  });

  it('distingue « Poids (kg) » de « Poids (Tonnes) »', () => {
    const carte = mapperColonnes(['Destination', 'Mode Transport', 'Poids (kg)', 'Distance (km)']);
    expect(carte['poidsKg']).toBe(2);
    expect(carte['poidsTonnes']).toBeUndefined();
    expect(detecterLigneEnTete([['Destination', 'Mode Transport', 'Poids (kg)', 'Distance']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['ID Expédition', 'Établissement'])))
      .toEqual(['Destination / Client', 'Mode de Transport', 'Poids, Tonne.km ou Montant']);
    expect(colonnesManquantes(mapperColonnes(EN_TETES))).toEqual([]);
  });

  it('calcule les tonnes-kilomètres depuis le poids en kilogrammes', () => {
    const resultat = lireClasseurAval(classeurAval(EN_TETES, [
      ['', '', 'FILTRATION GROUP GMBH', 'Routier', '', 12500, 400, '', '']
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    const ligne = resultat.lignes[0];

    // 12 500 kg → 12,5 t ; 12,5 t × 400 km = 5 000 t.km
    expect(ligne.poidsTonnes).toBe(12.5);
    expect(ligne.tonneKm).toBe(5000);
    expect(ligne.quantite).toBe(5000);
    expect(ligne.typeSaisie).toBe('Tonne.km');
    expect(ligne.mode).toBe('Routier');

    // Identifiant engendré, établissement et devise par défaut.
    expect(ligne.idExpedition).toBe('EXP-0001');
    expect(ligne.etablissement).toBe('Site principal');
    expect(ligne.devise).toBe('TND');
    expect(ligne.defautsAppliques).toContain('identifiant d\'expédition');
    expect(ligne.defautsAppliques).toContain('tonne.km calculé');
  });

  it('retient les tonnes-kilomètres du fichier quand elles y figurent', () => {
    const resultat = lireClasseurAval(classeurAval(
      ['ID Expédition', 'Destination', 'Mode Transport', 'Tonne.km'],
      [['EXP-77', 'Marseille', 'Maritime', 8400]]
    ))!;

    const ligne = resultat.lignes[0];
    expect(ligne.tonneKm).toBe(8400);
    expect(ligne.defautsAppliques).not.toContain('tonne.km calculé');
    expect(ligne.mode).toBe('Maritime');
  });

  it('bascule en monétaire quand seul un montant est disponible', () => {
    const resultat = lireClasseurAval(classeurAval(
      ['Destination', 'Mode Transport', 'Type Saisie', 'Montant', 'Devise'],
      [['Casablanca', 'Maritime', 'Monétaire', 15000, 'EUR']]
    ))!;

    const ligne = resultat.lignes[0];
    expect(ligne.typeSaisie).toBe('Monétaire');
    expect(ligne.quantite).toBe(15000);
    expect(ligne.devise).toBe('EUR');
  });

  it('écarte les lignes de total et les expéditions sans grandeur', () => {
    const resultat = lireClasseurAval(classeurAval(EN_TETES, [
      ['EXP-1', '', 'Lyon', 'Routier', '', 12500, 400, '', ''],
      ['EXP-2', '', 'Berlin', 'Aérien', '', '#N/A', '#N/A', '', ''],
      ['', '', '', '', '', 99999, '', '', '']
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /tonne\.km ni montant/.test(r.motif))).toBe(true);
  });

  it('valorise une matrice complète avec les replis ADEME', () => {
    const resultat = lireClasseurAval(classeurAval(EN_TETES, [
      ['EXP-1', 'MISFAT 1', 'Lyon', 'Routier', '', 12500, 400, '', ''],
      ['EXP-2', 'MISFAT 1', 'Shanghai', 'Maritime', '', 20000, 9000, '', ''],
      ['EXP-3', 'MISFAT 1', 'Francfort', 'Aérien', '', 500, 1800, '', '']
    ]))!;

    const valorisees = resultat.lignes.map(ligne => {
      const facteur = retenirFacteurFret([], {
        mode: ligne.mode!, monetaire: ligne.typeSaisie === 'Monétaire', devise: ligne.devise
      });
      return {
        id: ligne.idExpedition,
        tkm: ligne.tonneKm,
        origine: facteur.origine,
        emission: calculerEmissionFret(ligne.quantite, facteur.valeur)
      };
    });

    // 12,5 t × 400 km = 5 000 t.km × 0,088 = 440 kgCO₂e
    expect(valorisees[0].tkm).toBe(5000);
    expect(valorisees[0].emission).toBeCloseTo(440, 2);

    // 20 t × 9 000 km = 180 000 t.km × 0,016 = 2 880 kgCO₂e
    expect(valorisees[1].emission).toBeCloseTo(2880, 2);

    // 0,5 t × 1 800 km = 900 t.km × 1,090 = 981 kgCO₂e
    expect(valorisees[2].emission).toBeCloseTo(981, 2);

    expect(valorisees.every(v => v.origine === 'ADEME')).toBe(true);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('12 500,5')).toBeCloseTo(12500.5, 3);
    expect(nombreTolerant('#N/A')).toBeNull();
    expect(nombreTolerant(400)).toBe(400);
  });
});
