import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FlagCode } from '../../core/entity-catalogue';

/**
 * Drapeau national en SVG inline.
 *
 * <p>Les emoji drapeaux (🇹🇳, 🇲🇦…) ne sont pas rendus sous Windows : aucune
 * police système ne contient les glyphes d'indicateurs régionaux, Chrome et Edge
 * y affichent les deux lettres du code pays. Ces tracés garantissent un rendu
 * identique sur tous les postes.</p>
 */
@Component({
  selector: 'app-flag-icon',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="flag" [style.width.px]="size" [style.height.px]="size * 0.68" [attr.title]="title">
      <!-- Tunisie -->
      <svg *ngIf="code === 'TN'" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="16" fill="#e70013" />
        <circle cx="12" cy="8" r="4.6" fill="#fff" />
        <circle cx="12.9" cy="8" r="3.3" fill="#e70013" />
        <circle cx="13.9" cy="8" r="2.6" fill="#fff" />
        <path d="M14.6 6.3l.55 1.5 1.55.05-1.2 1 .42 1.5-1.32-.9-1.32.9.42-1.5-1.2-1 1.55-.05z" fill="#e70013" />
      </svg>

      <!-- Maroc -->
      <svg *ngIf="code === 'MA'" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="16" fill="#c1272d" />
        <path
          d="M12 4.6l1.35 4.15h4.36l-3.53 2.56 1.35 4.15L12 12.9l-3.53 2.56 1.35-4.15L6.29 8.75h4.36z"
          fill="none" stroke="#006233" stroke-width="1.1" />
      </svg>

      <!-- France -->
      <svg *ngIf="code === 'FR'" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="8" height="16" fill="#002395" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ed2939" />
      </svg>

      <!-- Union européenne -->
      <svg *ngIf="code === 'EU'" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="16" fill="#003399" />
        <g fill="#ffcc00">
          <circle *ngFor="let a of euStarAngles" [attr.cx]="12 + 4.6 * cos(a)" [attr.cy]="8 + 4.6 * sin(a)" r="0.85" />
        </g>
      </svg>

      <!-- Vue consolidée groupe -->
      <svg *ngIf="code === 'GROUP'" viewBox="0 0 24 16" aria-hidden="true">
        <rect width="24" height="16" rx="2" fill="#0f766e" />
        <circle cx="12" cy="8" r="4.8" fill="none" stroke="#fff" stroke-width="1.1" />
        <path d="M7.2 8h9.6M12 3.2c1.9 2.6 1.9 7 0 9.6M12 3.2c-1.9 2.6-1.9 7 0 9.6"
              fill="none" stroke="#fff" stroke-width="0.9" />
      </svg>
    </span>
  `,
  styles: [`
    .flag {
      display: inline-block;
      border-radius: 3px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
      flex-shrink: 0;
      line-height: 0;
    }
    .flag svg { width: 100%; height: 100%; display: block; }
  `]
})
export class FlagIconComponent {
  @Input() code: FlagCode = 'GROUP';
  @Input() size = 22;
  @Input() title = '';

  /** Douze étoiles réparties sur un cercle, la première en haut. */
  readonly euStarAngles = Array.from({ length: 12 }, (_, i) => (i * 30 - 90) * (Math.PI / 180));

  cos(angle: number): number {
    return Math.cos(angle);
  }

  sin(angle: number): number {
    return Math.sin(angle);
  }
}
