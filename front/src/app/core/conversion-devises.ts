/**
 * Conversion monétaire au cours de l'exercice saisi.
 *
 * <p>Un facteur monétaire est daté et libellé dans une devise : « 0,42 kgCO₂e
 * par euro 2021 ». L'appliquer tel quel à un montant en dinars de 2023 revient
 * à confondre trois choses distinctes — la devise, l'année du montant et
 * l'année du facteur. L'erreur ne se voit pas : le résultat reste un nombre
 * plausible, et il est faux d'un facteur trois.</p>
 *
 * <p>Ce module convertit le montant vers la devise du facteur, <strong>au
 * cours en vigueur à la date de la dépense</strong> et non au cours du jour.
 * Une dépense de 2023 se convertit au taux de 2023, sans quoi la variation du
 * dinar déplacerait les émissions d'exercices déjà clos.</p>
 *
 * <p>Quand le cours de l'époque manque, rien n'est converti et la ligne le
 * dit. La base MISFAT ne porte aucun cours antérieur au 1<sup>er</sup> janvier
 * 2024 : les exercices 2022 et 2023 sont concernés, et un repli silencieux sur
 * le cours du jour ferait passer une lacune pour une mesure.</p>
 */

/** Devise pivot du référentiel : les cours s'expriment face à elle. */
export const DEVISE_PIVOT = 'TND';

/** Cours d'une devise face au dinar : 1 {@link code} = {@link rate} TND. */
export interface TauxChange {
  code: string;
  rate: number | null;
  /** Début de validité, au format `AAAA-MM-JJ`. */
  validFrom: string | null;
  /** Fin de validité incluse ; `null` pour un cours toujours en vigueur. */
  validTo: string | null;
}

export type StatutConversion =
  /** Source et cible identiques : rien à convertir. */
  | 'IDENTIQUE'
  /** Converti au cours en vigueur à la date demandée. */
  | 'CONVERTI'
  /** Aucun cours ne couvre cette date : le montant est laissé tel quel. */
  | 'TAUX_ABSENT'
  /** Devise absente du référentiel. */
  | 'DEVISE_INCONNUE';

export interface ResultatConversion {
  /** Montant dans la devise cible, ou le montant d'origine si rien n'a été fait. */
  montant: number;
  devise: string;
  statut: StatutConversion;
  /** Cours appliqué, `null` en l'absence de conversion. */
  cours: number | null;
  /** Date de validité du cours retenu. */
  dateCours: string | null;
  /** Phrase destinée à l'utilisateur ; vide quand tout est normal. */
  avertissement: string;
}

/** Forme comparable d'un code devise. */
function normaliser(code: string | null | undefined): string {
  return String(code ?? '').trim().toUpperCase();
}

/** La date tombe-t-elle dans la fenêtre de validité du cours ? */
function couvre(taux: TauxChange, date: string): boolean {
  const debut = taux.validFrom ?? '';
  const fin = taux.validTo ?? '';

  if (debut && date < debut) return false;
  if (fin && date > fin) return false;
  return true;
}

/**
 * Cours d'une devise en vigueur à une date donnée.
 *
 * <p>Quand plusieurs cours couvrent la date — chevauchement de fenêtres —, le
 * plus récemment ouvert l'emporte : c'est le dernier publié.</p>
 *
 * @returns le cours, ou `null` si aucun ne couvre la date.
 */
export function coursALaDate(
  code: string | null | undefined,
  date: string,
  taux: readonly TauxChange[] | null | undefined
): TauxChange | null {

  const cible = normaliser(code);
  if (!cible || !Array.isArray(taux)) return null;

  return taux
    .filter(t => normaliser(t.code) === cible)
    .filter(t => typeof t.rate === 'number' && t.rate > 0)
    .filter(t => couvre(t, date))
    .sort((a, b) => String(b.validFrom ?? '').localeCompare(String(a.validFrom ?? '')))[0]
    ?? null;
}

/**
 * Convertit un montant d'une devise vers une autre, au cours de la date.
 *
 * <p>Le passage se fait par le dinar, devise pivot du référentiel : convertir
 * EUR → USD sans pivot supposerait un cours croisé que la base ne porte pas.</p>
 *
 * @param date jour de la dépense, au format `AAAA-MM-JJ`.
 */
