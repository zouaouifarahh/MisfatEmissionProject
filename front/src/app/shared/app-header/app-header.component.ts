import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { EntityContextService, EntityOption } from '../../core/entity-context.service';
import { FlagIconComponent } from '../flag-icon/flag-icon.component';
import { AnneeReference } from '../../models/organization.model';
import { SessionService } from '../../core/session.service';
import { Compte, ComptesService, normaliserEmail } from '../../core/comptes.service';

/**
 * Silhouette neutre, tant qu'aucune photo n'a été déposée.
 *
 * <p>Même tracé que celui de l'écran « Mon Profil » : deux dessins différents
 * pour le même compte donneraient l'impression de deux utilisateurs.</p>
 */
const AVATAR_PAR_DEFAUT =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
    + '<rect width="128" height="128" fill="#EFF6FA"/>'
    + '<circle cx="64" cy="50" r="23" fill="#B9CFE0"/>'
    + '<path d="M20 122c0-24 20-38 44-38s44 14 44 38z" fill="#B9CFE0"/></svg>');

/**
 * Barre supérieure : sélecteur de société et sélecteur d'année.
 *
 * <p>Ces deux contrôles définissent le contexte global de l'application via
 * {@link EntityContextService}. L'usine, la période et la date précise relèvent
 * du bloc de filtrage du dashboard.</p>
 *
 * <p>L'en-tête porte en outre l'identité de la session, à droite : la photo, le
 * nom et le rôle de qui est connecté, et la sortie. La déconnexion se trouvait
 * au pied de la navigation latérale, sous quarante entrées de menu — il fallait
 * dérouler toute la barre pour quitter la console, et le bouton portait une
 * maison pour libellé alors qu'il ferme la session.</p>
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, FlagIconComponent],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css'
})
export class AppHeaderComponent implements OnInit, OnDestroy {
  readonly entityService = inject(EntityContextService);
  private readonly sessionService = inject(SessionService);
  private readonly comptesService = inject(ComptesService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly abonnements = new Subscription();

  entities: EntityOption[] = [];
  entity!: EntityOption;
  annees: AnneeReference[] = [];
  annee: number | null = null;

  menuOuvert = false;

  /** Identité affichée à droite ; vide tant qu'aucune session n'est ouverte. */
  nomUtilisateur = '';
  roleUtilisateur = '';
  avatarUrl = AVATAR_PAR_DEFAUT;

  ngOnInit(): void {
    // Tous rattachés à la même souscription : la navigation vers « Mon Profil »
    // reconstruit la console, donc cet en-tête. Laissés libres, ils
    // s'accumulaient à chaque passage et marquaient des vues déjà détruites.
    this.abonnements.add(this.entityService.entities$
      .subscribe(e => { this.entities = e ?? []; this.cdr.markForCheck(); }));
    this.abonnements.add(this.entityService.entity$
      .subscribe(e => { this.entity = e; this.cdr.markForCheck(); }));
    this.abonnements.add(this.entityService.years$
      .subscribe(a => { this.annees = a ?? []; this.cdr.markForCheck(); }));
    this.abonnements.add(this.entityService.year$
      .subscribe(y => { this.annee = y; this.cdr.markForCheck(); }));

    this.abonnements.add(this.sessionService.session$
      .subscribe(() => this.relireIdentite(this.comptesService.comptes)));

    // La photo est relue à chaque écriture de l'annuaire : sans cela, une image
    // déposée dans « Mon Profil » ne remplaçait la silhouette qu'au prochain
    // rechargement de la page.
    this.abonnements.add(this.comptesService.comptes$
      .subscribe(comptes => this.relireIdentite(comptes)));
  }

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  /**
   * Reprend nom, rôle et photo du compte de la session.
   *
   * <p>L'annuaire est lu dans la liste que l'abonnement transmet, et non par
   * {@code chercherParEmail} : celui-ci resynchronise depuis le stockage du
   * navigateur, or la diffusion précède l'écriture. Appelé depuis un abonné, il
   * rendait la version d'avant la modification — et repoussait cette version
   * périmée à tous les autres abonnés au passage. La photo déposée dans « Mon
   * Profil » ne serait apparue qu'au rechargement suivant.</p>
   */
  private relireIdentite(comptes: readonly Compte[] | null | undefined): void {
    const session = this.sessionService.session;
    const recherche = normaliserEmail(session?.email);

    // L'annuaire peut être vide, non chargé, ou ne pas porter le compte : aucun
    // de ces cas n'est une anomalie, et aucun ne doit vider l'en-tête de son
    // identité — le nom vient de la session, la photo seule vient de l'annuaire.
    const compte = recherche
      ? (comptes ?? []).find(c => normaliserEmail(c?.email) === recherche) ?? null
      : null;

    // Le nom de la session fait foi pour l'affichage : l'annuaire peut ne pas
    // porter le compte — une session ouverte hors annuaire reste une session.
    this.nomUtilisateur = session?.nomComplet ?? '';
    this.roleUtilisateur = session?.role ?? '';
    this.avatarUrl = compte?.avatar || AVATAR_PAR_DEFAUT;

    this.cdr.markForCheck();
  }

  /**
   * Ouvre « Mon Profil ».
   *
   * <p>Le rejet est capté : une garde qui refuse, ou une route retirée, rendrait
   * autrement une promesse rompue que personne n'attrape — le navigateur la
   * journalise alors comme une erreur non gérée, au milieu d'un écran qui n'a
   * pourtant pas bougé.</p>
   */
  allerAuProfil(): void {
    this.router.navigate(['/mon-profil'])
      .catch(erreur => console.error('[en-tête] ouverture du profil impossible', erreur));
  }

  /** Ferme la session et ramène à l'écran de connexion. */
  seDeconnecter(): void {
    this.sessionService.fermer();
    this.router.navigate(['/signin'])
      .catch(erreur => console.error('[en-tête] retour à la connexion impossible', erreur));
  }

  basculerMenu(): void {
    this.menuOuvert = !this.menuOuvert;
  }

  choisirEntite(entity: EntityOption): void {
    this.entityService.selectEntity(entity);
    this.menuOuvert = false;
  }

  changerAnnee(valeur: number | null): void {
    this.entityService.selectYear(valeur === null ? null : Number(valeur));
  }

  /** Referme le menu déroulant sur un clic à l'extérieur. */
  @HostListener('document:click', ['$event'])
  onClicDocument(event: MouseEvent): void {
    const cible = event.target as HTMLElement;
    if (this.menuOuvert && !cible.closest('.entity-switcher')) {
      this.menuOuvert = false;
    }
  }
}
