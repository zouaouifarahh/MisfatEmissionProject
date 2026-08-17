/**
 * Relevé des mesures saisies dans les écrans de catégorie.
 *
 * <p>Chaque écran conserve ses lignes dans le stockage du navigateur, sous sa
 * propre clé. Le tableau de bord, lui, n'interroge que le serveur : une
 * catégorie renseignée à l'écran mais absente de la base y resterait donc à
 * zéro. Ce relevé comble l'écart, sans rien remplacer : il ne sert de repli
 * que là où le serveur ne rapporte rien.</p>
 *
 * <p>Le périmètre consulté — société et exercice — s'applique ici sans
 * indulgence : les règles de rattachement vivent dans {@link ../../core/perimetre}
 * et sont les mêmes pour toutes les vues.</p>
 */

import {
  ORGANISATION_GROUPE,
  PerimetreOrganisation,
  releveDuPerimetre
} from '../../core/perimetre';

/** Clé de stockage de chaque catégorie, par identifiant d'écran. */
export const CLES_PAR_CATEGORIE: Record<string, string> = {
  'combustion-etablissements': 'listeEmissions',
  'combustion-vehicules': 'listeEmissionsVehicules',
  'emissions-refrigerants': 'listeEmissionsRefrigerants',

  'electricite-achetee': 'listeEmissionsElectricite',

  'biens-services': 'listeEmissionsAchats',
  'biens-equipement': 'listeEmissionsBiensEquipement',
  'energie': 'listeEmissionsEnergie',
  'transport-amont': 'listeEmissionsTransportAmont',
  'dechets': 'listeEmissionsDechets',
  'voyages-affaires': 'listeEmissionsVoyages',
  'deplacements-employes': 'listeEmissionsDeplacements',
  'actifs-loues-amont': 'listeEmissionsActifsLoues',
  'transport-aval': 'listeEmissionsTransportAval',
  'transformation-produits': 'listeEmissionsTransformation',
  'utilisation-produits': 'listeEmissionsUtilisation',
  'fin-de-vie-produits': 'listeEmissionsFinDeVie',
  'actifs-loues-aval': 'listeEmissionsActifsAval',
  'franchises': 'listeEmissionsFranchises',
  'investissements': 'listeEmissionsInvestissements'
};

/** Scope auquel chaque catégorie se rattache. */
export const SCOPE_PAR_CATEGORIE: Record<string, 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3'> = {
  'combustion-etablissements': 'SCOPE_1',
  'combustion-vehicules': 'SCOPE_1',
  'emissions-refrigerants': 'SCOPE_1',
  'electricite-achetee': 'SCOPE_2'
};

/** Total d'une catégorie, en kgCO₂e, tel que l'écran l'a enregistré. */
export interface TotalCategorie {
  categorie: string;
  scope: 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3';
  lignes: number;
  emissionKg: number;
}

/** Lignes d'une catégorie relues telles quelles dans le stockage. */
function relire(cle: string): Record<string, unknown>[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return [];
    const relu = JSON.parse(brut);
    return Array.isArray(relu) ? relu : [];
  } catch {
    return [];
  }
}

/**
 * Lignes d'une catégorie retenues pour le périmètre consulté.
 *
 * <p>Les lignes ventilées portent un identifiant négatif : elles sont déjà
 * comptées par le magasin de répartition et seraient sinon comptées deux
 * fois.</p>
 */
export function lignesLocales(
  categorie: string,
  exercice: number | null = null,
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): Record<string, unknown>[] {
  const cle = CLES_PAR_CATEGORIE[categorie];
  if (!cle) return [];

  return relire(cle)
    .filter(ligne => Number(ligne['id'] ?? 0) >= 0)
    .filter(ligne => releveDuPerimetre(ligne, exercice, organisation));
}

/**
 * Totaux par catégorie, relevés dans le stockage du navigateur.
 *
 * <p>Une catégorie dont aucune ligne ne relève du périmètre n'est pas
 * rapportée : la donner tout de même reviendrait à porter au bilan d'un
 * exercice des mesures qui documentent un autre millésime, ou celles d'une
 * autre société.</p>
 */
export function totauxLocaux(
  exercice: number | null = null,
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): TotalCategorie[] {
  if (typeof localStorage === 'undefined') return [];

  const totaux: TotalCategorie[] = [];

  for (const categorie of Object.keys(CLES_PAR_CATEGORIE)) {
    const retenues = lignesLocales(categorie, exercice, organisation);
    if (!retenues.length) continue;

    const emissionKg = retenues.reduce(
      (somme, ligne) => somme + (Number(ligne['emissionCalculee']) || 0), 0
    );

    totaux.push({
      categorie,
      scope: SCOPE_PAR_CATEGORIE[categorie] ?? 'SCOPE_3',
      lignes: retenues.length,
      emissionKg
    });
  }

  return totaux;
}

/**
 * Totaux relevés par établissement, en kgCO₂e.
 *
 * <p>Les écrans nomment l'usine, jamais la filiale : c'est au tableau de bord
 * de faire le rapprochement, lui seul connaissant l'organigramme. Les lignes
 * sans établissement sont regroupées sous la chaîne vide, et resteront
 * « non affectées » faute d'un rattachement que rien ne permet de deviner.</p>
 */
export function totauxLocauxParEtablissement(
  exercice: number | null = null,
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): Map<string, number> {
  const parEtablissement = new Map<string, number>();
  if (typeof localStorage === 'undefined') return parEtablissement;

  for (const categorie of Object.keys(CLES_PAR_CATEGORIE)) {
    for (const ligne of lignesLocales(categorie, exercice, organisation)) {
      const emission = Number(ligne['emissionCalculee']) || 0;
      if (!emission) continue;

      const usine = String(ligne['etablissement'] ?? '').trim();
      parEtablissement.set(usine, (parEtablissement.get(usine) ?? 0) + emission);
    }
  }

  return parEtablissement;
}
