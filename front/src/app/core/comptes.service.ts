import { Inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, map } from 'rxjs';

/**
 * Annuaire des comptes de la plateforme.
 *
 * <p>L'accès ne repose sur aucun mot de passe : un compte se reconnaît à son
 * adresse électronique, et s'ouvre à la seule condition que le Master Admin ait
 * approuvé la demande. Le contrôle est donc entièrement déclaratif — il
 * organise qui entre, il ne prouve pas qui l'on est.</p>
 *
 * <p><strong>Ce n'est pas un mécanisme d'authentification.</strong> Quiconque
 * connaît une adresse approuvée entre avec les droits associés, et rien de ce
 * qui vit dans le navigateur ne résiste à un utilisateur décidé. L'annuaire
 * tient le rôle et le statut jusqu'à ce que l'authentification externe prenne
 * le relais ; la protection réelle des données reste au serveur.</p>
 */

/**
 * Statut d'accès d'un compte.
 *
 * <p>{@code BLOQUE} se distingue de {@code REFUSE} : le premier suspend un
 * membre en exercice, le second écarte une demande. Les confondre ferait perdre
 * la trace de ce qui a été accordé un jour.</p>
 */
export type StatutCompte = 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE' | 'BLOQUE';

/** Provenance du compte : demande spontanée ou invitation du Master Admin. */
export type OrigineCompte = 'DEMANDE' | 'INVITATION';

export interface Compte {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  /**
   * CIN ou matricule unique de l'employé.
   *
   * <p>Transmis par l'intégration du site entreprise, il identifie la personne
   * là où l'adresse ne fait qu'identifier le compte. Facultatif : les demandes
   * antérieures à cette intégration n'en portent pas.</p>
   */
  matricule?: string;
  /** Rôle proposé par la demande ; le Master Admin tranche à l'approbation. */
  role: string;
  statut: StatutCompte;
  /** Périmètre d'affectation : GROUPE_MISFAT, MISFAT_1… */
  affectation: string;
  /** Horodatage ISO de la demande, qui vaut date d'adhésion. */
  demandeLe: string;
  /** Horodatage ISO de la décision du Master Admin. */
  decideLe?: string;

  telephone?: string;
  /** Photo de profil, en URI de données ; redimensionnée avant stockage. */
  avatar?: string;
  /** Notes personnelles, visibles du seul intéressé. */
  notes?: string[];

  origine?: OrigineCompte;
  /** Première connexion effective ; une invitation non honorée n'en porte pas. */
  premiereConnexionLe?: string;
  derniereConnexionLe?: string;
}

/**
 * Champs d'une demande d'accès ; le reste est décidé par l'annuaire.
 *
 * <p>Les demandes ne sont plus déposées depuis la plateforme : elles arrivent de
 * l'intégration du site entreprise, avec le matricule de l'employé. Le rôle
 * qu'elles portent n'est qu'une proposition — seul le Master Admin l'arrête.</p>
 */
export type DemandeAcces =
  Pick<Compte, 'firstName' | 'lastName' | 'email' | 'role' | 'affectation'>
  & Pick<Compte, 'matricule'>;

/** Champs d'une invitation émise par le Master Admin. */
export interface Invitation {
  email: string;
  telephone?: string;
  role: string;
  affectation?: string;
  firstName?: string;
  lastName?: string;
}

/** Champs qu'un utilisateur peut modifier sur son propre profil. */
export type ProfilModifiable =
  Partial<Pick<Compte, 'firstName' | 'lastName' | 'email' | 'telephone' | 'avatar' | 'notes'>>;

/** Champs qu'un administrateur peut modifier sur un membre. */
export type MembreModifiable =
  Partial<Pick<Compte, 'firstName' | 'lastName' | 'email' | 'telephone' | 'role' | 'affectation'>>;

/** Adresse du compte d'urgence, toujours en mesure de déverrouiller la console. */
export const EMAIL_MASTER_ADMIN = 'admin@misfat.com';

/** Clé de persistance de l'annuaire. */
export const CLE_COMPTES = 'misfat_comptes';

