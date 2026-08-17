import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

import {
  nombreTolerant, normaliserEnTete, detecterLigneEnTete,
  mapperColonnes, lireClasseur
} from './transport-excel';
import {
  choisirFacteur, calculerEmission, deduireMode, modeCalculDe
} from './transport-facteur';
import { FacteurDetaille } from '../../services/referential.service';

/** Dossier des classeurs de production. */
const DOSSIER = 'D:/Users/Public/FilesEmp_Cabone/Files';

/** Facteurs de la catégorie 4, tels que présents en base MisfatDB. */
const FACTEURS_BDD: FacteurDetaille[] = [
  {
    id: 1, referenceCode: 'MS3C4UPDM', typeName: 'Diesel medium and heavy duty truck',
    categoryName: 'Category 4: Upstream transportation and distribution', scopeCode: 'SCOPE_3',
    factorValue: 1.0527889363, unit: 'Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'EPA 2024', referenceYear: 2024, validityLabel: null
  },
  {
    id: 2, referenceCode: 'MS3C4UPSF', typeName: 'Sea freight, Container, average',
    categoryName: 'Category 4: Upstream transportation and distribution', scopeCode: 'SCOPE_3',
    factorValue: 0.0195755027, unit: 'Tonne.Km', dataType: 'PHYSIQUE', currency: null,
    databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
  },
  {
    id: 3, referenceCode: 'MS3C4UPOFS', typeName: 'Ocean Freight, Spend',
    categoryName: 'Category 4: Upstream transportation and distribution', scopeCode: 'SCOPE_3',
    factorValue: 0.2352553179, unit: 'TND', dataType: 'MONETAIRE', currency: 'TND',
    databaseSource: 'EPA-ORD 2024', referenceYear: 2024, validityLabel: null
  }
];

const classeursDisponibles = fs.existsSync(DOSSIER);

/**
 * Ouvre un classeur depuis le disque.
 *
 * <p>{@code XLSX.readFile} s'appuie sur une détection interne du système de
 * fichiers, indisponible sous l'environnement jsdom des tests. Les octets sont
 * donc lus explicitement, exactement comme le navigateur les fournit à
 * l'import.</p>
 */
function lireFichier(chemin: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(chemin), { type: 'buffer', cellDates: true });
}

describe('Conversion numérique tolérante', () => {

  it('absorbe les erreurs Excel et les séparateurs français', () => {
    expect(nombreTolerant('#N/A')).toBeNull();
    expect(nombreTolerant('#DIV/0!')).toBeNull();
    expect(nombreTolerant('-')).toBeNull();
    expect(nombreTolerant('')).toBeNull();
    expect(nombreTolerant(null)).toBeNull();

    expect(nombreTolerant('1234,56')).toBeCloseTo(1234.56, 6);
    expect(nombreTolerant('1 234,56')).toBeCloseTo(1234.56, 6);
    expect(nombreTolerant('1\u00A0234,56')).toBeCloseTo(1234.56, 6);
    expect(nombreTolerant('1.234,56')).toBeCloseTo(1234.56, 6);
    expect(nombreTolerant('1,234.56')).toBeCloseTo(1234.56, 6);
    expect(nombreTolerant(6684)).toBe(6684);
  });

  it('distingue une absence de donnée d\'un zéro mesuré', () => {
    expect(nombreTolerant(0)).toBe(0);
    expect(nombreTolerant('0')).toBe(0);
    expect(nombreTolerant('#N/A')).toBeNull();
  });

  it('normalise les en-têtes accentués et espacés', () => {
    expect(normaliserEnTete('PAYS  ')).toBe('pays');
    expect(normaliserEnTete('Montant de la facture')).toBe('montant de la facture');
    expect(normaliserEnTete('N° déclaration ')).toBe('n declaration');
    expect(normaliserEnTete('Distance terrestre  ')).toBe('distance terrestre');
  });
});

