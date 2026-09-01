import {
  PerimetreOrganisation, ORGANISATION_GROUPE,
  releveDeLExercice, releveDeLaSociete, ligneRattachable
} from '../../core/perimetre';

/**
 * Cloisonnement des tableaux de mesure : société et exercice.
 *
 * <p>Les dix-neuf écrans de saisie affichaient toutes leurs lignes, quel que
 * soit le périmètre choisi dans l'en-tête. Sélectionner « MISFAT TUNISIE » et
 * « 2025 » laissait donc voir les mesures du Maroc et celles de 2026, alors que
 * le tableau de bord, lui, les écartait. Les deux vues d'une même donnée ne
 * s'accordaient pas, et c'est l'écran de saisie qui avait tort — c'est là qu'on
 * corrige une ligne, et corriger la ligne d'une autre société est une faute
 * qu'aucun message ne rattrape ensuite.</p>
 *
 * <p>Les règles de rattachement ne sont pas réécrites ici : elles vivent dans
 * {@link ../../core/perimetre} et valent pour toutes les vues. Ce module ne
 * fait que les appliquer à une liste, et compter ce qu'elles écartent.</p>
 */

/** Ce qu'un écran retient du périmètre, et ce qu'il en écarte. */
export interface TriPerimetre<T> {
  /** Lignes qui relèvent du périmètre consulté. */
  retenues: T[];
  /** Écartées parce qu'elles appartiennent à une autre société. */
  autreSociete: number;
  /** Écartées parce qu'elles documentent un autre exercice. */
  autreExercice: number;
  /**
   * Retenues faute de pouvoir les rattacher : ni société, ni établissement.
   *
   * <p>Elles restent visibles. Les masquer les ferait passer pour perdues, et
   * elles sont peut-être celles de la société consultée — rien ne permet de
   * l'affirmer, mais rien ne permet non plus de le nier.</p>
   */
  sansRattachement: number;
}

/**
 * Compose un périmètre organisationnel à partir de l'état d'un écran.
 *
 * @param entityId       société consultée ; `null` en vue groupe.
 * @param etablissements usines de cette société, telles que l'écran les connaît.
 * @param nombreDeSocietes  effectif du groupe, qui décide du sort des lignes
 *                          non rattachées : à une société près, il n'y a pas
 *                          d'ambiguïté à lever.
 */
export function perimetreOrganisation(
  entityId: number | null,
  etablissements: readonly string[],
  nombreDeSocietes: number
): PerimetreOrganisation {

  if (entityId === null) return ORGANISATION_GROUPE;

  return {
    entityId,
    etablissements: [...etablissements],
    societeUnique: nombreDeSocietes <= 1
  };
}

/**
 * Applique le périmètre à une liste de lignes.
 *
 * <p>Une ligne qu'aucun rattachement ne désigne est <strong>conservée</strong>
 * et comptée à part. C'est le seul écart à la règle stricte, et il est
 * délibéré : les lignes saisies avant l'estampillage de la société n'en portent
 * aucune, et plusieurs écrans ne demandent pas d'établissement. Les écarter
 * viderait ces tableaux d'un coup, sans que rien ne distingue une donnée
 * cloisonnée d'une donnée disparue.</p>
 */
export function trierParPerimetre<T extends object>(
  lignes: readonly T[],
  exercice: number | null,
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): TriPerimetre<T> {

  const tri: TriPerimetre<T> = {
    retenues: [], autreSociete: 0, autreExercice: 0, sansRattachement: 0
  };

  for (const ligne of lignes ?? []) {
    // Les écrans déclarent leurs lignes par des interfaces nommées, sans index :
    // la lecture par champ passe donc par une vue générique. Les règles, elles,
    // restent celles du périmètre — elles ne sont pas réécrites ici.
    const champs = ligne as unknown as Record<string, unknown>;

    if (!releveDeLExercice(champs, exercice)) { tri.autreExercice++; continue; }

    if (!ligneRattachable(champs)) {
      if (organisation.entityId !== null) tri.sansRattachement++;
      tri.retenues.push(ligne);
      continue;
    }

    if (!releveDeLaSociete(champs, organisation)) { tri.autreSociete++; continue; }

    tri.retenues.push(ligne);
  }

  return tri;
}