export function convertirMontant(
  montant: number,
  deviseSource: string | null | undefined,
  deviseCible: string | null | undefined,
  date: string,
  taux: readonly TauxChange[] | null | undefined
): ResultatConversion {

  const source = normaliser(deviseSource) || DEVISE_PIVOT;
  const cible = normaliser(deviseCible) || DEVISE_PIVOT;

  if (source === cible) {
    return { montant, devise: cible, statut: 'IDENTIQUE', cours: null,
             dateCours: null, avertissement: '' };
  }

  // Vers le pivot d'abord : 1 source = coursSource TND.
  let enPivot = montant;
  let coursApplique: number | null = null;
  let dateCours: string | null = null;

  if (source !== DEVISE_PIVOT) {
    const trouve = coursALaDate(source, date, taux);
    if (!trouve) return manquant(montant, source, date, taux, deviseSource);

    enPivot = montant * trouve.rate!;
    coursApplique = trouve.rate!;
    dateCours = trouve.validFrom;
  }

  if (cible === DEVISE_PIVOT) {
    return { montant: enPivot, devise: cible, statut: 'CONVERTI',
             cours: coursApplique, dateCours, avertissement: '' };
  }

  // Puis du pivot vers la cible : 1 cible = coursCible TND.
  const versCible = coursALaDate(cible, date, taux);
  if (!versCible) return manquant(montant, cible, date, taux, deviseCible);

  return {
    montant: enPivot / versCible.rate!,
    devise: cible,
    statut: 'CONVERTI',
    cours: coursApplique === null
      ? 1 / versCible.rate!
      : coursApplique / versCible.rate!,
    dateCours: dateCours ?? versCible.validFrom,
    avertissement: ''
  };
}

/** Diagnostic d'un cours introuvable : devise inconnue ou date non couverte ? */
function manquant(
  montant: number,
  code: string,
  date: string,
  taux: readonly TauxChange[] | null | undefined,
  deviseAffichee: string | null | undefined
): ResultatConversion {

  const connue = Array.isArray(taux)
    && taux.some(t => normaliser(t.code) === normaliser(code));

  return {
    montant,
    devise: normaliser(deviseAffichee) || code,
    statut: connue ? 'TAUX_ABSENT' : 'DEVISE_INCONNUE',
    cours: null,
    dateCours: null,
    avertissement: connue
      ? `Aucun cours ${code} n'est publié au ${date} : le montant est conservé `
        + `dans sa devise d'origine. Convertir au cours du jour déplacerait les `
        + `émissions d'un exercice clos.`
      : `La devise ${code} est absente du référentiel des cours : le montant `
        + `est conservé tel quel.`
  };
}

/**
 * Émissions d'une dépense par un facteur monétaire, devises réconciliées.
 *
 * <p>Le facteur porte sa propre devise ; le montant porte la sienne. Sans
 * réconciliation, le calcul multiplie des unités qui ne se répondent pas.</p>
 *
 * @param facteur valeur du facteur, en kgCO₂e par unité de {@link deviseFacteur}.
 * @param date jour de la dépense, qui détermine le cours retenu.
 * @returns les émissions en kgCO₂e, et le détail de la conversion appliquée.
 */
export function emissionsMonetaires(
  montant: number,
  deviseMontant: string | null | undefined,
  facteur: number,
  deviseFacteur: string | null | undefined,
  date: string,
  taux: readonly TauxChange[] | null | undefined
): { emissions: number; conversion: ResultatConversion; fiable: boolean } {

  const conversion = convertirMontant(montant, deviseMontant, deviseFacteur, date, taux);
  const fiable = conversion.statut === 'IDENTIQUE' || conversion.statut === 'CONVERTI';

  return { emissions: conversion.montant * facteur, conversion, fiable };
}

/**
 * Le millésime du facteur correspond-il à celui de la dépense ?
 *
 * <p>Un facteur monétaire vieillit : l'intensité carbone d'un euro dépensé en
 * 2021 n'est pas celle d'un euro de 2026, ne serait-ce que par l'inflation.
 * L'écart n'invalide pas le calcul — souvent aucun facteur du bon millésime
 * n'existe — mais il doit figurer au rapport.</p>
 *
 * @returns l'écart en années, `null` si l'un des millésimes manque.
 */
export function ecartMillesime(
  anneeFacteur: number | null | undefined,
  anneeDepense: number | null | undefined
): number | null {

  if (!Number.isFinite(anneeFacteur as number)) return null;
  if (!Number.isFinite(anneeDepense as number)) return null;

  return (anneeDepense as number) - (anneeFacteur as number);
}

/** Phrase d'avertissement sur le millésime, vide en deçà de deux ans d'écart. */
export function messageMillesime(ecart: number | null): string {
  if (ecart === null || Math.abs(ecart) < 2) return '';

  return ecart > 0
    ? `Le facteur est antérieur de ${ecart} ans à la dépense : son intensité `
      + `ne tient pas compte de l'évolution des prix sur la période.`
    : `Le facteur est postérieur de ${Math.abs(ecart)} ans à la dépense.`;
}
