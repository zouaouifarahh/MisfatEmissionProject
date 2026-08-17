import { describe, it, expect } from 'vitest';

import {
  reconnaitreTypeActif, reconnaitreModeSaisie, modeDepuisUnite, normaliserUnite,
  retenirFacteurAval, consommationValorisee, uniteValorisee, calculerEmissionAval,
  classeBadgeActifAval, emojiActifAval, KWH_PAR_M2_AN,
  REPLI_ELECTRICITE, REPLI_GAZ
} from '../actifs-loues-aval/aval-actifs-facteur';

import {
  reconnaitreApproche, retenirFacteurFranchise, grandeurValorisee,
  calculerEmissionFranchise, classeBadgeApproche, emojiApproche,
  libelleApproche, uniteApproche, EMISSIONS_PAR_SITE_AN, REPLI_MONETAIRE
} from './franchises-facteur';

import { FacteurDetaille } from '../../services/referential.service';

describe('Catégorie 13 — actifs loués en aval', () => {

  it('reconnaît les types d\'actifs depuis un libellé libre', () => {
    expect(reconnaitreTypeActif('Entrepôt')).toBe('Entrepôt / Logistique');
    expect(reconnaitreTypeActif('plateforme logistique')).toBe('Entrepôt / Logistique');
    expect(reconnaitreTypeActif('Bâtiment commercial')).toBe('Bâtiment Commercial');
    expect(reconnaitreTypeActif('bureaux loués')).toBe('Bâtiment Commercial');
    expect(reconnaitreTypeActif('Véhicules')).toBe('Véhicules / Équipements');
    expect(reconnaitreTypeActif('type inconnu')).toBeNull();
  });

  it('ne ramène pas « entrepôt logistique » à un bâtiment commercial', () => {
    // Les deux contiennent des locaux : l'entrepôt doit primer sur le générique.
    expect(reconnaitreTypeActif('local entrepôt')).toBe('Entrepôt / Logistique');
  });

  it('associe à chaque type sa pastille et son emoji', () => {
    expect(classeBadgeActifAval('Entrepôt / Logistique')).toBe('aval-entrepot');
    expect(classeBadgeActifAval('Bâtiment Commercial')).toBe('aval-batiment');
    expect(classeBadgeActifAval('Véhicules / Équipements')).toBe('aval-vehicule');
    expect(emojiActifAval('Entrepôt / Logistique')).toBe('🏢');
  });

  it('déduit le mode de saisie du libellé ou de l\'unité', () => {
    expect(reconnaitreModeSaisie('Surface en m²')).toBe('Surface');
    expect(reconnaitreModeSaisie('Monétaire')).toBe('Monétaire');
    // « m² » se réduirait à « m » sans conversion préalable de l'exposant.
    expect(modeDepuisUnite('m²')).toBe('Surface');
    expect(modeDepuisUnite('TND')).toBe('Monétaire');
    expect(normaliserUnite('m2')).toBe('m²');
    expect(normaliserUnite('kwh')).toBe('kWh');
  });

  it('convertit une surface louée en consommation annuelle', () => {
    expect(KWH_PAR_M2_AN).toBe(120);
    // 500 m² × 120 kWh/m²/an = 60 000 kWh
    expect(consommationValorisee({ mode: 'Surface', quantite: 500 })).toBe(60000);
    expect(uniteValorisee('Surface', 'm²')).toBe('kWh');

    // Une consommation directe est prise telle quelle.
    expect(consommationValorisee({ mode: 'Consommation', quantite: 60000 })).toBe(60000);
    expect(consommationValorisee({ mode: 'Consommation', quantite: null })).toBeNull();
  });

  it('applique les replis ADEME quand la base est vide', () => {
    const electricite = retenirFacteurAval([], {
      type: 'Entrepôt / Logistique', mode: 'Consommation'
    });
    expect(electricite.origine).toBe('ADEME');
    expect(electricite.valeur).toBe(REPLI_ELECTRICITE);
    expect(electricite.valeur).toBe(0.420);

    const gaz = retenirFacteurAval([], {
      type: 'Bâtiment Commercial', mode: 'Consommation', energie: 'Gaz'
    });
    expect(gaz.valeur).toBe(REPLI_GAZ);
    expect(gaz.valeur).toBe(0.227);

    const monetaire = retenirFacteurAval([], {
      type: 'Bâtiment Commercial', mode: 'Monétaire', devise: 'TND'
    });
    expect(monetaire.valeur).toBe(0.180);
  });

  it('préfère le facteur MS SQL au repli quand il documente le type', () => {
    const facteurs: FacteurDetaille[] = [{
      id: 1, referenceCode: 'MS3C13DL', typeName: 'Leased warehouse electricity',
      categoryName: 'Category 13: Downstream leased assets', scopeCode: 'SCOPE_3',
      factorValue: 0.401, unit: 'kWh', dataType: 'PHYSIQUE', currency: null,
      databaseSource: 'DESNZ 2024', referenceYear: 2024, validityLabel: null
    }];

    const retenu = retenirFacteurAval(facteurs, {
      type: 'Entrepôt / Logistique', mode: 'Consommation'
    });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(0.401);
    expect(retenu.baseAppliquee).toBe('DESNZ 2024');
  });

  it('valorise la consommation par le facteur retenu', () => {
    // 500 m² → 60 000 kWh × 0,420 = 25 200 kgCO₂e
    expect(calculerEmissionAval(60000, 0.420)).toBeCloseTo(25200, 2);
    expect(calculerEmissionAval(null, 0.420)).toBe(0);
    expect(calculerEmissionAval(60000, null)).toBe(0);
  });
});

