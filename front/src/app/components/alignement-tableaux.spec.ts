import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Alignement des colonnes, du pied et de la ligne vide.
 *
 * <p>Deux colonnes ont été ajoutées aux tableaux — Référence carbone et Code
 * article ERP — sans que les {@code colspan} suivent. La bande sombre du total
 * s'arrêtait avant la dernière colonne, et le montant ne tombait plus sous
 * « Émissions ».</p>
 *
 * <p>Ce banc lit les gabarits eux-mêmes plutôt que de monter les composants :
 * le défaut est structurel et se voit dans le balisage. Il vaut garde-fou pour
 * toute colonne ajoutée plus tard — l'oubli d'un colspan se paierait autrement
 * par un tableau désaligné que rien ne signale.</p>
 */
describe('Alignement des tableaux', () => {

  const RACINE = 'src/app/components';

  /**
   * Tableaux de données, un par balise {@code <table>}.
   *
   * <p>Le découpage par tableau, et non par fichier : l'écran d'import en porte
   * deux, et comparer l'entête de l'un au pied de l'autre ferait crier au
   * décalage là où il n'y en a pas.</p>
   */
  const tableaux = readdirSync(RACINE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(dossier => readdirSync(`${RACINE}/${dossier.name}`)
      .filter(f => f.endsWith('.html'))
      .map(f => ({ ecran: dossier.name, chemin: `${RACINE}/${dossier.name}/${f}` })))
    .flatMap(({ ecran, chemin }) => {
      const fichier = readFileSync(chemin, 'utf8');

      return [...fichier.matchAll(/<table[\s\S]*?<\/table>/g)].map((bloc, rang) => {
        const html = bloc[0];
        const thead = html.match(/<thead>([\s\S]*?)<\/thead>/);
        if (!thead) return null;

        // Les vraies colonnes : « <th » suivi d'un espace ou d'un chevron, ce
        // qui écarte la balise <thead> elle-même.
        const colonnes = [...thead[1].matchAll(/<th(?=[\s>])[\s\S]*?<\/th>/g)].length;
        const nom = rang === 0 ? ecran : `${ecran} (tableau ${rang + 1})`;

        return colonnes >= 3 ? { ecran: nom, html, colonnes } : null;
      });
    })
    .filter((t): t is { ecran: string; html: string; colonnes: number } => t !== null);

  it('trouve les tableaux de collecte', () => {
    // Si l'inventaire se vide, les bancs qui suivent passeraient sans rien
    // vérifier : le décompte l'empêche.
    expect(tableaux.length).toBeGreaterThan(10);
  });

  for (const { ecran, html, colonnes } of tableaux) {

    it(`${ecran} — la bande du total couvre toute la largeur`, () => {
      const pied = html.match(/<tfoot[\s\S]*?<\/tfoot>/);
      if (!pied) return;

      const cellules = [...pied[0].matchAll(/<td(?=[\s>])([^>]*)>/g)];
      const largeur = cellules.reduce((somme, cellule) => {
        const span = cellule[1].match(/colspan="(\d+)"/);
        return somme + (span ? Number(span[1]) : 1);
      }, 0);

      expect(largeur).toBe(colonnes);
    });

    it(`${ecran} — la ligne « aucune donnée » couvre toute la largeur`, () => {
      const vide = html.match(/<td[^>]*class="empty-table-msg"[^>]*>/)
        ?? html.match(/<td[^>]*empty-table-msg[^>]*>/);
      if (!vide) return;

      const span = vide[0].match(/colspan="(\d+)"/);
      expect(span).not.toBeNull();
      expect(Number(span![1])).toBe(colonnes);
    });
  }
});
