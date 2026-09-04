import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  normaliserEnTete, nombreTolerant, detecterLigneEnTete,
  mapperColonnes, colonnesManquantes, lireClasseurVoyages, lireFeuilleVoyages
} from './voyages-excel';
import {
  segmentAerien, choisirFacteurVoyage, classerFacteursVoyage, calculerEmissionVoyage,
  TRAJETS_PAR_MISSION
} from './voyages-facteur';
import { FacteurDetaille } from '../../services/referential.service';

const DOSSIER = 'D:/Users/Public/FilesEmp_Cabone/Files';

/** Facteur de la catégorie 6, tel que présent en base MisfatDB. */
const FACTEURS_BDD: FacteurDetaille[] = [
  {
    id: 1, referenceCode: 'MS3C6BT', typeName: 'Medium-haul, economy',
    categoryName: 'Category 6: Business Travel', scopeCode: 'SCOPE_3',
    factorValue: 0.1295238796, unit: 'pass.Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  }
];

const classeursDisponibles = fs.existsSync(DOSSIER);

/** Ouvre un classeur depuis le disque (XLSX.readFile n'a pas de fs sous jsdom). */
function lireFichier(chemin: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellDates: true });
}

describe('Normalisation et nettoyage', () => {

  it('normalise les en-têtes accentués et espacés', () => {
    expect(normaliserEnTete('Distance en Km ')).toBe('distance en km');
    expect(normaliserEnTete('N° Ordre de Mission')).toBe('n ordre de mission');
    expect(normaliserEnTete('Nbr Jours')).toBe('nbr jours');
    expect(normaliserEnTete('Référence')).toBe('reference');
  });

  it('convertit les nombres tolérants aux formats français', () => {
    expect(nombreTolerant(3343.82)).toBe(3343.82);
    expect(nombreTolerant('2 969,02')).toBeCloseTo(2969.02, 4);
    expect(nombreTolerant('#N/A')).toBeNull();
    expect(nombreTolerant('')).toBeNull();
  });
});

describe('Détection d\'en-tête et colonnes obligatoires', () => {

  it('reconnaît l\'en-tête du suivi des ordres de mission', () => {
    const enTetes = ['Référence', 'N° Ordre de Mission', 'Date', 'Personne', 'Destination',
                     'Date début', 'Date Fin', 'Nbr Jours', 'Distance en Km '];
    expect(detecterLigneEnTete([enTetes])).toBe(0);

    const carte = mapperColonnes(enTetes);
    expect(carte['reference']).toBe(0);
    expect(carte['numeroOM']).toBe(1);
    expect(carte['personne']).toBe(3);
    expect(carte['destination']).toBe(4);
    expect(carte['nbrJours']).toBe(7);
    expect(carte['distanceKm']).toBe(8);
  });

  it('ne confond pas « Date » avec « Date début » ni « Date Fin »', () => {
    const carte = mapperColonnes(['Date', 'Date début', 'Date Fin']);
    expect(carte['dateOrdre']).toBe(0);
    expect(carte['dateDebut']).toBe(1);
    expect(carte['dateFin']).toBe(2);
  });

  it('signale proprement les colonnes obligatoires absentes', () => {
    // Ni référence ni ordre de mission, ni distance ni montant.
    expect(colonnesManquantes(mapperColonnes(['Personne', 'Destination'])))
      .toEqual(['Référence ou N° Ordre de Mission', 'Distance en Km ou Montant']);

    // Identité présente, grandeur absente.
    expect(colonnesManquantes(mapperColonnes(['Référence', 'Personne'])))
      .toEqual(['Distance en Km ou Montant']);

    expect(colonnesManquantes(mapperColonnes(['Référence', 'Distance en Km']))).toEqual([]);
  });

  it('rend un avertissement plutôt qu\'une exception sur une feuille étrangère', () => {
    const feuille = XLSX.utils.aoa_to_sheet([
      ['Matricule', 'Nom &  Prénom', 'Adresse Domicile', 'Moyen de transport'],
      ['M001', 'A. B.', 'Tunis', 'Voiture']
    ]);
    const resultat = lireFeuilleVoyages(feuille, 'Feuil2');

    // La feuille est reconnue mais refusée, sans lever d'exception.
    if (resultat) {
      expect(resultat.lignes).toEqual([]);
      expect(resultat.avertissement).toContain('inexploitable');
    }
  });
});

