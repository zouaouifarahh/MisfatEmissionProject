import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { EntityContextService, EntityOption } from '../../core/entity-context.service';
import { FlagIconComponent } from '../flag-icon/flag-icon.component';
import { AnneeReference } from '../../models/organization.model';

/**
 * Barre supérieure : sélecteur de société et sélecteur d'année.
 *
 * <p>Ces deux contrôles définissent le contexte global de l'application via
 * {@link EntityContextService}. L'usine, la période et la date précise relèvent
 * du bloc de filtrage du dashboard, et l'import a désormais son entrée propre
 * dans la navigation latérale : l'en-tête ne porte plus de bouton d'action.</p>
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, FlagIconComponent],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css'
})
export class AppHeaderComponent implements OnInit {
  readonly entityService = inject(EntityContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  entities: EntityOption[] = [];
  entity!: EntityOption;
  annees: AnneeReference[] = [];
  annee: number | null = null;

  menuOuvert = false;

  ngOnInit(): void {
    this.entityService.entities$.subscribe(e => { this.entities = e; this.cdr.markForCheck(); });
    this.entityService.entity$.subscribe(e => { this.entity = e; this.cdr.markForCheck(); });
    this.entityService.years$.subscribe(a => { this.annees = a; this.cdr.markForCheck(); });
    this.entityService.year$.subscribe(y => { this.annee = y; this.cdr.markForCheck(); });
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
