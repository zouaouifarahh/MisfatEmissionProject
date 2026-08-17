export interface Filiale {
  id: number;
  code: string;
  libelle: string;
  libelleCegid?: string;
  codeD365fo?: string;
  /** Pays d'implantation ; détermine le drapeau affiché. */
  pays?: string | null;
  /** Devise principale : TND, EUR, MAD… */
  devise?: string | null;
  /** Date de création, au format ISO `AAAA-MM-JJ`. */
  dateCreation?: string | null;
  /** Compte des usines rattachées, renvoyé par le serveur. */
  nombreUsines?: number;
  usines?: Usine[];
}

export interface Usine {
  id: number;
  nom: string;
  emplacement?: string;
  filialeId: number;
  filialeCode?: string;
}

export interface AnneeReference {
  id: number;
  valeur: number;
  statut: string;
}