/** Rôles proposés à l'inscription. */
export const ROLES_PROPOSES = [
  { code: 'MODERATEUR', libelle: 'Modérateur — consultation et rapports' },
  { code: 'SUPERVISEUR', libelle: 'Superviseur — collecte et import des données' },
  { code: 'MASTER_ADMIN', libelle: 'Master Admin — administration complète' }
] as const;

/** Affectations proposées à l'inscription. */
export const AFFECTATIONS_PROPOSEES = [
  { code: 'GROUPE_MISFAT', libelle: 'Groupe MISFAT — toutes sociétés' },
  { code: 'MISFAT_1', libelle: 'Usine MISFAT 1' },
  { code: 'MISFAT_2', libelle: 'Usine MISFAT 2' },
  { code: 'MISFAT_3', libelle: 'Usine MISFAT 3' }
] as const;

/** Compte d'urgence, créé d'office quand l'annuaire ne le porte pas. */
function compteMasterAdmin(): Compte {
  return {
    id: 1,
    firstName: 'Master',
    lastName: 'Admin',
    email: EMAIL_MASTER_ADMIN,
    role: 'MASTER_ADMIN',
    statut: 'APPROUVE',
    affectation: 'GROUPE_MISFAT',
    demandeLe: new Date().toISOString(),
    origine: 'INVITATION'
  };
}

/** Forme comparable d'une adresse : la casse et les espaces ne distinguent rien. */
export function normaliserEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Le compte est-il un membre de l'équipe ?
 *
 * <p>Un accès accordé puis suspendu reste un membre : le retirer de l'annuaire
 * ferait disparaître son historique, alors que c'est précisément ce que
 * l'écran doit conserver.</p>
 */
export function estMembre(compte: Compte): boolean {
  return compte.statut === 'APPROUVE' || compte.statut === 'BLOQUE';
}

/** Libellé lisible d'un statut d'accès. */
export function libelleStatut(statut: StatutCompte): string {
  switch (statut) {
    case 'APPROUVE': return 'Actif';
    case 'BLOQUE': return 'Bloqué';
    case 'REFUSE': return 'Refusé';
    default: return 'En attente';
  }
}

@Injectable({ providedIn: 'root' })
export class ComptesService implements OnDestroy {
  private readonly comptesSubject = new BehaviorSubject<Compte[]>([]);

  /**
   * Écoute des écritures faites dans les autres onglets.
   *
   * <p>L'événement `storage` n'est notifié qu'aux <em>autres</em> documents :
   * l'onglet qui approuve se met à jour de lui-même, celui de l'utilisateur
   * apprend la décision par ce canal. Sans cela, l'annuaire relu au démarrage
   * resterait figé et la demande approuvée continuerait de s'afficher « en
   * attente » jusqu'au rechargement de la page.</p>
   */
  private readonly surStockage = (evenement: StorageEvent): void => {
    if (evenement.key !== null && evenement.key !== CLE_COMPTES) return;
    this.synchroniser();
  };

  /** Annuaire complet, tel qu'il est persisté. */
  readonly comptes$: Observable<Compte[]> = this.comptesSubject.asObservable();

  /** Demandes que le Master Admin n'a pas encore tranchées. */
  readonly enAttente$: Observable<Compte[]> = this.comptes$.pipe(
    map(comptes => comptes.filter(compte => compte.statut === 'EN_ATTENTE'))
  );

  /** Membres de l'équipe : comptes accordés, suspendus compris. */
  readonly membres$: Observable<Compte[]> = this.comptes$.pipe(
    map(comptes => comptes.filter(compte => estMembre(compte)))
  );