describe('Détection d\'en-tête et mapping', () => {

  it('saute le titre et retient la vraie ligne d\'en-tête', () => {
    const lignes = [
      [null, null, null, 'Suivi Export Misfat', null],
      ['Frs ', 'Facture', 'Clients ', 'PAYS ', 'Poids ', 'Transporteur ', 'Montant de la facture'],
      ['Misfat', 'FE25000001', 'FILTRATION', 'ALLEMAGNE', 6684, 'HBH', 31838.88]
    ];
    expect(detecterLigneEnTete(lignes)).toBe(1);

    const carte = mapperColonnes(lignes[1]);
    expect(carte['facture']).toBe(1);
    expect(carte['pays']).toBe(3);
    expect(carte['poids']).toBe(4);
    expect(carte['transporteur']).toBe(5);
    expect(carte['montant']).toBe(6);
  });

  it('ne confond pas « distance » et « distance maritime »', () => {
    const enTetes = ['Facture', 'Poids ', 'Transporteur ', 'Distance terrestre ', 'distance maritime'];
    const carte = mapperColonnes(enTetes);
    expect(carte['distanceTerrestre']).toBe(3);
    expect(carte['distanceMaritime']).toBe(4);
  });
});

describe('Matching automatique du facteur', () => {

  it('associe le fret routier au facteur camion, en kilomètres', () => {
    const facteur = choisirFacteur(FACTEURS_BDD, { mode: 'Fret routier', monetaire: false });
    expect(facteur?.referenceCode).toBe('MS3C4UPDM');
    expect(modeCalculDe(facteur!.unit, facteur!.dataType)).toBe('KM');
  });

  it('associe le fret maritime au facteur conteneur, en tonne.km', () => {
    const facteur = choisirFacteur(FACTEURS_BDD, { mode: 'Fret maritime', monetaire: false });
    expect(facteur?.referenceCode).toBe('MS3C4UPSF');
    expect(modeCalculDe(facteur!.unit, facteur!.dataType)).toBe('TONNE_KM');
  });

  it('associe une valorisation monétaire au facteur au montant', () => {
    const facteur = choisirFacteur(FACTEURS_BDD, { mode: 'Fret maritime', monetaire: true, devise: 'TND' });
    expect(facteur?.referenceCode).toBe('MS3C4UPOFS');
    expect(facteur?.databaseSource).toBe('EPA-ORD 2024');
  });

  it('rend null pour le fret aérien, non documenté en base', () => {
    expect(choisirFacteur(FACTEURS_BDD, { mode: 'Fret aérien', monetaire: false })).toBeNull();
  });

  it('applique la formule dictée par l\'unité', () => {
    // Tonne.km : 6,684 t × 4459,616 km × 0,0195755027
    expect(calculerEmission({
      facteur: 0.0195755027, uniteFacteur: 'Tonne.Km', dataType: 'PHYSIQUE',
      poidsKg: 6684, distanceKm: 4459.616, montant: null
    })).toBeCloseTo(583.51, 1);

    // Km : le tonnage n'intervient pas.
    expect(calculerEmission({
      facteur: 1.0527889363, uniteFacteur: 'Km', dataType: 'PHYSIQUE',
      poidsKg: 6684, distanceKm: 49, montant: null
    })).toBeCloseTo(51.59, 2);

    // Monétaire : seul le montant compte.
    expect(calculerEmission({
      facteur: 0.2352553179, uniteFacteur: 'TND', dataType: 'MONETAIRE',
      poidsKg: null, distanceKm: null, montant: 31838.88
    })).toBeCloseTo(7490.31, 1);
  });

  it('retient le trajet dominant d\'un acheminement multimodal', () => {
    expect(deduireMode(49, 4459.616)).toEqual({
      mode: 'Fret maritime', distanceKm: 4459.616, legIgnore: true
    });
    expect(deduireMode(320, null)).toEqual({
      mode: 'Fret routier', distanceKm: 320, legIgnore: false
    });
  });
});

