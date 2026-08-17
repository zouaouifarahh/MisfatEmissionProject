import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  quantiteTolerante, extraireUnite, normaliserUnite, lireClasseurDechets
} from './dechets-excel';
import {
  normaliserFiliere, estRecyclage, choisirFacteurDechet,
  classerFacteursDechet, calculerEmissionDechet
} from './dechets-facteur';
import { FacteurDetaille } from '../../services/referential.service';

const DOSSIER = 'D:/Users/Public/FilesEmp_Cabone/Files';

/** Facteurs de la catégorie 5, tels que présents en base MisfatDB. */
const FACTEURS_BDD: FacteurDetaille[] = [
  {
    id: 1, referenceCode: 'MS3C5WR', typeName: 'Waste, recycled',
    categoryName: 'Category 5: Waste Generated in Operations', scopeCode: 'SCOPE_3',
    factorValue: 6.4106084621, unit: 'Tonne', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'MISFAT_INTERNE', referenceYear: 2024, validityLabel: null
  },
  {
    id: 2, referenceCode: 'MS3C5WR1', typeName: 'Waste, recycled',
    categoryName: 'Category 5: Waste Generated in Operations', scopeCode: 'SCOPE_3',
    factorValue: 0.0002211935, unit: 'L', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'MISFAT_INTERNE', referenceYear: 2024, validityLabel: null
  }
];

const classeursDisponibles = fs.existsSync(DOSSIER);

/** Ouvre un classeur depuis le disque (XLSX.readFile n'a pas de fs sous jsdom). */
function lireFichier(chemin: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellDates: true });
}

describe('Nettoyage des quantités de déchets', () => {

  it('convertit les nombres et la virgule décimale', () => {
    expect(quantiteTolerante(5.252).valeur).toBe(5.252);
    expect(quantiteTolerante('5,252').valeur).toBeCloseTo(5.252, 6);
    expect(quantiteTolerante(null).valeur).toBeNull();
    expect(quantiteTolerante('').valeur).toBeNull();
    expect(quantiteTolerante('#N/A').valeur).toBeNull();
  });

  it('extrait la quantité des mentions « Estimé » sans confondre avec l\'année', () => {
    const eaux = quantiteTolerante('Estimé 6000 m3');
    expect(eaux.valeur).toBe(6000);
    expect(eaux.estimation).toBe(true);

    // Le premier nombre porte la quantité ; « 2025 » est l'exercice, pas une tonne.
    const dangereux = quantiteTolerante(
      'Estimé à 1 T en 2025 (actuellement stocké à MISFAT, sauf les cartouches d\'encre usées)'
    );
    expect(dangereux.valeur).toBe(1);
    expect(dangereux.estimation).toBe(true);
    expect(dangereux.note).toContain('Estimé');
  });

  it('sépare le libellé de son unité', () => {
    expect(extraireUnite('Déchet plastic (T)')).toEqual({ type: 'Déchet plastic', unite: 'Tonne' });
    expect(extraireUnite('Déchet bois (Pc)')).toEqual({ type: 'Déchet bois', unite: 'Pc' });
    expect(extraireUnite('Huiles usées (L)')).toEqual({ type: 'Huiles usées', unite: 'L' });
    expect(extraireUnite('Eaux usées m3')).toEqual({ type: 'Eaux usées', unite: 'm³' });
    expect(extraireUnite('Déchet papier')).toEqual({ type: 'Déchet papier', unite: '' });
  });

  it('ramène les unités à leur forme canonique', () => {
    expect(normaliserUnite('T')).toBe('Tonne');
    expect(normaliserUnite('tonnes')).toBe('Tonne');
    expect(normaliserUnite('l')).toBe('L');
    expect(normaliserUnite('m3')).toBe('m³');
  });
});

