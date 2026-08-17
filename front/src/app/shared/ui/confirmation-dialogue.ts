import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ConfirmationService } from './confirmation.service';

/**
 * Boîte de confirmation de l'application.
 *
 * <p>Posée une seule fois à la racine : n'importe quel écran la sollicite par
 * {@link ConfirmationService}, sans avoir à la déclarer.</p>
 */
@Component({
  selector: 'app-confirmation-dialogue',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="conf-voile" *ngIf="demande()" (click)="annuler()">
      <div class="conf-boite" role="alertdialog" aria-modal="true"
           [attr.aria-label]="demande()!.titre" (click)="$event.stopPropagation()">

        <div class="conf-icone" [class.conf-icone-danger]="estDanger()" aria-hidden="true">
          {{ estDanger() ? '⚠️' : 'ℹ️' }}
        </div>

        <h3 class="conf-titre">{{ demande()!.titre }}</h3>
        <p class="conf-message">{{ demande()!.message }}</p>

        <ul class="conf-consequences" *ngIf="demande()!.consequences?.length">
          <li *ngFor="let ligne of demande()!.consequences">{{ ligne }}</li>
        </ul>

        <div class="conf-actions">
          <button type="button" class="conf-btn conf-btn-annuler" (click)="annuler()">
            {{ demande()!.libelleAnnulation || 'Annuler' }}
          </button>
          <button type="button" class="conf-btn"
                  [class.conf-btn-danger]="estDanger()"
                  [class.conf-btn-avertir]="!estDanger()"
                  (click)="confirmer()" autofocus>
            {{ demande()!.libelleAction || 'Oui, supprimer' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; }

    .conf-voile {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(2px);
    }

    .conf-boite {
      width: 100%;
      max-width: 424px;
      padding: 26px 26px 20px;
      border-radius: 15px;
      background: #ffffff;
      border: 1px solid #E2E8F0;
      box-shadow: 0 22px 48px -14px rgba(15, 23, 42, 0.35);
      text-align: center;
    }

    .conf-icone {
      width: 56px;
      height: 56px;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 26px;
      background: #FEF3C7;
      border: 1px solid #FDE68A;
    }

    /* Une suppression irréversible s'annonce en rouge, pas en ambre. */
    .conf-icone-danger { background: #FEE2E2; border-color: #FECACA; }

    .conf-titre {
      margin: 0 0 8px;
      font-size: 17px;
      font-weight: 800;
      color: #1E293B;
    }

    .conf-message {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: #475569;
    }

    .conf-consequences {
      margin: 13px 0 0;
      padding: 11px 14px 11px 30px;
      text-align: left;
      border-radius: 10px;
      background: #FFFBF5;
      border: 1px solid #F5DCC2;
      font-size: 12px;
      line-height: 1.65;
      color: #B4652F;
    }

    .conf-actions {
      display: flex;
      gap: 10px;
      margin-top: 22px;
    }

    .conf-btn {
      flex: 1;
      padding: 10px 16px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid transparent;
      transition: filter 0.15s ease;
    }

    .conf-btn:hover { filter: brightness(0.96); }

    .conf-btn-annuler {
      color: #475569;
      background: #F1F5F9;
      border-color: #E2E8F0;
    }

    .conf-btn-danger { color: #ffffff; background: #DC2626; border-color: #DC2626; }
    .conf-btn-avertir { color: #ffffff; background: #D97706; border-color: #D97706; }
  `]
})
export class ConfirmationDialogueComponent {

  private readonly service = inject(ConfirmationService);

  readonly demande = this.service.demande;

  estDanger(): boolean {
    return (this.demande()?.gravite ?? 'danger') === 'danger';
  }

  confirmer(): void { this.service.confirmer(); }
  annuler(): void { this.service.annuler(); }

  /** La touche d'échappement vaut renoncement, comme partout ailleurs. */
  @HostListener('document:keydown.escape')
  surEchappement(): void {
    if (this.demande()) this.service.annuler();
  }
}
