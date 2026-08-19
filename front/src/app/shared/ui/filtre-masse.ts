import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { appliquerFacteurEnMasse, facteurSaisi, ChampsMasse } from '../../core/modification-masse';

/**
 * Filtre métier d'un écran, et reprise du facteur sur ce qu'il sélectionne.
 *
 * <p>Chaque écran filtre selon ce qu'il documente : la combustion par fluide,
 * les déchets par type, les transports par mode. Ce vocabulaire est celui de la
 * saisie manuelle, et le filtre le reprend tel quel plutôt que d'imposer une
 * dimension étrangère à l'écran.</p>
 *
 * <p>Les valeurs proposées sont relevées dans les lignes présentes, non dans
 * une liste figée : un mode de transport importé mais absent du formulaire
 * resterait autrement infiltrable, alors même qu'il pèse dans le total.</p>
 *
 * <p>Le composant ne modifie rien lui-même. Il annonce le filtre choisi et le
 * facteur demandé ; l'écran reste seul à écrire dans ses lignes et à les
 * enregistrer.</p>
 */
@Component({
  selector: 'app-filtre-masse',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <select class="filter-dropdown" [ngModel]="valeur" (ngModelChange)="choisir($event)"
            [attr.aria-label]="'Filtrer par ' + libelle">
      <option value="Tous">{{ libelleTous }}</option>
      <option *ngFor="let option of options" [value]="option">{{ option }}</option>
    </select>

    <!-- Le bouton n'apparaît qu'une fois le filtre posé : appliquer un facteur
         à tout un écran n'aurait pas de sens, un facteur documente une nature. -->
    <button class="btn-masse" *ngIf="disponible" type="button" (click)="ouvrir()"
            title="Appliquer un facteur à toutes les lignes filtrées">
      ⚖️ Facteur en masse ({{ lignes.length }})
    </button>

    <div class="masse-panneau" *ngIf="ouvert">
      <div class="masse-entete">
        <strong>⚖️ Reprise du facteur — {{ valeur }}</strong>
        <button class="close-modal" type="button" (click)="fermer()" aria-label="Fermer">×</button>
      </div>

      <p class="masse-portee">
        {{ lignes.length }} ligne(s) seront reprises. Les lignes issues de la
        ventilation comptable ne le sont pas : le magasin de répartition les
        recalcule à chaque import.
      </p>

      <div class="masse-saisie">
        <label [attr.for]="'masse-' + champ">Nouveau facteur</label>
        <input [attr.id]="'masse-' + champ" type="text" inputmode="decimal"
               [(ngModel)]="saisie" placeholder="ex. 0,42" class="search-input"
               (keydown.enter)="appliquer()" (keydown.escape)="fermer()">
        <button class="btn-new" type="button" (click)="appliquer()">Appliquer</button>
        <button class="btn-annuler" type="button" (click)="fermer()">Annuler</button>
      </div>

      <p class="masse-erreur" *ngIf="erreur">⚠ {{ erreur }}</p>
    </div>

    <p class="masse-compte-rendu" *ngIf="compteRendu">
      ✓ {{ compteRendu }}
      <button class="close-alert" type="button" (click)="compteRendu = ''"
              aria-label="Masquer">×</button>
    </p>
  `,
  styles: [`
    :host { display: contents; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }

    .btn-masse {
      padding: 8px 14px; border-radius: 8px; border: 1px solid #D97706;
      background: #FFFBF5; color: #B4652F; font-weight: 600; font-size: 13px;
      cursor: pointer; white-space: nowrap;
    }
    .btn-masse:hover { background: #FFF4E6; }
    .btn-masse:focus-visible { outline: 2px solid #1E92CD; outline-offset: 2px; }

    .masse-panneau {
      flex-basis: 100%; margin: 10px 0 2px; padding: 14px 16px;
      border: 1px solid #FDBA74; border-left: 4px solid #D97706;
      border-radius: 10px; background: #FFFBF5; max-width: 100%;
    }

    .masse-entete {
      display: flex; align-items: center; justify-content: space-between; color: #7C3D12;
    }

    .masse-portee { margin: 8px 0 12px; font-size: 13px; color: #78350F; max-width: 72ch; }

    .masse-saisie { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .masse-saisie label { font-size: 13px; font-weight: 600; color: #7C3D12; }
    .masse-saisie .search-input {
      max-width: 180px; padding: 8px 10px; border: 1px solid #CBD5E1; border-radius: 8px;
    }

    .btn-new {
      padding: 8px 16px; border-radius: 8px; border: none; background: #1E92CD;
      color: #fff; font-weight: 600; font-size: 13px; cursor: pointer;
    }

    .btn-annuler {
      padding: 8px 16px; border-radius: 8px; border: 1px solid #CBD5E1;
      background: #fff; color: #475569; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .btn-annuler:hover { background: #F1F5F9; border-color: #94A3B8; }
    .btn-annuler:focus-visible { outline: 2px solid #1E92CD; outline-offset: 2px; }

    .masse-erreur { margin: 10px 0 0; font-size: 13px; color: #B91C1C; }

    .masse-compte-rendu {
      flex-basis: 100%; display: flex; align-items: center; gap: 10px;
      margin: 8px 0 0; padding: 10px 14px; border-radius: 8px;
      background: #F0FDF4; border: 1px solid #BBF7D0; color: #166534; font-size: 13px;
    }

    .close-modal, .close-alert {
      border: none; background: transparent; cursor: pointer; font-size: 18px;
      line-height: 1; color: inherit;
    }
  `]
})
export class FiltreMasseComponent {

  /** Lignes déjà filtrées par l'écran, celles que la reprise touchera. */
  @Input() lignes: any[] = [];

  /** Toutes les lignes de l'écran, d'où les valeurs proposées sont tirées. */
  @Input() source: any[] = [];

  /** Champ métier filtré — « emissionSource », « typeDechet », « mode »… */
  @Input({ required: true }) champ = '';

  /** Intitulé du champ, tel que le formulaire de saisie le nomme. */
  @Input() libelle = 'catégorie';

  /** Intitulé de l'option qui n'exclut rien. */
  @Input() libelleTous = 'Toutes les catégories';

  @Input() valeur = 'Tous';
  @Output() valeurChange = new EventEmitter<string>();

  /** Champs que la reprise écrit sur chaque ligne. */
  @Input({ required: true }) champsMasse!: ChampsMasse;

  /** Lignes reprises, rendues à l'écran qui les enregistrera. */
  @Output() reprises = new EventEmitter<{ avant: any[]; apres: any[]; message: string }>();

  ouvert = false;
  saisie = '';
  erreur = '';
  compteRendu = '';

  /**
   * Valeurs de référence de l'écran, telles que sa saisie manuelle les propose.
   *
   * <p>Elles garnissent la liste quand aucune ligne n'est encore saisie : un
   * écran vide affichait autrement un filtre vide, et rien n'indiquait ce qu'il
   * savait documenter.</p>
   */
  @Input() optionsParDefaut: readonly string[] = [];

  /**
   * Valeurs proposées : celles du référentiel de l'écran, plus celles que les
   * lignes portent réellement.
   *
   * <p>La réunion des deux, et non l'une ou l'autre. Une liste figée laisserait
   * hors du filtre toute valeur venue d'un import et absente du formulaire —
   * précisément celles qu'on cherche à reprendre ; les seules valeurs présentes,
   * elles, laisseraient un écran vierge sans aucun choix.</p>
   */
  get options(): string[] {
    const presentes = (this.source ?? [])
      .map(ligne => String(ligne?.[this.champ] ?? '').trim())
      .filter(Boolean);

    const referencees = (this.optionsParDefaut ?? [])
      .map(valeur => String(valeur ?? '').trim())
      .filter(Boolean);

    return [...new Set([...referencees, ...presentes])]
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  get disponible(): boolean {
    return this.valeur !== 'Tous' && this.lignes.length > 0;
  }

  choisir(valeur: string): void {
    this.valeur = valeur;
    this.valeurChange.emit(valeur);
    if (valeur === 'Tous') this.fermer();
  }

  ouvrir(): void {
    this.ouvert = true;
    this.saisie = '';
    this.erreur = '';
    this.compteRendu = '';
  }

  fermer(): void {
    this.ouvert = false;
    this.erreur = '';
  }

  /**
   * Applique le facteur saisi aux lignes filtrées.
   *
   * <p>Le composant ne persiste rien : il rend les lignes reprises et laisse
   * l'écran décider de les enregistrer, puisque lui seul sait où elles vivent
   * et lesquelles relèvent du magasin de répartition.</p>
   */
  appliquer(): void {
    const facteur = facteurSaisi(this.saisie);

    if (facteur === null) {
      this.erreur = 'Saisissez un facteur strictement positif — par exemple 0,42.';
      return;
    }

    const avant = this.lignes;
    const { lignes, modifiees, message } =
      appliquerFacteurEnMasse(avant, facteur, this.champsMasse);

    this.erreur = '';
    this.compteRendu = message;
    this.ouvert = false;

    if (modifiees) this.reprises.emit({ avant, apres: lignes, message });
  }
}
