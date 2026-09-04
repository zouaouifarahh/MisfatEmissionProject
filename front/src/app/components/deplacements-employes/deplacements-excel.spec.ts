import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, detecterLigneEnTete, mapperColonnes,
  colonnesManquantes, lireClasseurDeplacements
} from './deplacements-excel';
import {
  reconnaitreMode, retenirFacteur, kilometrageAnnuel, calculerEmission,
  classeBadgeMode, emojiMode, JOURS_TRAVAILLES_DEFAUT
} from '../../shared/mobilite/modes-transport';
import { FacteurDetaille } from '../../services/referential.service';

const DOSSIER = 'D:/Users/Public/FilesEmp_Cabone/Files';

/** Facteurs de la catégorie 7, tels que présents en base MisfatDB. */
const FACTEURS_BDD: FacteurDetaille[] = [
  {
    id: 1, referenceCode: 'MS3C7ECAGC', typeName: 'Average gasoline cars',
    categoryName: 'Category 7: Employee Commuting', scopeCode: 'SCOPE_3',
    factorValue: 0.2650910823, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  },
  {
    id: 2, referenceCode: 'MS3C7ECT', typeName: 'Average taxi',
    categoryName: 'Category 7: Employee Commuting', scopeCode: 'SCOPE_3',
    factorValue: 0.2913970039, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'EPA 2024', referenceYear: 2024, validityLabel: null
  },
  {
    id: 3, referenceCode: 'MS3C7ECC', typeName: 'Coach',
    categoryName: 'Category 7: Employee Commuting', scopeCode: 'SCOPE_3',
    factorValue: 0.0332522207, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  },
  {
    id: 4, referenceCode: 'MS3C7ECM', typeName: 'Motorbike',
    categoryName: 'Category 7: Employee Commuting', scopeCode: 'SCOPE_3',
    factorValue: 0.1501877441, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'EPA 2024', referenceYear: 2024, validityLabel: null
  }
];

const classeursDisponibles = fs.existsSync(DOSSIER);

function lireFichier(chemin: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellDates: true });
}

