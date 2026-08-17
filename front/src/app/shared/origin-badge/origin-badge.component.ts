import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Provenance d'une donnée, telle que renvoyée par l'API. */
export type DataOrigin = 'MANUAL_ENTRY' | 'EXCEL_IMPORT' | null | undefined;

/**
 * Badge de provenance affiché dans les tableaux CRUD.
 *
 * <p>Une origine absente vaut saisie manuelle : les mesures antérieures à
 * l'ajout du champ `origin` côté serveur ont la colonne à `null`.</p>
 */
@Component({
  selector: 'app-origin-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [class.badge-import]="isImport" [class.badge-manual]="!isImport">
      <span class="dot"></span>{{ isImport ? 'Import Excel' : 'Manuel' }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

    .badge-manual { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .badge-import { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
  `]
})
export class OriginBadgeComponent {
  @Input() origin: DataOrigin = null;

  get isImport(): boolean {
    return this.origin === 'EXCEL_IMPORT';
  }
}
