import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  MesuresServeurService, MesureServeur, mesureDuPerimetre
} from '../../services/mesures-serveur.service';
import { PerimetreOrganisation, ORGANISATION_GROUPE } from '../../core/perimetre';

/**
 * Mesures que la base porte pour la catégorie d'un écran.
 *
 * <p>Le tableau de bord agrège deux gisements — les saisies du navigateur et
 * les mesures du serveur — quand les écrans de saisie ne lisaient que le
 * premier. « Actifs loués en amont » pesait vingt-huit mille tonnes au bilan et
 * affichait « aucun actif loué enregistré » sur son propre écran : le chiffre
 * existait, l'écran chargé de le documenter le niait, et rien ne disait lequel
 * des deux avait tort.</p>
 *
 * <p>Ce panneau est en lecture seule et le dit. Ces mesures viennent d'un import
 * ou d'une saisie serveur ; les corriger d'ici demanderait un chemin d'écriture
 * que la base n'expose pas encore. Les montrer sans pouvoir les modifier vaut
 * mieux que de laisser croire qu'elles n'existent pas.</p>
 */
@Component({
  selector: 'app-mesures-serveur',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ms-bloc" *ngIf="mesures.length">
      <div class="ms-entete">
        <span aria-hidden="true">🗄️</span>
        <strong>{{ mesures.length }} mesure(s) enregistrée(s) en base</strong>
        <span class="ms-total">{{ totalTonnes | number:'1.0-2' }} tCO₂e</span>
      </div>

      <p class="ms-note">
        Ces lignes viennent du serveur — import de classeur ou saisie centrale — et
        comptent déjà au tableau de bord. Elles sont montrées ici en lecture seule :
        leur correction passe par l'écran d'import, non par ce tableau.
      </p>

      <div class="ms-table-zone">
        <table class="ms-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Base appliquée</th>
              <th class="ms-droite">Quantité</th>
              <th>Unité</th>
              <th class="ms-droite">Émissions (kgCO₂e)</th>
              <th>Date</th>
              <th>Provenance</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of mesures">
              <td class="ms-fort">{{ m.libelle }}</td>
              <td>{{ m.baseAppliquee || '—' }}</td>
              <td class="ms-droite">{{ m.quantite | number:'1.0-2' }}</td>
              <td>{{ m.unite || '—' }}</td>
              <td class="ms-droite ms-fort">{{ m.emissionKg | number:'1.0-2' }}</td>
              <td>{{ m.date || '—' }}</td>
              <td>{{ m.origine || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .ms-bloc {
      margin: 0 0 16px;
      padding: 13px 15px;
      border: 1px solid #DDE6EE;
      border-radius: 10px;
      background: #F7FAFC;
    }

    .ms-entete {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #2D3B48;
    }

    .ms-total { margin-left: auto; font-weight: 800; color: #14532D; }

    .ms-note {
      margin: 6px 0 10px;
      font-size: 12px;
      line-height: 1.5;
      color: #55606D;
    }

    /* Le tableau défile dans son propre cadre : la page ne doit jamais partir
       en travers pour une colonne de trop. */
    .ms-table-zone { overflow-x: auto; }

    .ms-table { width: 100%; border-collapse: collapse; font-size: 12px; }

    .ms-table th {
      text-align: left;
      padding: 6px 9px;
      border-bottom: 1px solid #DDE6EE;
      font-weight: 700;
      color: #55606D;
      white-space: nowrap;
    }

    .ms-table td {
      padding: 6px 9px;
      border-bottom: 1px solid #EDF2F6;
      color: #2D3B48;
    }

    .ms-table tbody tr:last-child td { border-bottom: 0; }
    .ms-droite { text-align: right; }
    .ms-fort { font-weight: 700; }
  `]
})
export class MesuresServeurComponent {

  private readonly service = inject(MesuresServeurService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Numéro de catégorie GHG documenté par l'écran, pour le Scope 3.
   *
   * <p>C'est le seul repère univoque entre les deux nomenclatures : la base
   * écrit « Category 8: Upstream leased assets » là où l'écran dit « Actifs
   * loués en amont », et les libellés ne se rejoignent jamais. Le numéro, lui,
   * ne bouge pas.</p>
   */
  @Input() numeroGhg: number | null = null;

  /**
   * Libellés supplémentaires que cet écran documente.
   *
   * <p>Les Scopes 1 et 2 n'ont pas de numéro GHG, et un même poste y porte
   * souvent deux intitulés — le français saisi à la main, l'anglais venu de
   * l'import. Le rapprochement se fait sans accents ni ponctuation.</p>
   */
  @Input() categories: string[] = [];

  /** Exercice consulté ; `null` en vue pluriannuelle. */
  @Input() exercice: number | null = null;

  /** Périmètre organisationnel consulté. */
  @Input() organisation: PerimetreOrganisation = ORGANISATION_GROUPE;

  private toutes: MesureServeur[] = [];

  constructor() {
    this.service.mesures().subscribe({
      next: mesures => {
        this.toutes = mesures;
        this.cdr.markForCheck();
      },
      // Le serveur muet ne doit pas casser l'écran de saisie : le panneau reste
      // simplement absent, et les lignes locales continuent de s'afficher.
      error: () => { this.toutes = []; this.cdr.markForCheck(); }
    });
  }

  /** Mesures de la catégorie, dans le périmètre consulté. */
  get mesures(): MesureServeur[] {
    const attendues = new Set(this.categories.map(c => clef(c)));

    return this.toutes.filter(m =>
      this.documenteLaCategorie(m.categorie, attendues)
      && mesureDuPerimetre(m, this.exercice, this.organisation));
  }

  /**
   * Le libellé de la base relève-t-il de cet écran ?
   *
   * <p>Le numéro doit être suivi d'une frontière : sans elle, « Category 1 »
   * capterait « Category 15 », et les investissements viendraient grossir les
   * biens et services achetés.</p>
   */
  private documenteLaCategorie(categorie: string, attendues: Set<string>): boolean {
    const cle = clef(categorie);
    if (!cle) return false;

    if (this.numeroGhg !== null) {
      const numero = /^category(\d{1,2})/.exec(cle)?.[1];
      if (numero && Number(numero) === this.numeroGhg) return true;
    }

    return attendues.has(cle);
  }

  /** Total du panneau, en tonnes — l'unité du tableau de bord. */
  get totalTonnes(): number {
    return this.mesures.reduce((somme, m) => somme + m.emissionKg, 0) / 1000;
  }
}

/** Forme comparable d'un libellé : sans accents, sans ponctuation, en minuscules. */
function clef(valeur: string | null | undefined): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}