/** Classeur synthétique au format de la matrice A. */
function classeurDeplacements(lignes: unknown[][]): XLSX.WorkBook {
  const feuille = XLSX.utils.aoa_to_sheet([
    ['Matricule', 'Nom &  Prénom ', 'Adresse Domicile ', 'Moyen de transport ', 'Distance (KM)'],
    ...lignes
  ]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Feuil2');
  return classeur;
}

describe('Reconnaissance des modes de transport', () => {

  it('reconnaît les libellés du relevé, y compris la coquille « Tain »', () => {
    expect(reconnaitreMode('Voiture')).toBe('Voiture');
    expect(reconnaitreMode('Bus')).toBe('Bus');
    expect(reconnaitreMode('Tain ')).toBe('Train');
    expect(reconnaitreMode('motocyclette')).toBe('Motocyclette');
    expect(reconnaitreMode('Bicyclette')).toBe('Bicyclette');
    expect(reconnaitreMode('A pied ')).toBe('À pied');
  });

  it('ne ramène pas « voiture de location » à « voiture »', () => {
    expect(reconnaitreMode('Voiture de location')).toBe('Voiture de location');
    expect(reconnaitreMode('voiture personnelle')).toBe('Voiture');
  });

  it('applique le défaut quand le libellé est vide ou inconnu', () => {
    expect(reconnaitreMode('', 'Voiture')).toBe('Voiture');
    expect(reconnaitreMode('téléportation')).toBeNull();
  });

  it('associe à chaque mode sa pastille et son emoji', () => {
    expect(classeBadgeMode('Avion')).toBe('mode-avion');
    expect(classeBadgeMode('Voiture')).toBe('mode-voiture');
    expect(classeBadgeMode('Bus')).toBe('mode-bus');
    expect(classeBadgeMode('Train')).toBe('mode-train');
    expect(classeBadgeMode('Motocyclette')).toBe('mode-moto');
    expect(classeBadgeMode('Bicyclette')).toBe('mode-doux');
    expect(classeBadgeMode('À pied')).toBe('mode-doux');
    expect(emojiMode('Avion')).toBe('✈️');
  });
});

describe('Facteurs : référentiel MS SQL puis repli', () => {

  it('retient le facteur MS SQL quand il documente le mode', () => {
    const voiture = retenirFacteur(FACTEURS_BDD, 'Voiture');
    expect(voiture.origine).toBe('MS SQL');
    expect(voiture.reference).toBe('MS3C7ECAGC');
    expect(voiture.valeur).toBeCloseTo(0.2650910823, 8);
    expect(voiture.baseAppliquee).toBe('DESNZ 2024');

    const moto = retenirFacteur(FACTEURS_BDD, 'Motocyclette');
    expect(moto.reference).toBe('MS3C7ECM');

    // L'autocar retient son propre facteur, et lui seul.
    const coach = retenirFacteur(FACTEURS_BDD, 'Coach');
    expect(coach.origine).toBe('MS SQL');
    expect(coach.reference).toBe('MS3C7ECC');
    expect(coach.valeur).toBeCloseTo(0.0332522207, 8);

    // Le bus urbain, lui, n'est pas documenté par cette base : il retombe sur
    // son repli. Il empruntait auparavant « Coach » — sa signature captait le
    // mot —, et un trajet en bus de ville était donc valorisé au facteur d'un
    // autocar, huit fois moindre.
    const bus = retenirFacteur(FACTEURS_BDD, 'Bus');
    expect(bus.origine).toBe('Repli ADEME');
    expect(bus.valeur).toBe(0.103);
  });

  it('bascule sur le repli ADEME quand la base est vide ou partielle', () => {
    // Base vide : tous les modes documentés par un repli restent valorisés.
    const voiture = retenirFacteur([], 'Voiture');
    expect(voiture.origine).toBe('Repli ADEME');
    expect(voiture.valeur).toBe(0.192);
    expect(voiture.baseAppliquee).toContain('repli');

    expect(retenirFacteur([], 'Bus').valeur).toBe(0.103);
    expect(retenirFacteur([], 'Motocyclette').valeur).toBe(0.091);
    expect(retenirFacteur([], 'Train').valeur).toBe(0.025);
    expect(retenirFacteur([], 'Bicyclette').valeur).toBe(0);
    expect(retenirFacteur([], 'À pied').valeur).toBe(0);

    // Base partielle : le train n'y figure pas, le repli prend le relais.
    const train = retenirFacteur(FACTEURS_BDD, 'Train');
    expect(train.origine).toBe('Repli ADEME');
    expect(train.valeur).toBe(0.025);
  });

  it('n\'invente aucun repli pour l\'avion ni l\'hôtel', () => {
    // L'aérien dépend du segment et l'hôtel se compte à la nuitée : aucun
    // facteur kilométrique de repli ne serait défendable.
    expect(retenirFacteur([], 'Avion').origine).toBe('Aucun');
    expect(retenirFacteur([], 'Hôtel').origine).toBe('Aucun');
  });

  it('affine le facteur avec la motorisation quand elle est connue', () => {
    const facteurs: FacteurDetaille[] = [
      { ...FACTEURS_BDD[0], id: 10, typeName: 'Average car, diesel' },
      { ...FACTEURS_BDD[0], id: 11, typeName: 'Average car, petrol' }
    ];
    expect(retenirFacteur(facteurs, 'Voiture', 'diesel').id).toBe(10);
    expect(retenirFacteur(facteurs, 'Voiture', 'petrol').id).toBe(11);
  });
});

describe('Formule du kilométrage annuel', () => {

  it('compte l\'aller-retour sur les jours travaillés', () => {
    // 15 km × 2 × 220 jours = 6 600 km/an
    expect(kilometrageAnnuel(15, 220, 1)).toBe(6600);
    // Deux occupants partagent le trajet.
    expect(kilometrageAnnuel(15, 220, 2)).toBe(3300);
    expect(kilometrageAnnuel(null, 220, 1)).toBeNull();
    expect(kilometrageAnnuel(15, 0, 1)).toBeNull();
    // Un taux d'occupation absurde ne divise pas par zéro.
    expect(kilometrageAnnuel(15, 220, 0)).toBe(6600);
  });

  it('valorise le kilométrage par le facteur retenu', () => {
    // 6 600 km × 0,192 = 1 267,20 kgCO₂e
    expect(calculerEmission(6600, 0.192)).toBeCloseTo(1267.2, 2);
    expect(calculerEmission(null, 0.192)).toBe(0);
    expect(calculerEmission(6600, null)).toBe(0);
  });
});

describe('Parser de la matrice A', () => {

  it('reconnaît les en-têtes et leurs alias', () => {
    const carte = mapperColonnes(['ID', 'Employé', 'Site', 'Mode', 'Km', 'Jours/An', 'Covoiturage']);
    expect(carte['matricule']).toBe(0);
    expect(carte['employe']).toBe(1);
    expect(carte['etablissement']).toBe(2);
    expect(carte['mode']).toBe(3);
    expect(carte['distance']).toBe(4);
    expect(carte['jours']).toBe(5);
    expect(carte['covoiturage']).toBe(6);
  });

  it('ne confond pas « Distance Aller » et « Distance »', () => {
    const carte = mapperColonnes(['Matricule', 'Nom', 'Transport', 'Distance Aller']);
    expect(carte['distance']).toBe(3);
    expect(detecterLigneEnTete([['Matricule', 'Nom', 'Transport', 'Distance Aller']])).toBe(0);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    expect(colonnesManquantes(mapperColonnes(['Matricule', 'Nom'])))
      .toEqual(['Moyen de transport', 'Distance (KM)']);
    expect(colonnesManquantes(mapperColonnes(['Matricule', 'Nom', 'Mode', 'Km']))).toEqual([]);
  });

  it('applique les valeurs par défaut sur les colonnes optionnelles absentes', () => {
    const resultat = lireClasseurDeplacements(classeurDeplacements([
      ['M001', 'AHMED BEN ALI', 'Bizerte', 'Voiture', 15]
    ]))!;

    expect(resultat.colonnesManquantes).toEqual([]);
    expect(resultat.lignes.length).toBe(1);

    const ligne = resultat.lignes[0];
    expect(ligne.etablissement).toBe('Site principal');
    expect(ligne.joursTravailles).toBe(JOURS_TRAVAILLES_DEFAUT);
    expect(ligne.covoiturage).toBe(1);
    expect(ligne.mode).toBe('Voiture');
    // 15 km aller × 2 × jours travaillés, seul occupant. La constante est lue
    // plutôt que recopiée : un chiffre en dur ferait échouer ce banc au
    // prochain arbitrage sur les jours travaillés, sans rien apprendre.
    expect(ligne.kmAnnuels).toBe(15 * 2 * JOURS_TRAVAILLES_DEFAUT);
    expect(ligne.defautsAppliques).toContain('établissement');
    expect(ligne.defautsAppliques).toContain('jours travaillés');
    expect(ligne.defautsAppliques).toContain('taux d\'occupation');
  });

  it('écarte les lignes de total et les distances illisibles', () => {
    const resultat = lireClasseurDeplacements(classeurDeplacements([
      ['M001', 'AHMED BEN ALI', 'Bizerte', 'Voiture', 15],
      ['M002', 'SALMA MILADI', 'Tunis', 'Bus', '#N/A'],
      [null, null, null, null, 1250]
    ]))!;

    expect(resultat.lignes.length).toBe(1);
    expect(resultat.rejets.length).toBe(2);
    expect(resultat.rejets.some(r => /total/.test(r.motif))).toBe(true);
    expect(resultat.rejets.some(r => /distance/.test(r.motif))).toBe(true);
  });

  it('lit les valeurs renseignées plutôt que les défauts', () => {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Matricule', 'Nom & Prénom', 'Établissement', 'Moyen de transport',
       'Motorisation', 'Distance Aller', 'Jours Travaillés', 'Taux d\'occupation'],
      ['M010', 'RIADH BEN AYED', 'MISFAT 1', 'Voiture', 'Diesel', '12,5', 200, 2]
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Feuil1');

    const ligne = lireClasseurDeplacements(classeur)!.lignes[0];
    expect(ligne.etablissement).toBe('MISFAT 1');
    expect(ligne.motorisation).toBe('Diesel');
    expect(ligne.distanceAllerKm).toBeCloseTo(12.5, 3);
    expect(ligne.joursTravailles).toBe(200);
    expect(ligne.covoiturage).toBe(2);
    // 12,5 × 2 × 200 ÷ 2 = 2 500 km/an
    expect(ligne.kmAnnuels).toBe(2500);
    expect(ligne.defautsAppliques).toEqual([]);
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant('12,5')).toBeCloseTo(12.5, 3);
    expect(nombreTolerant('1 250')).toBe(1250);
    expect(nombreTolerant('#N/A')).toBeNull();
  });
});

describe.skipIf(!classeursDisponibles)('Classeur de production', () => {

  it('refuse proprement le gabarit vide des déplacements employés', () => {
    const fichier = fs.readdirSync(DOSSIER)
      .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
      .map(f => path.join(DOSSIER, f))
      .find(f => /deplacement employes/i.test(
        path.basename(f).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      ));
    expect(fichier).toBeTruthy();

    const resultat = lireClasseurDeplacements(lireFichier(fichier!));
    expect(resultat).toBeTruthy();

    // Le classeur de production ne porte que ses en-têtes : aucune ligne à
    // importer, mais la lecture aboutit sans exception.
    expect(resultat!.lignes.length).toBe(0);
    expect(resultat!.colonnesReconnues).toContain('matricule');
    expect(resultat!.colonnesReconnues).toContain('employe');
  });
});
