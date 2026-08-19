import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { RolesService, droitsPourRole } from './roles.service';

/**
 * Fil de commentaires attaché à une ligne de saisie.
 *
 * <p>Un chiffre d'émission se discute : l'opérateur qui l'a saisi connaît la
 * facture, le modérateur connaît la règle d'imputation, l'administrateur connaît
 * l'engagement pris devant la SBTi. Sans trace écrite, cette discussion se perd
 * dans les couloirs et l'arbitrage se rejoue à chaque exercice.</p>
 *
 * <p>Chaque message porte le nom et le rôle de son auteur — non par formalisme,
 * mais parce qu'un vérificateur externe doit pouvoir distinguer une observation
 * d'opérateur d'une décision d'arbitrage.</p>
 *
 * <p>Le stockage est local, comme le reste des saisies de l'application. Il
 * suivra le serveur le jour où les mesures y seront persistées.</p>
 */

/** Rôle de l'auteur, tel que la gouvernance le nomme. */
export type RoleAuteur = 'Opérateur' | 'Modérateur' | 'Master Admin';

export interface Commentaire {
  id: number;
  /** Ligne commentée, identifiée par sa clé métier. */
  cle: string;
  auteur: string;
  role: RoleAuteur;
  texte: string;
  /** Horodatage ISO, fourni par l'appelant pour rester testable. */
  ecritLe: string;
}

/** Clé de stockage du fil, relue à chaque démarrage. */
export const CLE_COMMENTAIRES = 'misfat_commentaires_saisies';

/** Profil d'accès traduit en rôle affiché sur le commentaire. */
export function roleAffiche(roleBrut: string | null | undefined): RoleAuteur {
  switch (droitsPourRole(roleBrut).profil) {
    case 'MASTER_ADMIN': return 'Master Admin';
    case 'CONTRIBUTEUR': return 'Opérateur';
    default: return 'Modérateur';
  }
}

@Injectable({ providedIn: 'root' })
export class CommentairesService {

  private readonly rolesService = inject(RolesService);
  private readonly fil = new BehaviorSubject<Commentaire[]>([]);

  /** Fil complet, toutes lignes confondues. */
  readonly commentaires$: Observable<Commentaire[]> = this.fil.asObservable();

  constructor() {
    this.relire();
  }

  /** Commentaires d'une ligne, du plus ancien au plus récent. */
  pourLigne(cle: string): Commentaire[] {
    return this.fil.value
      .filter(c => c.cle === cle)
      .sort((a, b) => a.ecritLe.localeCompare(b.ecritLe));
  }

  /** Nombre de commentaires portés par une ligne, pour la pastille du tableau. */
  compter(cle: string): number {
    return this.fil.value.filter(c => c.cle === cle).length;
  }

  /**
   * Ajoute un commentaire au fil d'une ligne.
   *
   * <p>Un texte vide est refusé sans bruit : une pastille qui s'incrémente sur
   * un message vide ferait croire à une discussion qui n'a pas eu lieu.</p>
   *
   * @param horodatage fourni par l'appelant — l'heure système rendrait les
   *   bancs de test dépendants du moment où ils s'exécutent.
   * @returns le commentaire écrit, ou `null` si rien ne l'a été.
   */
  ajouter(cle: string, texte: string, auteur: string, horodatage: string): Commentaire | null {
    const propre = String(texte ?? '').trim();
    if (!cle || !propre) return null;

    const commentaire: Commentaire = {
      id: this.prochainIdentifiant(),
      cle,
      auteur: String(auteur ?? '').trim() || 'Utilisateur',
      role: roleAffiche(this.rolesService.role),
      texte: propre,
      ecritLe: horodatage
    };

    this.fil.next([...this.fil.value, commentaire]);
    this.persister();
    return commentaire;
  }

  /**
   * Retire un commentaire.
   *
   * <p>Réservé au Master Admin : un fil dont chacun peut effacer les messages
   * des autres ne vaut rien comme trace d'arbitrage.</p>
   */
  supprimer(id: number): boolean {
    if (droitsPourRole(this.rolesService.role).profil !== 'MASTER_ADMIN') return false;

    const restants = this.fil.value.filter(c => c.id !== id);
    if (restants.length === this.fil.value.length) return false;

    this.fil.next(restants);
    this.persister();
    return true;
  }

  /** L'utilisateur courant peut-il retirer un commentaire ? */
  get peutSupprimer(): boolean {
    return droitsPourRole(this.rolesService.role).profil === 'MASTER_ADMIN';
  }

  private prochainIdentifiant(): number {
    return this.fil.value.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  }

  private relire(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const brut = localStorage.getItem(CLE_COMMENTAIRES);
      if (!brut) return;

      const relu = JSON.parse(brut);
      if (Array.isArray(relu)) this.fil.next(relu);
    } catch {
      // Un fil illisible ne doit pas empêcher l'écran de s'ouvrir.
    }
  }

  private persister(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(CLE_COMMENTAIRES, JSON.stringify(this.fil.value));
    } catch {
      // Stockage saturé : le commentaire reste en mémoire pour la session.
    }
  }
}