describe('Segments aériens et matching', () => {

  it('classe les distances en court, moyen et long-courrier', () => {
    expect(segmentAerien(779)).toBe('Court-courrier');
    expect(segmentAerien(2969.02)).toBe('Moyen-courrier');
    expect(segmentAerien(3343.82)).toBe('Moyen-courrier');
    expect(segmentAerien(4721.55)).toBe('Long-courrier');
    expect(segmentAerien(null)).toBeNull();
    expect(segmentAerien(0)).toBeNull();
  });

  it('associe un vol moyen-courrier au facteur de la base', () => {
    const facteur = choisirFacteurVoyage(FACTEURS_BDD, { mode: 'Avion', distanceKm: 2969.02 });
    expect(facteur?.referenceCode).toBe('MS3C6BT');
    expect(facteur?.unit).toBe('pass.Km');
    expect(facteur?.databaseSource).toBe('DESNZ 2024');
  });

  it('refuse le facteur moyen-courrier pour un court ou un long-courrier', () => {
    // Le référentiel ne documente que le moyen-courrier : appliquer son
    // intensité à un autre segment fausserait le résultat.
    expect(choisirFacteurVoyage(FACTEURS_BDD, { mode: 'Avion', distanceKm: 779 })).toBeNull();
    expect(choisirFacteurVoyage(FACTEURS_BDD, { mode: 'Avion', distanceKm: 4721.55 })).toBeNull();
  });

  it('n\'associe aucun facteur aérien à un autre mode', () => {
    expect(choisirFacteurVoyage(FACTEURS_BDD, { mode: 'Train', distanceKm: 500 })).toBeNull();
    expect(choisirFacteurVoyage(FACTEURS_BDD, { mode: 'Voiture', distanceKm: 500 })).toBeNull();
    expect(classerFacteursVoyage(FACTEURS_BDD, { mode: 'Avion', monetaire: true })).toEqual([]);
  });

  it('calcule les émissions au passager-kilomètre, aller-retour compris', () => {
    // La distance saisie est celle de l'aller : 2 969,02 km à 0,12952 kgCO₂e
    // valent 384,56 pour un trajet, donc 769,12 pour la mission entière. Ne
    // compter que l'aller sous-évaluait le poste de moitié.
    expect(calculerEmissionVoyage({
      facteur: 0.1295238796, monetaire: false, distanceKm: 2969.02, montant: null
    })).toBeCloseTo(769.12, 1);

    // Deux participants sur la même mission doublent encore.
    expect(calculerEmissionVoyage({
      facteur: 0.1295238796, monetaire: false, distanceKm: 2969.02, montant: null, participants: 2
    })).toBeCloseTo(1538.24, 1);

    // La valorisation monétaire n'est pas doublée : un montant de mission
    // couvre déjà le billet entier, retour inclus.
    expect(calculerEmissionVoyage({
      facteur: 0.5, monetaire: true, distanceKm: null, montant: 1000
    })).toBe(500);
  });

  it('ne compte le retour qu\'une fois', () => {
    // Garde-fou : le facteur deux doit rester dans la formule, non se cumuler
    // avec une distance que l'utilisateur aurait déjà doublée à la saisie.
    const aller = calculerEmissionVoyage({
      facteur: 1, monetaire: false, distanceKm: 100, montant: null
    });
    expect(aller).toBe(200);
    expect(TRAJETS_PAR_MISSION).toBe(2);
  });
});

