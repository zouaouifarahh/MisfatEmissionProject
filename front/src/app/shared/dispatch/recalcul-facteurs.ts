import { Injectable, inject } from '@angular/core';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { CLES_PAR_CATEGORIE } from './mesures-locales';

/**
 * Reprise des lignes restées sans facteur.
 *
 * <p>Une ligne enregistrée alors que sa catégorie n'était pas documentée porte
 * « non résolu » et pèse zéro. Le référentiel une fois complété, elle ne se
 * recalcule pas d'elle-même : rien ne la relit. Ce service la reprend, une
 * fois, au démarrage.</p>
 */

/** Motif de catégorie du référentiel, par écran. */
const MOTIFS: Record<string, RegExp> = {
  'combustion-etablissements': /company owned|stationary|combustion/i,
  'combustion-vehicules': /company owned (cars|vehicles)|mobile/i,
  'emissions-refrigerants': /refrigerant|fugitive/i,
  'electricite-achetee': /energy|electricity/i,
  'biens-services': /Category 1\b/i,
  'biens-equipement': /Category 2\b/i,
  'energie': /Category 3\b/i,
  'transport-amont': /Category 4\b/i,
  'dechets': /Category 5\b/i,
  'voyages-affaires': /Category 6\b/i,
  'deplacements-employes': /Category 7\b/i,
  'actifs-loues-amont': /Category 8\b/i,
  'transport-aval': /Category 9\b|Shipping/i,
  'transformation-produits': /Category 10\b/i,
  'utilisation-produits': /Category 11\b/i,
  'fin-de-vie-produits': /Category 12\b/i,
  'actifs-loues-aval': /Category 13\b/i,
  'franchises': /Category 14\b/i,
  'investissements': /Category 15\b/i
};

/**
 * Champs susceptibles de porter la grandeur à valoriser, du plus précis au
 * plus général. Les modèles diffèrent d'un écran à l'autre.
 */
const CHAMPS_QUANTITE = [
  'quantite', 'grandeur', 'quantiteTotale', 'consommation', 'consommationEstimee',
  'tonneKm', 'kmAnnuels', 'distanceKm', 'montant'
];

export interface BilanRecalcul {
  categorie: string;
  reprises: number;
  emissionKg: number;
  /**
   * Lignes non reprises, par motif.
   *
   * <p>{@code sansCandidat} vaut -1 quand c'est la catégorie entière qui n'a
   * aucun facteur au référentiel : aucune de ses lignes n'est alors même
   * examinée.</p>
   */
  ecartees: { sansQuantite: number; sansCandidat: number; total: number };
}

@Injectable({ providedIn: 'root' })
export class RecalculFacteursService {

  private readonly referentialService = inject(ReferentialService);

  /** Une seule reprise par session : elle n'a pas à se rejouer. */
  private dejaFait = false;

  /**
   * Reprend les lignes sans facteur de tous les écrans.
   *
   * <p>Ne touche qu'aux lignes réellement dépourvues de facteur : une ligne
   * déjà valorisée, fût-ce par un repli, garde sa valeur. Les lignes issues de
   * la ventilation (identifiant négatif) sont ignorées, le magasin les
   * recalculant lui-même.</p>
   */
  reprendreLignesNonResolues(): Promise<BilanRecalcul[]> {
    if (this.dejaFait || typeof localStorage === 'undefined') return Promise.resolve([]);
    this.dejaFait = true;

    return new Promise(resoudre => {
      this.referentialService.getFactorsByCategory(/./).subscribe({
        next: facteurs => resoudre(this.appliquer(facteurs ?? [])),
        // Référentiel injoignable : rien n'est modifié, la reprise se retentera
        // au prochain démarrage.
        error: () => { this.dejaFait = false; resoudre([]); }
      });
    });
  }

  private appliquer(facteurs: FacteurDetaille[]): BilanRecalcul[] {
    const bilan: BilanRecalcul[] = [];
    if (!facteurs.length) return bilan;

    for (const [categorie, cle] of Object.entries(CLES_PAR_CATEGORIE)) {
      const motif = MOTIFS[categorie];
      if (!motif) continue;

      const candidats = facteurs.filter(f => motif.test(f.categoryName ?? ''));
      if (!candidats.length) {
        bilan.push({
          categorie, reprises: 0, emissionKg: 0,
          ecartees: { sansQuantite: 0, sansCandidat: -1, total: -1 }
        });
        continue;
      }

      let lignes: Record<string, unknown>[];
      try {
        const brut = localStorage.getItem(cle);
        if (!brut) continue;
        const relu = JSON.parse(brut);
        if (!Array.isArray(relu) || !relu.length) continue;
        lignes = relu;
      } catch {
        continue;
      }

      let reprises = 0;
      let emissionKg = 0;
      let sansQuantite = 0;

      for (const ligne of lignes) {
        if (Number(ligne['id'] ?? 0) < 0) continue;
        if (Number(ligne['facteur']) > 0) continue;

        const quantite = this.grandeurDe(ligne);
        // Aucune grandeur exploitable : la ligne est laissée telle quelle
        // plutôt que valorisée au hasard.
        if (quantite === null || quantite <= 0) { sansQuantite++; continue; }

        const monetaire = String(ligne['typeDonnee'] ?? '').toUpperCase().startsWith('MONET')
          || Number(ligne['montant']) > 0;

        const facteur = candidats.find(
          f => (f.dataType ?? '').toUpperCase() === (monetaire ? 'MONETAIRE' : 'PHYSIQUE')
        ) ?? candidats[0];

        const emission = quantite * facteur.factorValue;
        if (!Number.isFinite(emission)) continue;

        ligne['facteur'] = facteur.factorValue;
        ligne['uniteFacteur'] = facteur.currency ?? facteur.unit;
        ligne['libelleFacteur'] = facteur.typeName;
        ligne['baseAppliquee'] = facteur.databaseSource;
        ligne['databaseSource'] = facteur.databaseSource;
        ligne['origineFacteur'] = /repli|ademe|fallback/i.test(facteur.databaseSource ?? '')
          ? 'ADEME Fallback'
          : 'MS SQL BDD';
        ligne['emissionCalculee'] = emission;

        reprises++;
        emissionKg += emission;
      }

      const ecartees = { sansQuantite, sansCandidat: 0, total: sansQuantite };

      // Une catégorie sans reprise figure quand même au bilan : c'est elle
      // qui dira à l'utilisateur ce qui reste à compléter.
      if (!reprises) {
        bilan.push({ categorie, reprises: 0, emissionKg: 0, ecartees });
        continue;
      }

      try {
        localStorage.setItem(cle, JSON.stringify(lignes));
        bilan.push({ categorie, reprises, emissionKg, ecartees });
      } catch {
        // Quota atteint : les lignes restent en l'état plutôt qu'à moitié
        // réécrites, ce qui vaut mieux qu'un stockage incohérent.
      }
    }

    return bilan;
  }

  /** Première grandeur exploitable d'une ligne, quel que soit son modèle. */
  private grandeurDe(ligne: Record<string, unknown>): number | null {
    for (const champ of CHAMPS_QUANTITE) {
      const valeur = Number(ligne[champ]);
      if (Number.isFinite(valeur) && valeur > 0) return valeur;
    }
    return null;
  }
}
