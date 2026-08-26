import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { DonutRepartitionComponent, PartRepartition } from './donut-repartition';

/**
 * Anneau de répartition : tracé, légende et encodages secondaires.
 *
 * <p>Les trois teintes de scope du produit — vert, orange, bleu — se séparent
 * de 6,9 ΔE en deutéranopie : au-dessus du plancher de 6, sous la cible de 8.
 * À cette distance la couleur seule ne porte pas l'identité, et deux choses la
 * secondent : un écart entre les arcs et une légende qui nomme chaque part.
 * Ces bancs les verrouillent — les perdre rendrait le graphique illisible pour
 * un lecteur sur douze, sans que rien ne le signale.</p>
 */
describe('Anneau de répartition', () => {

  const PARTS: PartRepartition[] = [
    { libelle: 'Scope 1 · Direct', valeurKg: 5_321, pct: 0, couleur: '#16a34a' },
    { libelle: 'Scope 2 · Énergie', valeurKg: 2_636, pct: 0, couleur: '#ea580c' }
  ];

  let fixture: ReturnType<typeof TestBed.createComponent<DonutRepartitionComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DonutRepartitionComponent] })
      .compileComponents();

    fixture = TestBed.createComponent(DonutRepartitionComponent);
  });

  const monter = (parts: PartRepartition[]) => {
    fixture.componentInstance.parts = parts;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  describe('tracé', () => {

    it('trace un arc par part chiffrée', () => {
      const hote = monter(PARTS);
      expect(hote.querySelectorAll('.dnt-arc')).toHaveLength(2);
    });

    it('rapporte chaque part au total tracé', () => {
      monter(PARTS);
      const arcs = fixture.componentInstance.arcs;

      // 5 321 sur 7 957 : les deux parts se partagent le cercle entier.
      expect(arcs[0].pct).toBeCloseTo(66.87, 1);
      expect(arcs[1].pct).toBeCloseTo(33.13, 1);
      expect(arcs[0].pct + arcs[1].pct).toBeCloseTo(100, 6);
    });

    it('écarte les arcs les uns des autres', () => {
      monter(PARTS);
      const arcs = fixture.componentInstance.arcs;

      // L'écart est pris sur l'arc, jamais ajouté : la somme des longueurs
      // reste sous le cercle, et les décalages suivent les parts entières.
      const circonference = 2 * Math.PI * 62;
      const trace = arcs.reduce((somme, arc) => somme + arc.longueur, 0);

      expect(trace).toBeLessThan(circonference);
      expect(circonference - trace).toBeCloseTo(2 * arcs.length, 6);
    });

    it('n\'écarte rien quand une seule part occupe le cercle', () => {
      monter([PARTS[0]]);
      const arcs = fixture.componentInstance.arcs;

      // Un écart sur une part unique ouvrirait une brèche que rien ne sépare.
      expect(arcs[0].longueur).toBeCloseTo(2 * Math.PI * 62, 6);
    });

    it('garde un filet visible pour une part infime', () => {
      const hote = monter([
        { libelle: 'Énorme', valeurKg: 1_000_000, pct: 0, couleur: '#16a34a' },
        { libelle: 'Infime', valeurKg: 1, pct: 0, couleur: '#ea580c' }
      ]);

      // Sans plancher, l'écart mangerait la part et le cercle mentirait par
      // omission : la légende annoncerait une part que rien ne montre.
      expect(fixture.componentInstance.arcs[1].longueur).toBeGreaterThan(0);
      expect(hote.querySelectorAll('.dnt-arc')).toHaveLength(2);
    });

    it('écarte les parts nulles du tracé comme de la légende', () => {
      const hote = monter([
        ...PARTS,
        { libelle: 'Scope 3 · Chaîne de valeur', valeurKg: 0, pct: 0, couleur: '#0284c7' }
      ]);

      expect(hote.querySelectorAll('.dnt-arc')).toHaveLength(2);
      expect(hote.querySelectorAll('.dnt-legende li')).toHaveLength(2);
    });
  });

  describe('encodages secondaires', () => {

    it('nomme chaque part dans la légende, avec sa valeur et sa part', () => {
      const hote = monter(PARTS);
      const entrees = hote.querySelectorAll('.dnt-legende li');

      expect(entrees).toHaveLength(2);
      expect(entrees[0].textContent).toContain('Scope 1 · Direct');
      expect(entrees[0].textContent).toContain('5,32');
      expect(entrees[0].textContent).toContain('66,9');
    });

    it('tient les nombres dans une seule convention décimale', () => {
      // Le pipe `number` suit la locale enregistrée — l'anglaise — et rendait
      // « 66.9 % » à côté de « 5,32 t ». Deux séparateurs dans la même ligne
      // font douter du nombre avant de faire douter du logiciel.
      const hote = monter(PARTS);
      const ligne = hote.querySelector('.dnt-legende li')?.textContent ?? '';

      expect(ligne).not.toMatch(/\d\.\d/);
    });

    it('porte une légende dès qu\'il y a deux parts', () => {
      // L'identité ne doit jamais reposer sur la seule couleur.
      const hote = monter(PARTS);
      expect(hote.querySelector('.dnt-legende')).toBeTruthy();
    });

    it('décrit chaque arc pour le survol et les lecteurs d\'écran', () => {
      const hote = monter(PARTS);

      const titres = [...hote.querySelectorAll('.dnt-arc title')].map(n => n.textContent);
      expect(titres[0]).toContain('Scope 1 · Direct');
      expect(titres[0]).toContain('tCO₂e');
    });

    it('porte une alternative textuelle sur le tracé', () => {
      fixture.componentInstance.alternative = 'Répartition par scope';
      const hote = monter(PARTS);

      expect(hote.querySelector('svg')?.getAttribute('aria-label'))
        .toBe('Répartition par scope');
    });
  });

  describe('lisibilité des nombres', () => {

    it('donne deux décimales sous dix tonnes, aucune au-delà du millier', () => {
      const composant = fixture.componentInstance;

      // Un bilan de 7,96 t perdrait tout son sens arrondi à 8 ; un bilan de
      // 32 245 t n'a que faire de ses centièmes.
      expect(composant.enTonnes(7_957)).toContain('7,96');
      expect(composant.enTonnes(324_450)).toContain('324,5');
      expect(composant.enTonnes(32_244_619)).not.toContain(',');
    });
  });

  describe('sans rien à tracer', () => {

    it('dit pourquoi plutôt que de rendre un cercle vide', () => {
      fixture.componentInstance.messageVide = 'Aucune émission chiffrée.';
      const hote = monter([]);

      expect(hote.querySelector('svg')).toBeNull();
      expect(hote.textContent).toContain('Aucune émission chiffrée.');
    });
  });
});
