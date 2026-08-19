import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { facteurSaisi } from '../../core/modification-masse';

/**
 * Correction des lignes qu'une bannière d'alerte signale.
 *
 * <p>Une bannière annonçant « 1 572 immobilisations sans catégorie carbone »
 * laissait l'utilisateur les chercher lui-même dans un tableau paginé de
 * plusieurs milliers de lignes, puis les corriger une à une par le formulaire
 * de saisie. La bannière devient le chemin le plus court vers ce qu'elle
 * signale, et le panneau réunit les corrections en un seul geste.</p>
 *
 * <p>Rien n'est écrit ici. Le panneau recueille les intentions — une catégorie,
 * un facteur, une suppression — et les rend à l'écran au moment de la
 * validation. Lui seul sait où vivent ses lignes, lesquelles relèvent du
 * magasin de répartition, et comment les enregistrer.</p>
 *
 * <p>Cette séparation n'est pas de la prudence d'architecte : appliquer au fil
 * de la frappe ferait recalculer le bilan à chaque caractère saisi, et priverait
 * l'utilisateur du droit de se raviser.</p>
 */

/** Correction retenue pour une ligne, avant validation. */
export interface CorrectionLigne {
  /** Identifiant de la ligne, tel que l'écran le connaît. */
  id: number | string;
  categorie?: string;
  facteur?: number;
  supprimee?: boolean;
}

export interface ResultatCorrections {
  /** Lignes à revaloriser, avec ce qui a changé. */
  corrections: CorrectionLigne[];
  /** Identifiants à retirer. */
  suppressions: Array<number | string>;
}