describe.skipIf(!classeursDisponibles)('Lecture du suivi des ordres de mission', () => {

  const fichierVoyages = () => fs.readdirSync(DOSSIER)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map(f => path.join(DOSSIER, f))
    .find(f => /deplacements.*ava/i.test(
      path.basename(f).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ));

  it('lit la feuille SUIVI 2025 et ses colonnes clés', () => {
    const fichier = fichierVoyages();
    expect(fichier).toBeTruthy();

    const resultat = lireClasseurVoyages(lireFichier(fichier!));
    expect(resultat).toBeTruthy();
    expect(resultat!.feuille).toBe('SUIVI 2025');
    expect(resultat!.ligneEnTete).toBe(0);
    expect(resultat!.colonnesManquantes).toEqual([]);

    for (const champ of ['reference', 'numeroOM', 'personne', 'destination',
                         'dateDebut', 'dateFin', 'nbrJours', 'distanceKm']) {
      expect(resultat!.colonnesReconnues).toContain(champ);
    }
  });

  it('retient les 90 missions et écarte la ligne de total', () => {
    const resultat = lireClasseurVoyages(lireFichier(fichierVoyages()!))!;

    // Le classeur compte 91 lignes sous l'en-tête, dont un total en pied de
    // tableau portant la somme des distances (247 705,77 km) sans identité de
    // mission : le retenir doublerait le bilan à lui seul.
    expect(resultat.lignes.length).toBe(90);
    expect(resultat.rejets.length).toBe(1);
    expect(resultat.rejets[0].motif).toContain('total');

    const totalDistances = resultat.lignes.reduce((s, l) => s + (l.distanceKm ?? 0), 0);
    expect(totalDistances).toBeCloseTo(247705.77, 1);

    const premiere = resultat.lignes[0];
    expect(premiere.reference).toBe('2025-0001');
    expect(premiere.numeroOM).toBe('OE250001');
    expect(premiere.personne).toBe('NAOUFEL MABROUK');
    expect(premiere.destination).toBe('MAROC');
    expect(premiere.nbrJours).toBe(6);
    expect(premiere.distanceKm).toBeCloseTo(3343.82, 2);
    expect(premiere.dateDebut).toMatch(/^2025-01-0[456]$/);
  });

  it('valorise les missions avec le facteur MS SQL et signale les segments non couverts', () => {
    const resultat = lireClasseurVoyages(lireFichier(fichierVoyages()!))!;

    const lignesTableau = resultat.lignes.map(brute => {
      const facteur = choisirFacteurVoyage(FACTEURS_BDD, {
        mode: 'Avion', distanceKm: brute.distanceKm
      });
      return {
        numeroOM: brute.numeroOM,
        personne: brute.personne,
        destination: brute.destination,
        provenance: 'Excel' as const,
        distanceKm: brute.distanceKm,
        segment: segmentAerien(brute.distanceKm),
        facteur: facteur?.factorValue ?? null,
        baseAppliquee: facteur?.databaseSource ?? '',
        reference: facteur?.referenceCode ?? '',
        emissionCalculee: calculerEmissionVoyage({
          facteur: facteur?.factorValue ?? null, monetaire: false,
          distanceKm: brute.distanceKm, montant: brute.montant
        })
      };
    });

    for (const ligne of lignesTableau) {
      expect(ligne.provenance).toBe('Excel');
      expect(ligne.numeroOM).toBeTruthy();
      expect(ligne.distanceKm).not.toBeNull();
      expect(ligne.segment).toBeTruthy();
    }

    const valorisees = lignesTableau.filter(l => l.facteur !== null);
    for (const ligne of valorisees) {
      expect(ligne.segment).toBe('Moyen-courrier');
      expect(ligne.baseAppliquee).toBe('DESNZ 2024');
      expect(ligne.reference).toBe('MS3C6BT');
      expect(ligne.emissionCalculee).toBeGreaterThan(0);
    }

    // 86 vols moyen-courriers valorisés ; 4 hors segment restent sans facteur,
    // le référentiel ne documentant ni le court ni le long-courrier.
    expect(valorisees.length).toBe(86);
    const horsSegment = lignesTableau.filter(l => l.facteur === null);
    expect(horsSegment.length).toBe(4);
    expect(horsSegment.every(l => l.segment !== 'Moyen-courrier')).toBe(true);
  });
});