describe('Filières de traitement', () => {

  it('ramène les formulations du relevé à une filière connue', () => {
    expect(normaliserFiliere('En externe')).toBe('Recyclage externe');
    expect(normaliserFiliere('En interne')).toBe('Recyclage interne');
    expect(normaliserFiliere('Non recyclé')).toBe('Non recyclé');
    expect(normaliserFiliere('Non')).toBe('Non recyclé');
    expect(estRecyclage('Recyclage externe')).toBe(true);
    expect(estRecyclage('Non recyclé')).toBe(false);
  });
});

describe('Matching automatique du facteur déchet', () => {

  it('retient le facteur à la tonne pour une quantité en tonnes', () => {
    const facteur = choisirFacteurDechet(FACTEURS_BDD, {
      unite: 'Tonne', filiere: 'Recyclage externe'
    });
    expect(facteur?.referenceCode).toBe('MS3C5WR');
    expect(facteur?.factorValue).toBeCloseTo(6.4106084621, 8);
    expect(facteur?.databaseSource).toBe('MISFAT_INTERNE');
  });

  it('retient le facteur au litre pour des huiles usées', () => {
    const facteur = choisirFacteurDechet(FACTEURS_BDD, { unite: 'L', filiere: 'Non recyclé' });
    expect(facteur?.referenceCode).toBe('MS3C5WR1');
    expect(facteur?.unit).toBe('L');
  });

  it('n\'invente aucun facteur pour une unité non documentée', () => {
    // Le référentiel ne couvre ni les m³ ni les pièces : mieux vaut une ligne
    // signalée qu'un facteur à la tonne appliqué à des mètres cubes.
    expect(choisirFacteurDechet(FACTEURS_BDD, { unite: 'm³', filiere: 'Recyclage interne' })).toBeNull();
    expect(choisirFacteurDechet(FACTEURS_BDD, { unite: 'Pc', filiere: 'Recyclage externe' })).toBeNull();
    expect(classerFacteursDechet(FACTEURS_BDD, { unite: 'Pc', filiere: 'Non recyclé' })).toEqual([]);
  });

  it('calcule les émissions par quantité × facteur', () => {
    expect(calculerEmissionDechet(57.308, 6.4106084621)).toBeCloseTo(367.4, 1);
    expect(calculerEmissionDechet(null, 6.41)).toBe(0);
    expect(calculerEmissionDechet(10, null)).toBe(0);
  });
});