@Component({
  selector: 'app-correction-anomalies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="corr-voile" *ngIf="ouvert" (click)="demanderFermeture()">
      <div class="corr-panneau" (click)="$event.stopPropagation()">

        <header class="corr-entete">
          <div>
            <h3>{{ titre }}</h3>
            <p class="corr-sous-titre">
              {{ lignes.length }} ligne(s) en anomalie ·
              {{ nombreCorrigees }} corrigée(s) · {{ suppressions.size }} à retirer
            </p>
          </div>
          <button type="button" class="corr-fermer" (click)="demanderFermeture()"
                  aria-label="Fermer">✕</button>
        </header>

        <p class="corr-vide" *ngIf="!lignes.length">
          Plus aucune ligne en anomalie : les corrections ont toutes été appliquées.
        </p>

        <div class="corr-tableau" *ngIf="lignes.length">
          <table class="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Code article ERP</th>
                <th>Libellé</th>
                <th class="ta-right">Montant</th>
                <th *ngIf="corrigeCategorie">Catégorie carbone</th>
                <th class="ta-right">Facteur</th>
                <th class="ta-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ligne of lignes; trackBy: parIdentifiant"
                  [class.corr-retiree]="suppressions.has(identifiant(ligne))">

                <td>{{ valeur(ligne, champs.reference) || '—' }}</td>
                <td>{{ valeur(ligne, champs.codeArticle) || '—' }}</td>
                <td class="corr-libelle" [title]="valeur(ligne, champs.libelle)">
                  {{ valeur(ligne, champs.libelle) }}
                </td>
                <td class="ta-right">{{ nombre(ligne, champs.grandeur) | number:'1.0-2' }}</td>

                <td *ngIf="corrigeCategorie">
                  <input type="text" class="corr-saisie" list="corr-categories"
                         [ngModel]="categorieDe(ligne)"
                         (ngModelChange)="noterCategorie(ligne, $event)"
                         [disabled]="suppressions.has(identifiant(ligne))"
                         placeholder="ex. Metals / Metal Products">
                </td>

                <td class="ta-right">
                  <input type="text" inputmode="decimal" class="corr-saisie corr-saisie-courte"
                         [ngModel]="facteurDe(ligne)"
                         (ngModelChange)="noterFacteur(ligne, $event)"
                         [disabled]="suppressions.has(identifiant(ligne))"
                         placeholder="0,250">
                </td>

                <td class="ta-center">
                  <button type="button" class="corr-retirer"
                          [class.corr-retirer-actif]="suppressions.has(identifiant(ligne))"
                          [title]="suppressions.has(identifiant(ligne))
                            ? 'Annuler le retrait' : 'Retirer cette ligne du bilan'"
                          (click)="basculerSuppression(ligne)">
                    {{ suppressions.has(identifiant(ligne)) ? '↺' : '🗑️' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <datalist id="corr-categories">
            <option *ngFor="let categorie of categories" [value]="categorie"></option>
          </datalist>
        </div>

        <p class="corr-erreur" *ngIf="erreur">⚠ {{ erreur }}</p>

        <footer class="corr-pied">
          <p class="corr-resume">
            {{ nombreCorrigees }} correction(s) et {{ suppressions.size }} retrait(s) en attente.
            Rien n'est enregistré tant que vous n'avez pas validé.
          </p>
          <div class="corr-boutons">
            <button type="button" class="corr-annuler" (click)="demanderFermeture()">Annuler</button>
            <button type="button" class="corr-valider"
                    [disabled]="!nombreCorrigees && !suppressions.size"
                    (click)="valider()">
              Valider et appliquer les corrections
            </button>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }

    .corr-voile {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(15, 23, 42, .45);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }

    .corr-panneau {
      background: #fff; border-radius: 12px; border: 1px solid #E2E8F0;
      box-shadow: 0 20px 50px -12px rgba(15, 23, 42, .3);
      width: 100%;
      /* Sept colonnes métier : en deçà, la catégorie et le facteur se serrent
         au point qu'on corrige à l'aveugle. */
      min-width: min(950px, 96vw);
      max-width: min(1180px, 96vw);
      max-height: 88vh; display: flex; flex-direction: column;
    }

    .corr-entete {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: 16px 20px; border-bottom: 1px solid #EEF2F7;
    }
    .corr-entete h3 { margin: 0 0 2px; font-size: 15px; font-weight: 700; color: #0F172A; }
    .corr-sous-titre { margin: 0; font-size: 12.5px; color: #64748B; }

    .corr-fermer {
      background: #F1F5F9; border: none; width: 28px; height: 28px;
      border-radius: 8px; cursor: pointer; color: #475569; flex: 0 0 auto;
    }
    .corr-fermer:hover { background: #E2E8F0; }

    .corr-vide { margin: 0; padding: 28px 20px; text-align: center; font-size: 13px; color: #64748B; }

    .corr-tableau { overflow: auto; padding: 0 20px; flex: 1; min-height: 0; }
    .corr-tableau .data-table { width: 100%; border-collapse: collapse; min-width: 950px; }

    .corr-tableau th {
      position: sticky; top: 0; background: #F8FAFC; z-index: 1;
      text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .04em; color: #475569; padding: 10px 8px; border-bottom: 1px solid #E2E8F0;
    }
    .corr-tableau td {
      padding: 8px; font-size: 13px; border-bottom: 1px solid #EEF2F7; color: #334155;
    }

    .corr-retiree { opacity: .45; text-decoration: line-through; }

    .corr-libelle {
      max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .corr-saisie {
      width: 100%; min-width: 150px; padding: 5px 7px;
      border: 1px solid #CBD5E1; border-radius: 6px; font-size: 13px;
    }
    .corr-saisie:focus { outline: none; border-color: #1E92CD; }
    .corr-saisie:disabled { background: #F1F5F9; color: #94A3B8; }
    .corr-saisie-courte { min-width: 88px; width: 88px; text-align: right; }

    .corr-retirer {
      background: none; border: 1px solid #E2E8F0; border-radius: 6px;
      width: 30px; height: 28px; cursor: pointer; font-size: 13px;
    }
    .corr-retirer:hover { background: #FEF2F2; border-color: #FECACA; }
    .corr-retirer-actif { background: #FEF2F2; border-color: #FCA5A5; }

    .corr-erreur { margin: 10px 20px 0; font-size: 13px; color: #B91C1C; }

    .corr-pied {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px 20px; border-top: 1px solid #EEF2F7; flex-wrap: wrap;
    }
    .corr-resume { margin: 0; font-size: 12.5px; color: #64748B; max-width: 56ch; }
    .corr-boutons { display: flex; gap: 10px; }

    .corr-annuler {
      padding: 9px 16px; border-radius: 8px; border: 1px solid #CBD5E1;
      background: #fff; color: #475569; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .corr-annuler:hover { background: #F1F5F9; }

    .corr-valider {
      padding: 9px 18px; border-radius: 8px; border: none;
      background: #1E92CD; color: #fff; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .corr-valider:hover:not(:disabled) { background: #1878A8; }
    .corr-valider:disabled { opacity: .45; cursor: not-allowed; }
  `]
})
export class CorrectionAnomaliesComponent {

  @Input() ouvert = false;
  @Input() titre = 'Corriger les lignes en anomalie';

  /** Lignes signalées, telles que l'écran les détient. */
  @Input() lignes: any[] = [];

  /** Catégories proposées à la saisie, sans l'y contraindre. */
  @Input() categories: readonly string[] = [];

  /** La catégorie fait-elle partie de ce qu'il faut corriger ? */
  @Input() corrigeCategorie = true;

  /** Noms des champs que la ligne porte, propres à chaque écran. */
  @Input() champs: {
    identifiant: string; reference: string; codeArticle: string;
    libelle: string; grandeur: string; categorie: string; facteur: string;
  } = {
    identifiant: 'id', reference: 'referenceCarbone', codeArticle: 'codeArticle',
    libelle: 'designation', grandeur: 'montant', categorie: 'categorieCarbone',
    facteur: 'facteur'
  };

  @Output() fermer = new EventEmitter<void>();
  @Output() appliquer = new EventEmitter<ResultatCorrections>();

  /** Catégories saisies, par identifiant de ligne. */
  private categoriesSaisies = new Map<number | string, string>();
  /** Facteurs saisis, par identifiant de ligne. */
  private facteursSaisis = new Map<number | string, string>();

  suppressions = new Set<number | string>();
  erreur = '';

  identifiant(ligne: any): number | string {
    return ligne?.[this.champs.identifiant];
  }

  parIdentifiant = (_: number, ligne: any) => this.identifiant(ligne);

  valeur(ligne: any, champ: string): string {
    return String(ligne?.[champ] ?? '').trim();
  }

  nombre(ligne: any, champ: string): number {
    const brut = Number(ligne?.[champ] ?? 0);
    return Number.isFinite(brut) ? brut : 0;
  }

  categorieDe(ligne: any): string {
    const id = this.identifiant(ligne);
    return this.categoriesSaisies.has(id)
      ? this.categoriesSaisies.get(id)!
      : '';
  }

  facteurDe(ligne: any): string {
    const id = this.identifiant(ligne);
    return this.facteursSaisis.has(id) ? this.facteursSaisis.get(id)! : '';
  }

  noterCategorie(ligne: any, valeur: string): void {
    this.categoriesSaisies.set(this.identifiant(ligne), valeur ?? '');
    this.erreur = '';
  }

  noterFacteur(ligne: any, valeur: string): void {
    this.facteursSaisis.set(this.identifiant(ligne), valeur ?? '');
    this.erreur = '';
  }

  basculerSuppression(ligne: any): void {
    const id = this.identifiant(ligne);
    if (this.suppressions.has(id)) this.suppressions.delete(id);
    else this.suppressions.add(id);
    this.erreur = '';
  }

  /** Lignes portant au moins une saisie exploitable. */
  get nombreCorrigees(): number {
    return this.lignes.filter(ligne => {
      const id = this.identifiant(ligne);
      if (this.suppressions.has(id)) return false;
      return Boolean((this.categoriesSaisies.get(id) ?? '').trim())
        || facteurSaisi(this.facteursSaisis.get(id) ?? '') !== null;
    }).length;
  }

  demanderFermeture(): void {
    this.reinitialiser();
    this.fermer.emit();
  }

  /**
   * Rend les corrections à l'écran.
   *
   * <p>Une saisie de facteur illisible arrête la validation : appliquer les
   * autres et taire celle-là laisserait croire à une correction complète.</p>
   */
  valider(): void {
    const corrections: CorrectionLigne[] = [];

    for (const ligne of this.lignes) {
      const id = this.identifiant(ligne);
      if (this.suppressions.has(id)) continue;

      const categorie = (this.categoriesSaisies.get(id) ?? '').trim();
      const facteurBrut = (this.facteursSaisis.get(id) ?? '').trim();

      if (!categorie && !facteurBrut) continue;

      let facteur: number | undefined;
      if (facteurBrut) {
        const lu = facteurSaisi(facteurBrut);
        if (lu === null) {
          this.erreur = `Facteur illisible sur « ${this.valeur(ligne, this.champs.libelle)} » : `
            + 'saisissez une valeur strictement positive.';
          return;
        }
        facteur = lu;
      }

      corrections.push({ id, ...(categorie ? { categorie } : {}), ...(facteur ? { facteur } : {}) });
    }

    this.appliquer.emit({ corrections, suppressions: [...this.suppressions] });
    this.reinitialiser();
  }

  private reinitialiser(): void {
    this.categoriesSaisies.clear();
    this.facteursSaisis.clear();
    this.suppressions.clear();
    this.erreur = '';
  }
}
