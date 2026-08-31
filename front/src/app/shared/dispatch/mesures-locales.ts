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

import { Observable, Subject } from 'rxjs';

import {
  ORGANISATION_GROUPE,
  PerimetreOrganisation,
  exercicesDeLaLigne,
  releveDuPerimetre
} from '../../core/perimetre';

/**
 * Annonce des saisies d'écran, pour les vues qui les agrègent.
 *
 * <p>Les écrans de collecte écrivent leurs lignes dans le stockage du
 * navigateur ; le tableau de bord les y relit. Rien ne l'avertissait d'une
 * écriture : ses cartes restaient sur le compte du dernier chargement, et une
 * mesure enregistrée n'apparaissait qu'au changement de filtre ou au
 * rafraîchissement de la page. Le poste paraissait rester à zéro.</p>
 *
 * <p>Un sujet de module plutôt qu'un service : ce signal n'a ni état ni
 * dépendance, et le faire injecter obligerait vingt écrans à recevoir un
 * service pour émettre un événement sans donnée.</p>
 */
const mesuresModifiees = new Subject<void>();

/** Flux des modifications de saisie, tous écrans confondus. */
export const mesuresLocalesModifiees$: Observable<void> = mesuresModifiees.asObservable();

/**
 * Annonce qu'un écran vient d'écrire ses lignes.
 *
 * <p>L'événement ne porte pas ce qui a changé : les vues relisent le stockage,
 * qui fait foi. Porter un délta obligerait à le tenir juste, et un délta faux
 * est pire qu'une relecture.</p>
 */
export function signalerMesuresLocalesModifiees(): void {
  mesuresModifiees.next();
}

/**
 * Écrit les lignes d'une catégorie et annonce l'écriture.
 *
 * <p>Un seul chemin pour persister une saisie : l'écran passe par là, et
 * l'annonce suit l'écriture sans qu'il ait à y penser. Chaque écran appelait
 * {@code localStorage.setItem} de son côté et aucun n'annonçait rien — le
 * tableau de bord restait donc sur le compte du dernier chargement.</p>
 *
 * <p>L'annonce vient <strong>après</strong> l'écriture : une vue prévenue trop
 * tôt relirait l'ancienne valeur et conclurait que rien n'a changé.</p>
 *
 * @returns `false` si le stockage a refusé l'écriture — quota dépassé sur une
 *          liste volumineuse —, pour que l'écran le signale plutôt que de
 *          laisser croire la ligne conservée.
 */
export function enregistrerLignes(cle: string, lignes: unknown): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    localStorage.setItem(cle, JSON.stringify(lignes));
  } catch {
    return false;
  }

  mesuresModifiees.next();
  return true;
}

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

/** Mesure saisie dont la quantité est là, mais dont l'émission reste à zéro. */
export interface MesureIncomplete {
  categorie: string;
  /** Ce que la ligne désigne, tel que l'écran l'a enregistré. */
  libelle: string;
  quantite: number;
}

/**
 * Mesures qui portent une quantité sans produire d'émission.
 *
 * <p>Le facteur n'a pas été résolu : la ligne existe, elle est comptée dans le
 * périmètre, et elle pèse zéro. Rien ne la distinguait d'une catégorie non
 * collectée — le poste affichait zéro dans les deux cas, et l'exploitant ne
 * pouvait pas savoir s'il devait saisir une donnée ou affecter un facteur.</p>
 *
 * <p>Elles ne bloquent rien : le bilan se calcule sans elles, et ce relevé sert
 * seulement à les nommer.</p>
 */
export function mesuresIncompletes(
  exercice: number | null = null,
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): MesureIncomplete[] {

  const incompletes: MesureIncomplete[] = [];

  for (const categorie of Object.keys(CLES_PAR_CATEGORIE)) {
    for (const ligne of lignesLocales(categorie, exercice, organisation)) {
      const emission = Number(ligne['emissionCalculee']) || 0;
      if (emission) continue;

      // La quantité ne porte pas le même nom d'un écran à l'autre : celle qui
      // est renseignée fait foi, et une ligne sans quantité n'est pas
      // incomplète — elle est simplement vide.
      const quantite = [ligne['quantite'], ligne['quantiteTotale'], ligne['montant'],
                        ligne['poidsKg'], ligne['distanceKm']]
        .map(valeur => Number(valeur) || 0)
        .find(valeur => valeur > 0) ?? 0;

      if (!quantite) continue;

      const libelle = [ligne['designation'], ligne['emissionSource'], ligne['reference'],
                       ligne['franchise'], ligne['etiquette']]
        .map(valeur => String(valeur ?? '').trim())
        .find(valeur => valeur.length > 0) ?? '(sans libellé)';

      incompletes.push({ categorie, libelle, quantite });
    }
  }

  return incompletes;
}

/**
 * Exercices que les mesures enregistrées documentent, tous écrans confondus.
 *
 * <p>Un tableau de bord vide sur l'exercice consulté ne dit pas si la collecte
 * reste à faire ou si la donnée est rangée sous un autre millésime. Ce relevé
 * répond à la question, sans toucher aux dates : dater une ligne d'office sur
 * l'exercice regardé la ferait compter dans tous les millésimes à la fois.</p>
 *
 * <p>La société consultée s'applique ; l'exercice, non — c'est précisément ce
 * qu'on cherche à connaître.</p>
 */
export function exercicesRenseignes(
  organisation: PerimetreOrganisation = ORGANISATION_GROUPE
): { exercice: number; lignes: number }[] {

  const parExercice = new Map<number, number>();

  for (const categorie of Object.keys(CLES_PAR_CATEGORIE)) {
    for (const ligne of lignesLocales(categorie, null, organisation)) {
      for (const exercice of exercicesDeLaLigne(ligne)) {
        parExercice.set(exercice, (parExercice.get(exercice) ?? 0) + 1);
      }
    }
  }

  return [...parExercice.entries()]
    .map(([exercice, lignes]) => ({ exercice, lignes }))
    .sort((a, b) => b.exercice - a.exercice);
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