  /** Invitations émises par le Master Admin, de la plus récente à la plus ancienne. */
  readonly invitations$: Observable<Compte[]> = this.comptes$.pipe(
    map(comptes => comptes
      .filter(compte => compte.origine === 'INVITATION')
      .slice()
      .sort((a, b) => (b.demandeLe ?? '').localeCompare(a.demandeLe ?? '')))
  );

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {
    this.comptesSubject.next(this.amorcer(this.relire()));

    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('storage', this.surStockage);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('storage', this.surStockage);
    }
  }

  get comptes(): Compte[] {
    return this.comptesSubject.value;
  }

  /**
   * Relit l'annuaire tel qu'il est réellement stocké.
   *
   * <p>Plusieurs onglets partagent le même stockage sans partager leur
   * mémoire : celui qui consulte doit revenir à la source avant toute décision
   * d'accès, sans quoi il statuerait sur un annuaire vieux de plusieurs
   * minutes. La relecture est silencieuse quand rien n'a changé, pour ne pas
   * faire retravailler les vues abonnées à chaque clic.</p>
   *
   * @returns l'annuaire à jour.
   */
  synchroniser(): Compte[] {
    if (!isPlatformBrowser(this.platformId)) return this.comptes;

    const stocke = this.amorcer(this.relire());

    if (JSON.stringify(stocke) !== JSON.stringify(this.comptes)) {
      this.comptesSubject.next(stocke);
    }

    return this.comptesSubject.value;
  }

  get enAttente(): Compte[] {
    return this.comptes.filter(compte => compte.statut === 'EN_ATTENTE');
  }

  get membres(): Compte[] {
    return this.comptes.filter(estMembre);
  }

  get invitations(): Compte[] {
    return this.comptes.filter(compte => compte.origine === 'INVITATION');
  }

  /** Le compte d'urgence ne se supprime, ne se bloque et ne se rétrograde pas. */
  estCompteUrgence(compte: Compte): boolean {
    return normaliserEmail(compte.email) === EMAIL_MASTER_ADMIN;
  }

  /**
   * Garantit la présence du compte d'urgence.
   *
   * <p>Un annuaire vide — première ouverture, stockage effacé — laisserait la
   * console inaccessible : plus personne ne pourrait approuver la première
   * demande, et l'application se refermerait sur elle-même. Le compte est donc
   * recréé dès qu'il manque, et pas seulement au tout premier démarrage.</p>
   */
  private amorcer(comptes: Compte[]): Compte[] {
    const present = comptes.some(compte => normaliserEmail(compte.email) === EMAIL_MASTER_ADMIN);
    if (present) return comptes;

    const amorce = [compteMasterAdmin(), ...comptes];
    this.persister(amorce);
    return amorce;
  }

  /**
   * Compte portant une adresse donnée, quel que soit son statut.
   *
   * <p>L'annuaire est relu au passage : c'est la lecture qui décide d'un accès,
   * et elle doit porter sur la décision la plus récente du Master Admin, fût-elle
   * prise dans un autre onglet il y a une seconde.</p>
   */
  chercherParEmail(email: string | null | undefined): Compte | null {
    const recherche = normaliserEmail(email);
    if (!recherche) return null;

    return this.synchroniser().find(compte => normaliserEmail(compte.email) === recherche) ?? null;
  }

  /**
   * Le compte peut-il ouvrir une session ?
   *
   * <p>Le compte d'urgence entre quel que soit son statut : c'est sa raison
   * d'être, et personne d'autre ne pourrait le réapprouver s'il venait à être
   * refusé par mégarde.</p>
   */
  peutSeConnecter(compte: Compte): boolean {
    return this.estCompteUrgence(compte) || compte.statut === 'APPROUVE';
  }

  /**
   * Enregistre une demande d'accès.
   *
   * <p>Une adresse déjà connue ne crée pas de doublon : la demande existante
   * est reprise et remise en attente. Sans cela, un utilisateur refusé
   * s'inscrirait à nouveau jusqu'à obtenir une décision favorable, et
   * l'annuaire porterait plusieurs fois la même personne avec des statuts
   * contradictoires.</p>
   */
  demanderAcces(demande: DemandeAcces): Compte {
    const email = normaliserEmail(demande.email);
    const existant = this.chercherParEmail(email);

    const compte: Compte = {
      ...(existant ?? {} as Compte),
      id: existant?.id ?? this.prochainId(),
      firstName: demande.firstName.trim(),
      lastName: demande.lastName.trim(),
      email,
      matricule: demande.matricule?.trim() || existant?.matricule,
      role: demande.role.trim().toUpperCase(),
      affectation: demande.affectation.trim().toUpperCase() || 'GROUPE_MISFAT',
      statut: 'EN_ATTENTE',
      origine: existant?.origine ?? 'DEMANDE',
      demandeLe: new Date().toISOString()
    };

    // Un accès déjà accordé n'est pas repris : une personne invitée qui
    // remplit malgré tout le formulaire d'inscription se verrait sinon
    // refermer la porte qu'on venait de lui ouvrir. Le compte d'urgence relève
    // du même principe, et lui ne peut jamais changer de rôle.
    if (existant && this.peutSeConnecter(existant)) {
      compte.statut = 'APPROUVE';
      if (this.estCompteUrgence(compte)) compte.role = 'MASTER_ADMIN';
    }

    this.publier(this.remplacer(compte, !existant));
    return compte;
  }

  /**
   * Invite une personne : son compte est ouvert d'avance.
   *
   * <p>L'invitation ne « transmet » rien par elle-même — aucun courriel n'est
   * envoyé d'ici. Elle inscrit l'adresse à l'annuaire, déjà approuvée : la
   * personne entre à sa première connexion, sans passer par une demande. C'est
   * au Master Admin de lui communiquer l'adresse retenue.</p>
   */
  inviter(invitation: Invitation): Compte {
    const email = normaliserEmail(invitation.email);
    const existant = this.chercherParEmail(email);

    const compte: Compte = {
      ...(existant ?? {} as Compte),
      id: existant?.id ?? this.prochainId(),
      firstName: (invitation.firstName ?? existant?.firstName ?? '').trim(),
      lastName: (invitation.lastName ?? existant?.lastName ?? '').trim(),
      email,
      telephone: invitation.telephone?.trim() || existant?.telephone,
      role: invitation.role.trim().toUpperCase(),
      affectation: (invitation.affectation ?? existant?.affectation ?? 'GROUPE_MISFAT')
        .trim().toUpperCase(),
      statut: 'APPROUVE',
      origine: 'INVITATION',
      demandeLe: existant?.demandeLe || new Date().toISOString(),
      decideLe: new Date().toISOString()
    };

    // Le compte d'urgence garde son rôle : l'inviter à un rôle moindre le
    // priverait de sa capacité à rouvrir la plateforme.
    if (this.estCompteUrgence(compte)) compte.role = 'MASTER_ADMIN';

    this.publier(this.remplacer(compte, !existant));
    return compte;
  }

  /**
   * Approuve une demande : l'utilisateur peut se connecter immédiatement.
   *
   * <p>Le Master Admin arrête le rôle et l'affectation au moment où il tranche :
   * la demande n'en porte qu'une proposition, faite par l'intéressé ou par
   * l'intégration, et l'administration seule décide. Sans consigne explicite,
   * les valeurs de la demande sont conservées.</p>
   *
   * <p>Le compte d'urgence garde son rôle en toutes circonstances : le
   * rétrograder priverait la plateforme de son seul accès de secours.</p>
   */
  approuver(id: number, decision?: { role?: string; affectation?: string }): void {
    const comptes = this.synchroniser().map(compte => {
      if (compte.id !== id) return compte;

      return {
        ...compte,
        role: this.estCompteUrgence(compte)
          ? compte.role
          : (decision?.role?.trim().toUpperCase() || compte.role),
        affectation: decision?.affectation?.trim().toUpperCase() || compte.affectation,
        statut: 'APPROUVE' as StatutCompte,
        decideLe: new Date().toISOString()
      };
    });

    this.publier(comptes);
  }

  /** Refuse une demande ; le compte d'urgence n'est jamais refusable. */
  refuser(id: number): void {
    if (this.protege(id)) return;
    this.trancher(id, 'REFUSE');
  }

  /** Suspend un membre sans effacer son historique. */
  bloquer(id: number): void {
    if (this.protege(id)) return;
    this.trancher(id, 'BLOQUE');
  }

  /** Rend l'accès à un membre suspendu. */
  debloquer(id: number): void {
    this.trancher(id, 'APPROUVE');
  }

  /** Retire définitivement un compte de l'annuaire. */
  supprimer(id: number): void {
    if (this.protege(id)) return;
    this.publier(this.synchroniser().filter(compte => compte.id !== id));
  }

  /**
   * Modifie les caractéristiques d'un membre, depuis l'écran d'équipe.
   *
   * <p>Le changement d'adresse est accepté : c'est elle qui sert d'identifiant
   * de connexion, et une adresse erronée fermerait la porte à l'intéressé. Elle
   * est refusée si elle appartient déjà à quelqu'un d'autre, sans quoi deux
   * comptes deviendraient indiscernables.</p>
   *
   * @returns le compte modifié, ou `null` si l'adresse est déjà prise.
   */
  modifierMembre(id: number, champs: MembreModifiable): Compte | null {
    return this.appliquer(id, champs);
  }

  /** Modifie le profil de l'utilisateur connecté. */
  modifierProfil(id: number, champs: ProfilModifiable): Compte | null {
    return this.appliquer(id, champs);
  }

  /**
   * Prend acte d'une connexion.
   *
   * <p>La première connexion distingue une invitation honorée d'une invitation
   * restée lettre morte — la seule chose que l'écran d'équipe puisse dire
   * honnêtement du sort d'une invitation.</p>
   */
  marquerConnexion(email: string): void {
    const compte = this.chercherParEmail(email);
    if (!compte) return;

    const horodatage = new Date().toISOString();
    this.publier(this.synchroniser().map(c => c.id === compte.id
      ? { ...c, premiereConnexionLe: c.premiereConnexionLe ?? horodatage, derniereConnexionLe: horodatage }
      : c));
  }

  /** Applique un lot de champs à un compte, adresse comprise. */
  private appliquer(id: number, champs: MembreModifiable & ProfilModifiable): Compte | null {
    const comptes = this.synchroniser();
    const actuel = comptes.find(compte => compte.id === id);
    if (!actuel) return null;

    const email = champs.email !== undefined ? normaliserEmail(champs.email) : actuel.email;
    if (!email) return null;

    const conflit = comptes.some(compte =>
      compte.id !== id && normaliserEmail(compte.email) === email);
    if (conflit) return null;

    // Le compte d'urgence conserve son adresse et son rôle : les modifier
    // reviendrait à supprimer le seul accès de secours de la plateforme.
    const protege = this.estCompteUrgence(actuel);

    const modifie: Compte = {
      ...actuel,
      ...champs,
      email: protege ? actuel.email : email,
      role: protege ? actuel.role : (champs.role?.trim().toUpperCase() ?? actuel.role),
      telephone: champs.telephone !== undefined ? champs.telephone.trim() : actuel.telephone
    };

    this.publier(comptes.map(compte => (compte.id === id ? modifie : compte)));
    return modifie;
  }

  /** Le compte est-il celui qu'aucune décision ne doit pouvoir fermer ? */
  private protege(id: number): boolean {
    const compte = this.comptes.find(c => c.id === id);
    return !!compte && this.estCompteUrgence(compte);
  }

  /** Insère ou remplace un compte dans l'annuaire à jour. */
  private remplacer(compte: Compte, nouveau: boolean): Compte[] {
    const comptes = this.synchroniser();
    return nouveau
      ? [...comptes, compte]
      : comptes.map(c => (c.id === compte.id ? compte : c));
  }

  /**
   * Applique une décision à l'annuaire le plus récent.
   *
   * <p>La persistance réécrit la liste entière : partir d'une copie en mémoire
   * périmée effacerait les demandes déposées entre-temps depuis un autre
   * onglet.</p>
   */
  private trancher(id: number, statut: StatutCompte): void {
    const comptes = this.synchroniser().map(compte =>
      compte.id === id ? { ...compte, statut, decideLe: new Date().toISOString() } : compte
    );
    this.publier(comptes);
  }

  private prochainId(): number {
    return this.comptes.reduce((max, compte) => Math.max(max, compte.id), 0) + 1;
  }

  private publier(comptes: Compte[]): void {
    this.comptesSubject.next(comptes);
    this.persister(comptes);
  }

  private persister(comptes: Compte[]): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(CLE_COMPTES, JSON.stringify(comptes));
    } catch (erreur) {
      console.error('[comptes] Annuaire non persisté', erreur);
    }
  }

  /** Relit l'annuaire ; un contenu illisible ne doit pas bloquer le démarrage. */
  private relire(): Compte[] {
    if (!isPlatformBrowser(this.platformId)) return [];

    try {
      const brut = localStorage.getItem(CLE_COMPTES);
      if (!brut) return [];

      const relu = JSON.parse(brut);
      return Array.isArray(relu) ? relu.filter(c => c && typeof c.email === 'string') : [];
    } catch {
      return [];
    }
  }
}
