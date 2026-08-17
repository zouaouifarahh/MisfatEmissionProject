import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';

import { nettoyerNombre, valeurPrioritaire, COLONNES_VALEUR } from './nombre-comptable';
import { dispatcherLigne, estCategorieAbsente, REGLES } from './regles-dispatch';
import {
  detecterLigneEnTete, mapperIdentite, mapperValeurs,
  lireClasseurDispatch, lireFeuilleDispatch, totalPourEcran
} from './dispatch-excel';

/** Balance générale MISFAT, telle qu'elle est structurée en production. */
const BALANCE = [
  ['MainAccount', 'Nom', 'Solde d\'ouverture', 'Débit', 'Crédit', 'Solde cumulé',
   'Crédit - Devise de déclaration', 'Débit - Devise de déclaration',
   'Solde de fin - Devise de déclaration', 'Solde d\'ouverture - Devise de déclaration',
   'Catégorie Carbone '],
  ['601000', 'Achats Matières.Premières.Local', 0, 17822675.43, 502653.917, 17320021.513,
   148147.43, 5282906.3, 5134758.87, 0, 0],
  ['601110', 'Frais sur achats ( MCM )', 0, 6808791.587, 193556.69, 6615234.897,
   57172.73, 2016967.48, 1959794.75, 0, 'Deep Sea Freight Transportation'],
  ['602100', 'Achats matières combustibles Gasoil', 0, '1 209 099,633', 78096.59, 1131003.043,
   22941.65, 357306.8, 334365.15, 0, 0],
  ['606500', 'Matières consommables électrique', 0, 8242480.356, 0, 8242480.356,
   0, 2418000, 1189266.2, 0, 0],
  ['624000', 'Frêt et transport sur ventes', 0, 8185529.555, 0, 8185529.555,
   0, 2205069.74, 2205069.74, 0, 'Deep Sea Freight Transportation'],
  ['625100', 'Voyages et déplacements (autres)', 0, 1548239.658, 0, 1548239.658,
   0, 190947.934, 190947.934, 0, 'All Other Travel Arrangement and Reservation Services'],
  ['640100', 'Salaires et appointements', 0, 51037008.974, 0, 51037008.974,
   0, 12143138.21, 12143138.21, 0, 0]
];

const classeurDe = (matrice: unknown[][], nom = 'Sheet1'): XLSX.WorkBook => {
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(matrice), nom);
  return classeur;
};

describe('Nettoyage des nombres comptables', () => {

  it('lit les montants à espaces et virgule décimale', () => {
    // La forme exacte livrée par la balance générale.
    expect(nettoyerNombre('1 209 099,633')).toBeCloseTo(1209099.633, 3);
    expect(nettoyerNombre('1\u00A0209\u00A0099,633')).toBeCloseTo(1209099.633, 3);
    expect(nettoyerNombre('  17 822 675,43  ')).toBeCloseTo(17822675.43, 2);
    expect(nettoyerNombre(17822675.43)).toBeCloseTo(17822675.43, 2);
  });

  it('ne réduit pas un montant à points de milliers à ses trois premiers chiffres', () => {
    // Sans absorption des points surnuméraires, « 17.822.675,43 » vaudrait 17,82.
    expect(nettoyerNombre('17.822.675,43')).toBeCloseTo(17822675.43, 2);
    expect(nettoyerNombre('1,234.56')).toBeCloseTo(1234.56, 2);
  });

  it('distingue une absence de valeur d\'un zéro', () => {
    expect(nettoyerNombre('#N/A')).toBeNull();
    expect(nettoyerNombre('#VALEUR!')).toBeNull();
    expect(nettoyerNombre('')).toBeNull();
    expect(nettoyerNombre('-')).toBeNull();
    expect(nettoyerNombre(0)).toBe(0);
    expect(nettoyerNombre('(1 500,50)')).toBeCloseTo(-1500.5, 2);
  });

  it('descend la liste des colonnes tant que la valeur est nulle ou illisible', () => {
    const retenue = valeurPrioritaire({
      'Quantité': 0, 'Consommation': '#N/A', 'Débit': '1 209 099,633',
      'Solde de fin - Devise de déclaration': 334365.15
    });

    expect(retenue.valeur).toBeCloseTo(1209099.633, 3);
    expect(retenue.colonne).toBe('Débit');
    expect(retenue.colonnesEcartees).toEqual(['Quantité', 'Consommation']);
  });

  it('retient zéro quand toutes les colonnes candidates s\'y accordent', () => {
    // Un poste réellement nul ne doit pas disparaître du rapport.
    const retenue = valeurPrioritaire({ 'Débit': 0, 'Solde': '0' });
    expect(retenue.valeur).toBe(0);
    expect(retenue.colonne).toBe('Débit');
  });

  it('reconnaît « Solde de fin - Devise de déclaration » par son préfixe', () => {
    const retenue = valeurPrioritaire({ 'Solde de fin - Devise de déclaration': '5 134 758,87' });
    expect(retenue.valeur).toBeCloseTo(5134758.87, 2);
    expect(COLONNES_VALEUR).toContain('Débit');
  });
});

