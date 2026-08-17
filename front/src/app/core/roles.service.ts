import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, map } from 'rxjs';

/**
 * Rôle actif et droits de navigation associés.
 *
 * <p>Aucun mot de passe n'est manipulé ici : l'authentification reste du
 * ressort du service externe, qui dépose le rôle retenu dans le stockage de
 * session. Ce service ne fait que le lire, le normaliser et en déduire ce que
 * la navigation doit montrer.</p>
 *
 * <p>La restriction est visuelle : elle guide l'utilisateur vers ce qui le
 * concerne. Elle ne remplace pas le contrôle d'accès du serveur, seul à même
 * de refuser une écriture — un menu masqué reste une route atteignable.</p>
 */

/** Profil d'accès retenu, une fois les rôles métier ramenés à trois familles. */
export type ProfilAcces = 'LECTEUR' | 'CONTRIBUTEUR' | 'MASTER_ADMIN';

/** Clé de stockage du rôle, alimentée à la connexion. */
export const CLE_ROLE = 'userRole';

/**
 * Correspondance des rôles métier vers les trois profils de navigation.
 *
 * <p>Les intitulés du service utilisateur (RESPONSABLE_RSE, AUDITEUR,
 * DIRECTION…) cohabitent avec ceux attendus par le cahier des charges
 * (MODÉRATEUR, SUPERVISEUR, MASTER_ADMIN). Les deux vocabulaires sont acceptés :
 * l'intégration externe n'a pas à s'aligner sur l'un ou sur l'autre.</p>
 */
const PROFIL_PAR_ROLE: Record<string, ProfilAcces> = {
  // Lecture seule : consultation du bilan et de ses rapports.
  MODERATEUR: 'LECTEUR',
  MODERATOR: 'LECTEUR',
  LECTEUR: 'LECTEUR',
  READER: 'LECTEUR',
  VIEWER: 'LECTEUR',
  AUDITEUR: 'LECTEUR',
  AUDITOR: 'LECTEUR',
  DIRECTION: 'LECTEUR',
  // Rôle par défaut du service utilisateur, sans attribution explicite.
  USER: 'LECTEUR',
  // Le validateur relit ce que d'autres ont saisi : dashboards et rapports lui
  // sont ouverts, la collecte ne l'est pas. L'approbation ligne à ligne qu'un
  // tel intitulé suggère n'existe pas encore dans l'application ; le jour où
  // elle existera, elle demandera son propre droit plutôt qu'un profil élargi.
  VALIDATEUR: 'LECTEUR',
  VALIDATOR: 'LECTEUR',

  // Collecte : saisie des mesures et import des classeurs.
  SUPERVISEUR: 'CONTRIBUTEUR',
  SUPERVISOR: 'CONTRIBUTEUR',
  CONTRIBUTEUR: 'CONTRIBUTEUR',
  CONTRIBUTOR: 'CONTRIBUTEUR',
  RESPONSABLE_RSE: 'CONTRIBUTEUR',
  RSE: 'CONTRIBUTEUR',
  // Responsable de périmètre et opérateur de saisie : mêmes écrans que le
  // contributeur, le périmètre lui-même étant cloisonné ailleurs.
  RESPONSABLE_PERIMETRE: 'CONTRIBUTEUR',
  RESPONSABLE: 'CONTRIBUTEUR',
  SAISIE: 'CONTRIBUTEUR',
  // Administrateur d'un site : la collecte entière, mais pas le paramétrage
  // global. Les droits ne portent aujourd'hui aucune notion de site ; lui
  // accorder l'administration complète lui livrerait les autres usines et
  // l'annuaire du groupe, ce qui dépasse son mandat.
  ADMIN_SITE: 'CONTRIBUTEUR',
  SITE_ADMIN: 'CONTRIBUTEUR',

  // Administration complète.
  MASTER_ADMIN: 'MASTER_ADMIN',
  ADMINISTRATEUR: 'MASTER_ADMIN',
  ADMINISTRATOR: 'MASTER_ADMIN',
  ADMIN: 'MASTER_ADMIN'
};