describe.skipIf(!classeursDisponibles)('Lecture des classeurs de production', () => {

  const classeurs = () => fs.readdirSync(DOSSIER)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map(f => path.join(DOSSIER, f));

  it('parcourt tous les classeurs sans lever d\'exception', () => {
    const fichiers = classeurs();
    expect(fichiers.length).toBeGreaterThan(0);

    const reconnus: string[] = [];
    const illisibles: string[] = [];

    for (const fichier of fichiers) {
      // Un classeur ouvert dans Excel reste verrouillé : l'inventaire doit s'en
      // accommoder, comme le parser le fait à l'import.
      try {
        const resultat = lireClasseur(lireFichier(fichier));
        if (resultat && resultat.lignes.length) reconnus.push(path.basename(fichier));
      } catch {
        illisibles.push(path.basename(fichier));
      }
    }

    // Au moins le suivi export doit être reconnu comme feuille de transport.
    expect(reconnus.some(n => /suivi export/i.test(n))).toBe(true);
    expect(illisibles.length).toBeLessThan(fichiers.length);
    // Le classeur des achats pèse 13 Mo : la lecture complète prend du temps.
  }, 120_000);

  it('extrait le suivi export sans colonne vide sur les champs porteurs', () => {
    const fichier = classeurs().find(f => /suivi export/i.test(path.basename(f)));
    expect(fichier).toBeTruthy();

    const classeur = lireFichier(fichier!);
    const resultat = lireClasseur(classeur);

    expect(resultat).toBeTruthy();
    expect(resultat!.feuille).toBe('EXP 25');
    expect(resultat!.ligneEnTete).toBe(1);
    expect(resultat!.lignes.length).toBeGreaterThan(3000);

    for (const champ of ['facture', 'transporteur', 'pays', 'poids', 'montant',
                         'distanceTerrestre', 'distanceMaritime']) {
      expect(resultat!.colonnesReconnues).toContain(champ);
    }

    // Chaque ligne retenue porte une facture et une donnée valorisable.
    const sansFacture = resultat!.lignes.filter(l => !l.numeroFacture).length;
    const sansValeur = resultat!.lignes.filter(l => l.poidsKg === null && l.montant === null).length;
    expect(sansValeur).toBe(0);
    expect(sansFacture).toBe(0);

    const premiere = resultat!.lignes[0];
    expect(premiere.numeroFacture).toBe('FE25000001');
    expect(premiere.destination).toBe('ALLEMAGNE');
    expect(premiere.transporteur).toBe('HBH');
    expect(premiere.poidsKg).toBe(6684);
    expect(premiere.montant).toBeCloseTo(31838.88, 2);
  });

  it('valorise chaque ligne importée avec un facteur de la base', () => {
    const fichier = classeurs().find(f => /suivi export/i.test(path.basename(f)))!;
    const resultat = lireClasseur(lireFichier(fichier))!;

    let avecDistance = 0;
    let valorisees = 0;
    let sansDistance = 0;
    let sansFacteur = 0;

    for (const ligne of resultat.lignes.slice(0, 500)) {
      const { mode, distanceKm } = deduireMode(ligne.distanceTerrestreKm, ligne.distanceMaritimeKm);

      if (distanceKm === null || ligne.poidsKg === null) { sansDistance++; continue; }
      avecDistance++;

      const facteur = choisirFacteur(FACTEURS_BDD, { mode, monetaire: false, devise: 'TND' });
      if (!facteur) { sansFacteur++; continue; }

      const emission = calculerEmission({
        facteur: facteur.factorValue, uniteFacteur: facteur.unit, dataType: facteur.dataType,
        poidsKg: ligne.poidsKg, distanceKm, montant: ligne.montant
      });

      expect(Number.isFinite(emission)).toBe(true);
      expect(emission).toBeGreaterThan(0);
      expect(facteur.databaseSource).toBeTruthy();
      expect(facteur.referenceCode).toBeTruthy();
      valorisees++;
    }

    // Toute ligne portant poids et distance trouve son facteur en base.
    expect(avecDistance).toBeGreaterThan(0);
    expect(sansFacteur).toBe(0);
    expect(valorisees).toBe(avecDistance);

    // Les livraisons locales sans distance existent bel et bien dans le fichier.
    // Le référentiel ne documentant aucun facteur monétaire routier, elles ne
    // peuvent pas être valorisées : elles doivent être signalées, pas comptées
    // à zéro en silence.
    expect(sansDistance).toBeGreaterThan(0);
    expect(choisirFacteur(FACTEURS_BDD, { mode: 'Fret routier', monetaire: true, devise: 'TND' }))
      .toBeNull();
  }, 60_000);

  it('remplit le tableau importé : badge Excel, facteur et base sur chaque ligne valorisable', () => {
    const fichier = classeurs().find(f => /suivi export/i.test(path.basename(f)))!;
    const resultat = lireClasseur(lireFichier(fichier))!;

    // Reproduit fidèlement le mappage opéré par le composant à l'import.
    const lignesTableau = resultat.lignes.slice(0, 800).map((brute, index) => {
      const { mode, distanceKm } = deduireMode(brute.distanceTerrestreKm, brute.distanceMaritimeKm);
      const monetaire = distanceKm === null || brute.poidsKg === null;
      const facteur = choisirFacteur(FACTEURS_BDD, { mode, monetaire, devise: 'TND' });

      return {
        id: index,
        provenance: 'Excel' as const,
        numeroFacture: brute.numeroFacture,
        modeTransport: mode,
        transporteur: brute.transporteur,
        destination: brute.destination,
        poidsKg: brute.poidsKg,
        distanceKm,
        montant: brute.montant,
        reference: facteur?.referenceCode ?? '',
        facteur: facteur?.factorValue ?? null,
        uniteFacteur: facteur?.unit ?? '',
        baseAppliquee: facteur?.databaseSource ?? '',
        emissionCalculee: facteur
          ? calculerEmission({
              facteur: facteur.factorValue, uniteFacteur: facteur.unit,
              dataType: facteur.dataType, poidsKg: brute.poidsKg,
              distanceKm, montant: brute.montant
            })
          : 0
      };
    });

    expect(lignesTableau.length).toBeGreaterThan(0);

    // Toute ligne importée porte la pastille Excel et ses colonnes d'identité.
    for (const ligne of lignesTableau) {
      expect(ligne.provenance).toBe('Excel');
      expect(ligne.numeroFacture).toBeTruthy();
      expect(ligne.destination).toBeTruthy();
      expect(['Fret routier', 'Fret maritime', 'Fret aérien']).toContain(ligne.modeTransport);
      expect(ligne.poidsKg !== null || ligne.montant !== null).toBe(true);
    }

    // Le transporteur manque sur de rares enregistrements du fichier source
    // (FE25000732 par exemple) : l'import doit les accepter sans les inventer.
    const sansTransporteur = lignesTableau.filter(l => !l.transporteur).length;
    expect(sansTransporteur / lignesTableau.length).toBeLessThan(0.01);

    // Les lignes valorisées portent toutes un facteur issu de la base, sa base
    // documentaire, son unité et une émission strictement positive.
    const valorisees = lignesTableau.filter(l => l.facteur !== null);
    expect(valorisees.length).toBeGreaterThan(0);

    for (const ligne of valorisees) {
      expect(ligne.reference).toBeTruthy();
      expect(ligne.baseAppliquee).toBeTruthy();
      expect(ligne.uniteFacteur).toBeTruthy();
      expect(ligne.emissionCalculee).toBeGreaterThan(0);
      expect(FACTEURS_BDD.some(f => f.referenceCode === ligne.reference)).toBe(true);
    }

    // Le fret maritime se valorise en tonne.km, le routier au kilomètre.
    const maritime = valorisees.find(l => l.modeTransport === 'Fret maritime');
    expect(maritime?.uniteFacteur).toBe('Tonne.Km');
    expect(maritime?.baseAppliquee).toBe('DESNZ 2024');

    const routier = valorisees.find(l => l.modeTransport === 'Fret routier');
    if (routier) {
      expect(routier.uniteFacteur).toBe('Km');
      expect(routier.baseAppliquee).toBe('EPA 2024');
    }
  }, 60_000);
});