describe('Règles de ventilation', () => {

  it('tient le zéro de la balance pour une absence de catégorie', () => {
    // La balance MISFAT porte le nombre 0 dans « Catégorie Carbone ».
    expect(estCategorieAbsente(0)).toBe(true);
    expect(estCategorieAbsente('0')).toBe(true);
    expect(estCategorieAbsente('#N/A')).toBe(true);
    expect(estCategorieAbsente('')).toBe(true);
    expect(estCategorieAbsente('Metals')).toBe(false);
  });

  it('achemine chaque poste de la balance vers son écran', () => {
    const cas: [string, string, string | null][] = [
      ['602100', 'Achats matières combustibles Gasoil', 'combustion-etablissements'],
      ['606100', 'Achats non stockable mat combustibl', 'combustion-etablissements'],
      ['606500', 'Matières consommables électrique', 'electricite-achetee'],
      ['624000', 'Frêt et transport sur ventes', 'transport-aval'],
      ['601110', 'Frais sur achats ( MCM )', 'transport-amont'],
      ['624200', 'Frais divers de transport (autres)', 'transport-amont'],
      ['601000', 'Achats Matières.Premières.Local', 'biens-services'],
      ['602600', 'Achats emballages com Local', 'biens-services'],
      ['625100', 'Voyages et déplacements (autres)', 'voyages-affaires'],
      ['223600', 'Outillages d\'usine', 'investissements']
    ];

    for (const [compte, nom, attendu] of cas) {
      const resultat = dispatcherLigne({ mainAccount: compte, nom, categorieCarbone: 0 });
      expect(resultat.ecran, `${compte} ${nom}`).toBe(attendu);
    }
  });

  it('n\'envoie pas le fret sur ventes en amont', () => {
    // « transport » figure dans les deux règles : l'aval, plus spécifique,
    // doit être éprouvé le premier, sans quoi la catégorie 9 resterait vide.
    const aval = dispatcherLigne({ nom: 'Frêt et transport sur ventes' });
    expect(aval.ecran).toBe('transport-aval');

    const amont = dispatcherLigne({ nom: 'Frais divers transport (usine)' });
    expect(amont.ecran).toBe('transport-amont');
  });

  it('n\'envoie pas les combustibles aux achats', () => {
    // « achats » figure dans le libellé : la règle des combustibles doit primer.
    const resultat = dispatcherLigne({ nom: 'Achats matières combustibles Gasoil' });
    expect(resultat.ecran).toBe('combustion-etablissements');
    expect(resultat.origine).toBe('libelle');
  });

  it('déduit du libellé quand la catégorie carbone vaut 0', () => {
    const resultat = dispatcherLigne({ nom: 'Matières consommables électrique', categorieCarbone: 0 });
    expect(resultat.ecran).toBe('electricite-achetee');
    expect(resultat.origine).toBe('libelle');
    expect(resultat.motif).toContain('électrique');
  });

  it('exploite la catégorie carbone quand elle porte une information', () => {
    const resultat = dispatcherLigne({
      nom: 'Poste sans indice', categorieCarbone: 'Deep Sea Freight Transportation'
    });
    expect(resultat.ecran).toBe('transport-amont');
    expect(resultat.origine).toBe('categorie');
  });

  it('écarte à dessein les postes étrangers au bilan carbone', () => {
    const salaires = dispatcherLigne({ mainAccount: '640100', nom: 'Salaires et appointements' });
    expect(salaires.ecran).toBeNull();
    expect(salaires.exclu).toBe(true);
    expect(salaires.motif).toContain('Charges de personnel');

    // Compter les dotations doublerait la catégorie 15 : l'immobilisation a
    // déjà été valorisée à son acquisition.
    const dotation = dispatcherLigne({ mainAccount: '682600', nom: 'Dotations matériels de transports' });
    expect(dotation.exclu).toBe(true);
    expect(dotation.ecran).toBeNull();

    // Une variation de stocks n'est pas un achat de l'exercice.
    expect(dispatcherLigne({ mainAccount: '603000', nom: 'Vat° stocks mat prem' }).exclu).toBe(true);

    expect(REGLES.map(r => r.ecran)).toContain('emissions-refrigerants');
  });

  it('rattache toute ligne d\'une base d\'immobilisations à la CAPEX', () => {
    // Sans cette lecture du document, une armoire électrique partirait en
    // électricité achetée et un climatiseur en réfrigérants.
    const contexte = { nature: 'immobilisations' as const };

    expect(dispatcherLigne({ mainAccount: '21580', nom: 'Porte Rideau Metalique' }, contexte).ecran)
      .toBe('investissements');
    expect(dispatcherLigne({ nom: 'CLIMATISEUR INVERTER GREE' }, contexte).ecran)
      .toBe('investissements');
    expect(dispatcherLigne({ nom: 'Armoire électrique atelier' }, contexte).origine)
      .toBe('document');

    // Hors de ce contexte, le vocabulaire reprend ses droits.
    expect(dispatcherLigne({ nom: 'Recharge fluide frigorigène' }).ecran)
      .toBe('emissions-refrigerants');
  });

  it('rattache un réfrigérant à la fuite, un climatiseur immobilisé à la CAPEX', () => {
    expect(dispatcherLigne({ nom: 'Recharge fluide frigorigène R134a' }).ecran)
      .toBe('emissions-refrigerants');

    // La classe 2 du plan comptable prime : un climatiseur acquis est un actif.
    expect(dispatcherLigne({ mainAccount: '223400', nom: 'CLIMATISEUR INVERTER GREE' }).ecran)
      .toBe('investissements');
  });
});