/** Ce que la navigation laisse voir, profil par profil. */
export interface DroitsAcces {
  profil: ProfilAcces;
  /** Libellé du profil, tel qu'il est présenté à l'utilisateur. */
  libelle: string;
  tableauDeBord: boolean;
  importDonnees: boolean;
  /** Référentiel des facteurs, sources d'émission et écrans de mesure. */
  emissionCarbone: boolean;
  reporting: boolean;
  /** Saisie des données d'activité extra-financières : administration seule. */
  donneesActivite: boolean;
  parametres: boolean;
  /** Consultation et modification de son propre profil : ouvert à tous. */
  monProfil: boolean;
  /** Annuaire des membres et invitations : administration seule. */
  membresEquipe: boolean;
  demandesAcces: boolean;
}

const DROITS_PAR_PROFIL: Record<ProfilAcces, DroitsAcces> = {
  LECTEUR: {
    profil: 'LECTEUR', libelle: 'Modérateur / Lecteur',
    tableauDeBord: true, importDonnees: false, emissionCarbone: false,
    reporting: true, donneesActivite: false, parametres: false,
    monProfil: true, membresEquipe: false, demandesAcces: false
  },
  CONTRIBUTEUR: {
    profil: 'CONTRIBUTEUR', libelle: 'Superviseur / Contributeur',
    tableauDeBord: true, importDonnees: true, emissionCarbone: true,
    reporting: true, donneesActivite: false, parametres: false,
    monProfil: true, membresEquipe: false, demandesAcces: false
  },
  MASTER_ADMIN: {
    profil: 'MASTER_ADMIN', libelle: 'Master Admin',
    tableauDeBord: true, importDonnees: true, emissionCarbone: true,
    reporting: true, donneesActivite: true, parametres: true,
    monProfil: true, membresEquipe: true, demandesAcces: true
  }
};

/**
 * Profil correspondant à un rôle brut.
 *
 * <p>Un rôle absent vaut administration complète : l'application n'a pas encore
 * d'authentification interne, et verrouiller une console de développement que
 * personne ne peut déverrouiller la rendrait inutilisable. Un rôle présent mais
 * inconnu, en revanche, retombe sur le profil le moins doté : mieux vaut une
 * navigation trop courte qu'un accès accordé par méconnaissance.</p>
 */
export function profilPourRole(role: string | null | undefined): ProfilAcces {
  const brut = String(role ?? '').trim();
  if (!brut) return 'MASTER_ADMIN';

  const normalise = brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return PROFIL_PAR_ROLE[normalise] ?? 'LECTEUR';
}

/** Droits associés à un rôle brut. */
export function droitsPourRole(role: string | null | undefined): DroitsAcces {
  return DROITS_PAR_PROFIL[profilPourRole(role)];
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly roleSubject = new BehaviorSubject<string | null>(null);

  /** Rôle brut tel que le service d'authentification l'a déposé. */
  readonly role$: Observable<string | null> = this.roleSubject.asObservable();

  /** Droits de navigation, recalculés à chaque changement de rôle. */
  readonly droits$: Observable<DroitsAcces> = this.roleSubject.pipe(map(droitsPourRole));

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.roleSubject.next(this.relire());
  }

  get role(): string | null {
    return this.roleSubject.value;
  }

  get droits(): DroitsAcces {
    return droitsPourRole(this.roleSubject.value);
  }

  get profil(): ProfilAcces {
    return this.droits.profil;
  }

  /**
   * Prend acte d'un rôle, sans le persister.
   *
   * <p>La persistance appartient au service d'authentification : la dupliquer
   * ici ferait diverger les deux écritures au premier changement de format.</p>
   */
  definirRole(role: string | null): void {
    this.roleSubject.next(role);
  }

  /** Relit le rôle déposé par l'authentification, après une reconnexion. */
  rafraichir(): void {
    this.roleSubject.next(this.relire());
  }

  /**
   * Rôle déposé par l'authentification.
   *
   * <p>Le stockage de session est consulté en premier : il porte la connexion
   * courante, là où le stockage local peut conserver celle d'hier.</p>
   */
  private relire(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    try {
      return sessionStorage.getItem(CLE_ROLE) ?? localStorage.getItem(CLE_ROLE);
    } catch {
      return null;
    }
  }
}