describe.skipIf(!classeursDisponibles)('Lecture du relevé de déchets de production', () => {

  const fichierDechets = () => fs.readdirSync(DOSSIER)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map(f => path.join(DOSSIER, f))
    .find(f => /dechet/i.test(path.basename(f).normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

  it('détecte l\'en-tête mensuel, l\'exercice et les douze mois', () => {
    const fichier = fichierDechets();
    expect(fichier).toBeTruthy();

    const resultat = lireClasseurDechets(lireFichier(fichier!));
    expect(resultat).toBeTruthy();

    // Le classeur ouvre sur un titre puis sur l'année : l'en-tête est en ligne 3.
    expect(resultat!.ligneEnTete).toBe(2);
    expect(resultat!.annee).toBe(2025);
    expect(resultat!.moisDetectes).toBe(12);
  });

  it('somme les douze mois de chaque déchet et lit ses métadonnées', () => {
    const resultat = lireClasseurDechets(lireFichier(fichierDechets()!))!;

    // Neuf flux de déchets, sans la ligne de total en pied de tableau.
    expect(resultat.lignes.length).toBe(9);

    const plastique = resultat.lignes.find(l => /plastic/i.test(l.typeDechet));
    expect(plastique).toBeTruthy();
    expect(plastique!.unite).toBe('Tonne');
    expect(plastique!.moisRenseignes).toBe(12);
    // 5.252 + 3.213 + 5.982 + 4.853 + 5.333 + 4.29
    // + 5.27 + 3.42 + 6.631 + 3.865 + 4.328 + 4.871
    expect(plastique!.quantiteTotale).toBeCloseTo(57.308, 3);
    expect(plastique!.traitement).toBe('En externe');
    expect(plastique!.prestataire).toBe('Brahim BOUCHAMI');
    expect(plastique!.reutilise).toBe('Non');
    expect(plastique!.estimation).toBe(false);

    const menagers = resultat.lignes.find(l => /menagers/i.test(l.typeDechet.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    expect(menagers!.prestataire).toBe('Valoria');
    expect(menagers!.traitement).toBe('Non recyclé');

    const huiles = resultat.lignes.find(l => /huiles/i.test(l.typeDechet));
    expect(huiles!.unite).toBe('L');
    expect(huiles!.quantiteTotale).toBe(3650);
    expect(huiles!.prestataire).toBe('Sotulub');
  });

  it('retient les flux estimés et les signale comme tels', () => {
    const resultat = lireClasseurDechets(lireFichier(fichierDechets()!))!;

    const eaux = resultat.lignes.find(l => /eaux/i.test(l.typeDechet));
    expect(eaux!.unite).toBe('m³');
    expect(eaux!.quantiteTotale).toBe(6000);
    expect(eaux!.moisRenseignes).toBe(1);
    expect(eaux!.estimation).toBe(true);
    expect(eaux!.prestataire).toBe('ONAS');

    const dangereux = resultat.lignes.find(l => /dangereux/i.test(l.typeDechet));
    expect(dangereux!.quantiteTotale).toBe(1);
    expect(dangereux!.estimation).toBe(true);
    expect(dangereux!.noteEstimation).toContain('MISFAT');
  });

  it('valorise le tableau importé : provenance, facteur BDD et base appliquée', () => {
    const resultat = lireClasseurDechets(lireFichier(fichierDechets()!))!;

    const lignesTableau = resultat.lignes.map(brute => {
      const filiere = normaliserFiliere(brute.traitement);
      const facteur = choisirFacteurDechet(FACTEURS_BDD, { unite: brute.unite, filiere });

      return {
        typeDechet: brute.typeDechet,
        provenance: brute.estimation ? 'Estimation' : 'Excel',
        filiere,
        prestataire: brute.prestataire,
        quantiteTotale: brute.quantiteTotale,
        unite: brute.unite,
        facteur: facteur?.factorValue ?? null,
        baseAppliquee: facteur?.databaseSource ?? '',
        reference: facteur?.referenceCode ?? '',
        emissionCalculee: calculerEmissionDechet(brute.quantiteTotale, facteur?.factorValue ?? null)
      };
    });

    // Toute ligne porte un type, une quantité et une provenance.
    for (const ligne of lignesTableau) {
      expect(ligne.typeDechet).toBeTruthy();
      expect(ligne.quantiteTotale).not.toBeNull();
      expect(['Excel', 'Estimation']).toContain(ligne.provenance);
      expect(ligne.filiere).toBeTruthy();
    }

    // Les flux en tonnes et en litres trouvent leur facteur en base.
    const valorisees = lignesTableau.filter(l => l.facteur !== null);
    expect(valorisees.length).toBeGreaterThan(0);

    for (const ligne of valorisees) {
      expect(ligne.baseAppliquee).toBe('MISFAT_INTERNE');
      expect(ligne.reference).toBeTruthy();
      expect(ligne.emissionCalculee).toBeGreaterThan(0);
      expect(['Tonne', 'L']).toContain(ligne.unite);
    }

    const plastique = lignesTableau.find(l => /plastic/i.test(l.typeDechet))!;
    expect(plastique.emissionCalculee).toBeCloseTo(57.308 * 6.4106084621, 2);

    // Les unités non couvertes par le référentiel restent explicitement sans
    // facteur : m³ pour les eaux usées, Pc pour le bois, et l'unité indéterminée
    // du papier — la valoriser à la tonne se tromperait d'un facteur mille.
    const sansFacteur = lignesTableau.filter(l => l.facteur === null).map(l => l.unite);
    expect(sansFacteur).toContain('m³');
    expect(sansFacteur).toContain('Pc');
    expect(sansFacteur).toContain('');
  });
});
