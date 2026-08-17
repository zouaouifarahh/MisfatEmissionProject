import { FacteurDetaille } from '../../services/referential.service';

/**
 * Rapprochement d'une ligne de déchet et d'un facteur du référentiel carbone.
 *
 * <p>Fonctions pures : la saisie manuelle, l'estimation et l'import empruntent
 * exactement le même chemin.</p>
 */

/** Filières de traitement rencontrées dans les relevés d'exploitation. */
export const FILIERES = [
  'Recyclage interne',
  'Recyclage externe',
  'Non recyclé',
  'Incinération',
  'Enfouissement / Décharge',
  'Traitement spécialisé'
] as const;

export type Filiere = typeof FILIERES[number] | 'Non précisée';

/**
 * Ramène un libellé de traitement à une filière connue.
 *
 * <p>Le relevé note « En externe », « En interne », « Non recyclé » ou « Non » :
 * autant de formulations pour trois situations.</p>
 */
export function normaliserFiliere(brut: string): Filiere {
  const texte = (brut ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (/interne/.test(texte)) return 'Recyclage interne';
  if (/externe/.test(texte)) return 'Recyclage externe';
  if (/incin/.test(texte)) return 'Incinération';
  if (/enfoui|decharge/.test(texte)) return 'Enfouissement / Décharge';
  if (/special|dangereux/.test(texte)) return 'Traitement spécialisé';
  return 'Non recyclé';
}

/** Une filière de recyclage évite l'émission d'un traitement de fin de vie. */
export function estRecyclage(filiere: Filiere): boolean {
  return filiere === 'Recyclage interne' || filiere === 'Recyclage externe';
}

export interface CritereFacteurDechet {
  /** Unité canonique de la quantité : Tonne, L, m³, Pc, kg. */
  unite: string;
  filiere: Filiere;
  /** `true` pour valoriser un coût de traitement plutôt qu'une quantité. */
  monetaire?: boolean;
}

/**
 * Facteurs crédibles pour une ligne de déchet, du mieux noté au moins bon.
 *
 * <p>L'unité prime : un facteur exprimé à la tonne ne peut pas valoriser des
 * litres. La filière n'intervient qu'ensuite, et seulement si le référentiel la
 * documente.</p>
 */
export function classerFacteursDechet(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurDechet
): FacteurDetaille[] {

  if (!Array.isArray(facteurs) || !facteurs.length) return [];

  const typeAttendu = critere.monetaire ? 'MONETAIRE' : 'PHYSIQUE';
  const unite = normaliserPourComparaison(critere.unite);

  // Une unité indéterminée n'autorise aucun rapprochement : valoriser à la
  // tonne un relevé qui compte peut-être des pièces se tromperait d'un facteur
  // mille. La ligne est laissée sans facteur, et signalée comme telle.
  if (!unite && !critere.monetaire) return [];

  const notes = facteurs
    .filter(f => (f.dataType ?? '').toUpperCase() === typeAttendu)
    // L'unité prime : un facteur à la tonne ne valorise pas des litres.
    .filter(f => !unite || normaliserPourComparaison(f.unit) === unite)
    .map(facteur => {
      let note = 100;

      const libelle = (facteur.typeName ?? '').toLowerCase();
      if (estRecyclage(critere.filiere) && /recycl/.test(libelle)) note += 30;
      if (!estRecyclage(critere.filiere) && /landfill|incinerat|disposal/.test(libelle)) note += 30;

      // À libellé égal, le millésime le plus récent prime.
      note += Math.min(facteur.referenceYear ?? 0, 2100) / 10000;

      return { facteur, note };
    });

  return notes.sort((a, b) => b.note - a.note).map(n => n.facteur);
}

export function choisirFacteurDechet(
  facteurs: FacteurDetaille[],
  critere: CritereFacteurDechet
): FacteurDetaille | null {
  return classerFacteursDechet(facteurs, critere)[0] ?? null;
}

function normaliserPourComparaison(unite: string): string {
  const texte = (unite ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();

  if (/^(t|tonne|tonnes)$/.test(texte)) return 'tonne';
  if (/^(l|litre|litres)$/.test(texte)) return 'l';
  if (/^(m3)$/.test(texte)) return 'm3';
  if (/^(pc|pcs|piece|pieces)$/.test(texte)) return 'pc';
  return texte;
}

/** Émissions d'une ligne de déchet : quantité totale × facteur. */
export function calculerEmissionDechet(quantite: number | null, facteur: number | null): number {
  if (quantite === null || facteur === null) return 0;
  const emission = quantite * facteur;
  return Number.isFinite(emission) ? emission : 0;
}