describe('Catégorie 14 — franchises', () => {

  it('reconnaît les approches depuis un libellé libre', () => {
    expect(reconnaitreApproche('Énergétique')).toBe('Énergétique');
    expect(reconnaitreApproche('Monétaire')).toBe('Monétaire');
    expect(reconnaitreApproche('redevances')).toBe('Monétaire');
    expect(reconnaitreApproche('Par site')).toBe('Par site');
    expect(reconnaitreApproche('centre auto')).toBe('Par site');
    // À défaut de mention, le comptage de sites fait foi.
    expect(reconnaitreApproche('')).toBe('Par site');
  });

  it('ne ramène pas « consommation des sites » à un comptage de sites', () => {
    // La mention d'énergie prime : autrement le nombre de kilowattheures serait
    // multiplié par le ratio de 15 000 kgCO₂e par site.
    expect(reconnaitreApproche('consommation réelle des sites')).toBe('Énergétique');
  });

  it('associe à chaque approche sa pastille, son emoji et son unité', () => {
    expect(classeBadgeApproche('Énergétique')).toBe('approche-energetique');
    expect(classeBadgeApproche('Par site')).toBe('approche-site');
    expect(classeBadgeApproche('Monétaire')).toBe('approche-monetaire');
    expect(emojiApproche('Par site')).toBe('🏬');
    expect(uniteApproche('Par site')).toBe('sites');
    expect(uniteApproche('Énergétique')).toBe('kWh');
    expect(libelleApproche('Monétaire')).toContain('redevances');
  });

  it('applique les replis ADEME quand la base est vide', () => {
    const parSite = retenirFacteurFranchise([], { approche: 'Par site' });
    expect(parSite.origine).toBe('ADEME');
    expect(parSite.valeur).toBe(EMISSIONS_PAR_SITE_AN);
    expect(parSite.valeur).toBe(15000);
    expect(parSite.unite).toBe('site·an');

    const monetaire = retenirFacteurFranchise([], { approche: 'Monétaire', devise: 'TND' });
    expect(monetaire.valeur).toBe(REPLI_MONETAIRE);
    expect(monetaire.valeur).toBe(0.210);

    expect(retenirFacteurFranchise([], { approche: 'Énergétique' }).valeur).toBe(0.420);
  });

  it('calcule les émissions d\'un réseau franchisé', () => {
    // 12 sites × 15 000 kgCO₂e/site/an = 180 000 kgCO₂e
    expect(grandeurValorisee({ approche: 'Par site', quantite: 12 })).toBe(12);
    expect(calculerEmissionFranchise(12, EMISSIONS_PAR_SITE_AN)).toBeCloseTo(180000, 2);

    // 250 000 TND de redevances × 0,210 = 52 500 kgCO₂e
    expect(calculerEmissionFranchise(250000, 0.210)).toBeCloseTo(52500, 2);

    expect(calculerEmissionFranchise(null, 15000)).toBe(0);
    expect(grandeurValorisee({ approche: 'Par site', quantite: null })).toBeNull();
  });

  it('préfère le facteur MS SQL au repli quand il documente l\'approche', () => {
    const facteurs: FacteurDetaille[] = [{
      id: 1, referenceCode: 'MS3C14FR', typeName: 'Franchise, average outlet',
      categoryName: 'Category 14: Franchises', scopeCode: 'SCOPE_3',
      factorValue: 12500, unit: 'site', dataType: 'PHYSIQUE', currency: null,
      databaseSource: 'MISFAT_INTERNE', referenceYear: 2024, validityLabel: null
    }];

    const retenu = retenirFacteurFranchise(facteurs, { approche: 'Par site' });
    expect(retenu.origine).toBe('MS SQL BDD');
    expect(retenu.valeur).toBe(12500);
    expect(retenu.baseAppliquee).toBe('MISFAT_INTERNE');
  });
});
