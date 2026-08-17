/**
 * Profils des entités du groupe MISFAT.
 *
 * Le libellé, le pays et la devise viennent de la base (`/api/filiales`) : une
 * société est une donnée de référence, éditable depuis l'écran de gestion des
 * sociétés, et non une constante du frontend. Une société créée par un
 * utilisateur apparaît donc dans les sélecteurs avec son pays, sa devise et son
 * drapeau, sans modification de code.
 *
 * Ce module ne conserve que ce qui relève de la présentation : la
 * correspondance pays → drapeau et le code court affiché.
 */
export type FlagCode = 'TN' | 'MA' | 'FR' | 'EU' | 'GROUP';

export interface EntityProfile {
  /** Code métier présenté à l'utilisateur. */
  code: string;
  /** Code renvoyé par l'API des filiales. */
  apiCode: string;
  label: string;
  country: string;
  flag: FlagCode;
  currency: string;
}

/** Entité virtuelle : vue consolidée, aucune filiale sélectionnée. */
export const GROUP_ENTITY: EntityProfile = {
  code: 'GROUPE',
  apiCode: 'ALL',
  label: 'Groupe MISFAT',
  country: 'Vue consolidée',
  flag: 'GROUP',
  currency: 'Multi-devise'
};

/** Drapeau associé à un pays d'implantation. */
const DRAPEAU_PAR_PAYS: Record<string, FlagCode> = {
  tunisie: 'TN',
  maroc: 'MA',
  france: 'FR',
  europe: 'EU'
};

/**
 * Code court affiché pour les sociétés historiques.
 *
 * <p>La table stocke un code technique hérité de Cegid (MT, MM, SF, ST) que le
 * métier désigne autrement. Toute société créée depuis l'application porte
 * directement son code définitif et n'a donc rien à faire ici.</p>
 */
const CODES_METIER: Record<string, string> = {
  MT: 'MTN',
  MM: 'MMA',
  SF: 'SOLFA',
  ST: 'SOLTN'
};

export function drapeauPour(pays: string | null | undefined): FlagCode {
  const cle = (pays ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return DRAPEAU_PAR_PAYS[cle] ?? 'GROUP';
}

/** Profil d'affichage d'une filiale, construit à partir de ses données en base. */
export function profileFor(
  apiCode: string,
  libelle: string,
  pays?: string | null,
  devise?: string | null
): Omit<EntityProfile, 'apiCode'> {
  return {
    code: CODES_METIER[apiCode] ?? apiCode,
    label: libelle,
    country: pays?.trim() || '—',
    flag: drapeauPour(pays),
    currency: devise?.trim().toUpperCase() || 'TND'
  };
}
