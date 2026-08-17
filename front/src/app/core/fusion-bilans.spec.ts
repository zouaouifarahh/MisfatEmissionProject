import { describe, it, expect } from 'vitest';

import {
  BilanCarbone,
  IdentitePerimetre,
  PosteBilan,
  ScopeBilan,
  fusionnerBilans
} from './bilan-carbone.service';

/**
 * Consolidation de plusieurs bilans en un seul.
 *
 * <p>Un pays d'implantation peut réunir plusieurs sociétés — la Tunisie en
 * compte trois — et le serveur n'agrège que par société. Ces bancs verrouillent
 * la règle qui s'y joue : les émissions s'additionnent, les pourcentages se
 * recalculent. Sommer des quotes-parts donnerait des totaux au-delà de 100 %.</p>
 */
describe('fusionnerBilans', () => {

  const identite: IdentitePerimetre = {
    libelleSociete: 'Tunisie — 3 sociétés',
    pays: 'Tunisie',
    devise: 'TND',
    annee: 2026,
    libelleExercice: '2026'
  };

  /** Poste de test, avec des parts délibérément déjà calculées. */
  function poste(id: string, emissionKg: number, scope: 'SCOPE_1' | 'SCOPE_2',
                 lignes = 1, origines: PosteBilan['origines'] = ['Base de données']): PosteBilan {
    return {
      id,
      libelle: id,
      icone: '•',
      collecte: emissionKg > 0,
      scopeCode: scope,
      scopeNom: scope,
      scopeCouleur: '#000',
      emissionKg,
      lignes,
      pctScope: 100,
      pctTotal: 100,
      origines
    };
  }

  function scope(code: 'SCOPE_1' | 'SCOPE_2', emissionKg: number, postes: PosteBilan[]): ScopeBilan {
    return {
      id: code.toLowerCase(),
      code,
      nom: code,
      soustitre: '',
      couleur: '#000',
      emissionKg,
      pct: 100,
      postes
    };
  }

  /** Bilan d'une société : un poste par scope. */
  function bilan(s1: number, s2: number, options: Partial<BilanCarbone> = {}): BilanCarbone {
    const p1 = poste('combustion', s1, 'SCOPE_1');
    const p2 = poste('electricite', s2, 'SCOPE_2');

    return {
      entityId: 1,
      annee: 2026,
      libelleSociete: 'Société',
      libelleExercice: '2026',
      pays: 'Tunisie',
      devise: 'TND',
      totalKg: s1 + s2,
      scope1Kg: s1,
      scope2Kg: s2,
      scope3Kg: 0,
      mesures: 2,
      scopes: [scope('SCOPE_1', s1, [p1]), scope('SCOPE_2', s2, [p2])],
      postes: [p1, p2],
      horsNomenclature: [],
      serveurJoignable: true,
      ...options
    };
  }

  it('additionne les émissions des sociétés du pays', () => {
    const fusion = fusionnerBilans([bilan(1_000, 3_000), bilan(500, 500)], identite);

    expect(fusion.scope1Kg).toBe(1_500);
    expect(fusion.scope2Kg).toBe(3_500);
    expect(fusion.totalKg).toBe(5_000);
    expect(fusion.mesures).toBe(4);
  });

  it('recalcule les quotes-parts au lieu de les additionner', () => {
    const fusion = fusionnerBilans([bilan(1_000, 3_000), bilan(500, 500)], identite);

    // Les bilans d'entrée portaient 100 % sur chaque poste : les sommer aurait
    // donné 200 %. Les parts consolidées valent 30 % et 70 %.
    const scope1 = fusion.scopes.find(s => s.code === 'SCOPE_1')!;
    const scope2 = fusion.scopes.find(s => s.code === 'SCOPE_2')!;

    expect(scope1.pct).toBeCloseTo(30, 6);
    expect(scope2.pct).toBeCloseTo(70, 6);
    expect(scope1.pct + scope2.pct).toBeCloseTo(100, 6);
  });

  it('cumule un même poste porté par plusieurs sociétés', () => {
    const fusion = fusionnerBilans([bilan(1_000, 3_000), bilan(500, 500)], identite);

    const electricite = fusion.postes.find(p => p.id === 'electricite')!;
    expect(electricite.emissionKg).toBe(3_500);
    expect(electricite.lignes).toBe(2);
    expect(electricite.pctTotal).toBeCloseTo(70, 6);

    // Une seule ligne par poste dans la vue consolidée, jamais un doublon.
    expect(fusion.postes.filter(p => p.id === 'electricite')).toHaveLength(1);
  });

  it('rend la part dans le scope cohérente entre les deux vues du même poste', () => {
    const fusion = fusionnerBilans([bilan(1_000, 3_000), bilan(500, 500)], identite);

    const platte = fusion.postes.find(p => p.id === 'electricite')!;
    const dansScope = fusion.scopes.find(s => s.code === 'SCOPE_2')!.postes
      .find(p => p.id === 'electricite')!;

    expect(platte.pctScope).toBeCloseTo(dansScope.pctScope, 6);
    expect(dansScope.pctScope).toBeCloseTo(100, 6);
  });

  it('porte l\'identité du périmètre consolidé, non celle d\'une société', () => {
    const fusion = fusionnerBilans([bilan(1_000, 3_000), bilan(500, 500)], identite);

    expect(fusion.entityId).toBeNull();
    expect(fusion.libelleSociete).toBe('Tunisie — 3 sociétés');
    expect(fusion.pays).toBe('Tunisie');
    expect(fusion.devise).toBe('TND');
    expect(fusion.annee).toBe(2026);
  });

  it('déclare le serveur injoignable dès qu\'une société l\'était', () => {
    const fusion = fusionnerBilans(
      [bilan(1_000, 3_000), bilan(500, 500, { serveurJoignable: false })],
      identite
    );

    // Un rapport consolidé dont une société repose sur les seuls relevés
    // locaux doit le dire, sans quoi il se présenterait comme complet.
    expect(fusion.serveurJoignable).toBe(false);
  });

  it('cumule les postes hors nomenclature de même libellé', () => {
    const hors = { libelle: 'Poste inconnu', scopeCode: 'SCOPE_1', emissionKg: 200 };
    const fusion = fusionnerBilans(
      [bilan(1_000, 0, { horsNomenclature: [hors] }),
       bilan(0, 0, { horsNomenclature: [{ ...hors, emissionKg: 300 }] })],
      identite
    );

    expect(fusion.horsNomenclature).toHaveLength(1);
    expect(fusion.horsNomenclature[0].emissionKg).toBe(500);
  });

  it('ne divise pas par zéro sur un périmètre sans émission', () => {
    const fusion = fusionnerBilans([bilan(0, 0), bilan(0, 0)], identite);

    expect(fusion.totalKg).toBe(0);
    expect(fusion.scopes.every(s => s.pct === 0)).toBe(true);
    expect(fusion.postes.every(p => p.pctTotal === 0 && p.pctScope === 0)).toBe(true);
  });
});