describe('Lecture globale d\'un classeur comptable', () => {

  it('repère l\'en-tête et cartographie les colonnes de la balance', () => {
    expect(detecterLigneEnTete(BALANCE)).toBe(0);

    const identite = mapperIdentite(BALANCE[0]);
    expect(identite['mainAccount']).toBe(0);
    expect(identite['nom']).toBe(1);
    expect(identite['categorieCarbone']).toBe(10);

    // « Débit » précède « Solde de fin - Devise » dans l'ordre de priorité.
    const valeurs = mapperValeurs(BALANCE[0]);
    expect(valeurs[0].colonne).toBe('Débit');
  });

  it('ventile la balance et nettoie les montants au passage', () => {
    const rapport = lireClasseurDispatch(classeurDe(BALANCE));

    expect(rapport.lignes).toHaveLength(7);
    expect(rapport.avertissements).toEqual([]);

    const gasoil = rapport.lignes.find(l => l.mainAccount === '602100')!;
    expect(gasoil.quantite).toBeCloseTo(1209099.633, 3);
    expect(gasoil.colonneValeur).toBe('Débit');
    expect(gasoil.ecran).toBe('combustion-etablissements');
    expect(gasoil.categorieAbsente).toBe(true);

    // Les salaires n'entrent dans aucune catégorie du GHG Protocol : ils sont
    // écartés à dessein, ce qui n'est pas la même chose qu'un oubli.
    expect(rapport.nonVentilees).toBe(0);
    expect(rapport.exclues).toBe(1);

    const salaires = rapport.lignes.find(l => l.mainAccount === '640100')!;
    expect(salaires.ecran).toBeNull();
    expect(salaires.exclu).toBe(true);

    expect(totalPourEcran(rapport.lignes, 'transport-aval')).toBeCloseTo(8185529.555, 3);
  });

  it('rapporte une feuille inexploitable sans refuser le classeur', () => {
    const classeur = classeurDe(BALANCE);
    XLSX.utils.book_append_sheet(
      classeur,
      XLSX.utils.aoa_to_sheet([['Note interne'], ['rien d\'exploitable ici']]),
      'Notes'
    );

    const rapport = lireClasseurDispatch(classeur);

    // La balance reste lue de bout en bout : aucun « fichier illisible ».
    expect(rapport.lignes).toHaveLength(7);
    expect(rapport.feuilles.map(f => f.feuille)).toContain('Notes');
    expect(rapport.avertissements.join(' ')).toContain('Notes');
  });

  it('n\'oppose qu\'un diagnostic à un classeur entièrement muet', () => {
    const rapport = lireClasseurDispatch(classeurDe([['a', 'b'], ['c', 'd']], 'Muette'));

    expect(rapport.lignes).toEqual([]);
    expect(rapport.avertissements.join(' ')).toContain('Aucune ligne exploitable');
  });

  it('écarte le cumul de fin de tableau', () => {
    const lecture = lireFeuilleDispatch(
      XLSX.utils.aoa_to_sheet([
        ['Nom', 'Débit'],
        ['Achats emballages', 1000],
        ['Total général', 1000]
      ]),
      'Cumul'
    )!;

    expect(lecture.lignes).toHaveLength(1);
    expect(lecture.lignes[0].nom).toBe('Achats emballages');
  });
});

/**
 * Épreuve sur les classeurs réellement livrés.
 *
 * <p>Ces fichiers ne sont pas versionnés : le test se déclare passé quand ils
 * sont absents, plutôt que de faire échouer l'intégration continue.</p>
 */
describe('Classeurs de production', () => {
  const RACINE = 'D:/Users/Public/FilesEmp_Cabone/Files';
  const present = (chemin: string) => fs.existsSync(chemin);

  const lire = (chemin: string) =>
    lireClasseurDispatch(XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellDates: true }));

  it('ventile la balance générale BG MISFAT 2025', () => {
    const chemin = `${RACINE}/BG MISFAT 2025.xlsx`;
    if (!present(chemin)) return;

    const rapport = lire(chemin);

    // 96 postes de charge, plus la feuille « Carte carburant ».
    expect(rapport.lignes.length).toBeGreaterThan(90);

    const parEcran = new Map<string, number>();
    for (const ligne of rapport.lignes) {
      if (ligne.ecran) parEcran.set(ligne.ecran, (parEcran.get(ligne.ecran) ?? 0) + 1);
    }

    // Les écrans que la balance doit alimenter.
    expect(parEcran.get('combustion-etablissements')).toBeGreaterThan(0);
    expect(parEcran.get('electricite-achetee')).toBeGreaterThan(0);
    expect(parEcran.get('transport-amont')).toBeGreaterThan(0);
    expect(parEcran.get('transport-aval')).toBeGreaterThan(0);
    expect(parEcran.get('biens-services')).toBeGreaterThan(0);

    // Toute ligne est soit ventilée, soit écartée avec son motif : la balance
    // ne doit rien laisser en suspens.
    expect(rapport.nonVentilees).toBe(0);
    expect(rapport.exclues).toBeGreaterThan(0);

    // Le poste 602100 porte bien son montant, espaces et virgule nettoyés.
    const gasoil = rapport.lignes.find(l => l.mainAccount === '602100')!;
    expect(gasoil.quantite).toBeCloseTo(1209099.633, 2);
    expect(gasoil.ecran).toBe('combustion-etablissements');

    // Aucune ligne ventilée ne doit peser zéro par défaut de lecture.
    const ventilees = rapport.lignes.filter(l => l.ecran);
    expect(ventilees.filter(l => l.quantite === 0).length).toBeLessThan(ventilees.length / 2);
  });

  it('ventile la base d\'investissements 2025', () => {
    const chemin = `${RACINE}/Base Investissemnt 2025.xlsx`;
    if (!present(chemin)) return;

    const rapport = lire(chemin);
    expect(rapport.lignes.length).toBeGreaterThan(1000);

    // La nature du document prime : toutes les lignes sont des acquisitions.
    const capex = rapport.lignes.filter(l => l.ecran === 'investissements');
    expect(capex.length).toBe(rapport.lignes.length);
    expect(rapport.nonVentilees).toBe(0);

    // Les acquisitions sont lues dans leur colonne dédiée.
    expect(rapport.lignes.some(l => l.colonneValeur === 'Acquisitions')).toBe(true);
    expect(rapport.feuilles.some(f => f.nature === 'immobilisations')).toBe(true);
  });
});
