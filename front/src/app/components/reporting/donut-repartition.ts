import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Part d'une répartition, telle que le donut la trace et la légende la nomme.
 */
export interface PartRepartition {
  libelle: string;
  valeurKg: number;
  pct: number;
  couleur: string;
}

/** Arc calculé : ce que le tracé consomme, dérivé d'une {@link PartRepartition}. */
interface ArcDonut extends PartRepartition {
  longueur: number;
  reste: number;
  decalage: number;
}

/**
 * Diagramme en anneau d'une répartition, avec sa légende.
 *
 * <p>Le tracé est un SVG et non un dégradé conique : l'impression rend les
 * traits vectoriels sans dépendre de l'option « graphiques d'arrière-plan » du
 * navigateur, que peu d'utilisateurs pensent à activer. Un rapport qui perd ses
 * graphiques à l'impression n'est pas un rapport.</p>
 *
 * <p><strong>Deux encodages secondaires ne sont pas décoratifs.</strong> Les
 * couleurs de scope du produit — vert, orange, bleu — se séparent de 6,9 ΔE en
 * deutéranopie : au-dessus du plancher de 6, sous la cible de 8. À cette
 * distance la couleur seule ne suffit pas, et deux choses la secondent : un
 * écart de deux pixels entre les arcs, qui donne une frontière visible quelles
 * que soient les teintes, et une légende qui nomme chaque part avec sa valeur.
 * Les retirer rendrait le graphique illisible pour un lecteur sur douze.</p>
 *
 * <p>La légende est toujours rendue, jamais repliée : l'identité d'une part ne
 * doit jamais reposer sur sa seule couleur. Le tableau qui accompagne le donut
 * en est la troisième lecture.</p>
 */
@Component({
  selector: 'app-donut-repartition',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="dnt" [class.dnt-compact]="compact">
      <figcaption class="dnt-titre" *ngIf="titre">{{ titre }}</figcaption>

      <div class="dnt-corps" *ngIf="arcs.length; else rienATracer">
        <svg class="dnt-svg" viewBox="0 0 160 160" role="img" [attr.aria-label]="alternative">
          <!-- Piste de fond : elle tient le cercle quand une part est infime. -->
          <circle class="dnt-piste" cx="80" cy="80" [attr.r]="RAYON"></circle>

          <circle *ngFor="let arc of arcs; trackBy: parLibelle"
                  class="dnt-arc" cx="80" cy="80" [attr.r]="RAYON"
                  [attr.stroke]="arc.couleur"
                  [attr.stroke-dasharray]="arc.longueur + ' ' + arc.reste"
                  [attr.stroke-dashoffset]="arc.decalage">
            <title>{{ arc.libelle }} — {{ enTonnes(arc.valeurKg) }} tCO₂e ({{ enPourcent(arc.pct) }} %)</title>
          </circle>

          <text x="80" y="76" class="dnt-total">{{ enTonnes(totalKg) }}</text>
          <text x="80" y="92" class="dnt-unite">{{ unite }}</text>
        </svg>

        <ul class="dnt-legende">
          <li *ngFor="let arc of arcs; trackBy: parLibelle">
            <span class="dnt-pastille" [style.background]="arc.couleur" aria-hidden="true"></span>
            <span class="dnt-nom">{{ arc.libelle }}</span>
            <span class="dnt-valeur">{{ enTonnes(arc.valeurKg) }} t</span>
            <span class="dnt-pct">{{ enPourcent(arc.pct) }} %</span>
          </li>
        </ul>
      </div>

      <ng-template #rienATracer>
        <p class="dnt-vide">{{ messageVide }}</p>
      </ng-template>
    </figure>
  `,
  styles: [`
    .dnt {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .dnt-titre {
      font-size: .74rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #64748B;
    }

    .dnt-corps {
      display: flex;
      align-items: center;
      gap: 22px;
      flex-wrap: wrap;
    }

    .dnt-svg { width: 168px; height: 168px; flex-shrink: 0; }
    .dnt-compact .dnt-svg { width: 132px; height: 132px; }

    .dnt-piste {
      fill: none;
      stroke: #EEF2F6;
      stroke-width: 20;
    }

    /* Trait fin, extrémités franches : l'écart entre arcs doit rester lisible,
       et un bout arrondi le mangerait sur les parts étroites. */
    .dnt-arc {
      fill: none;
      stroke-width: 20;
      stroke-linecap: butt;
      transform: rotate(-90deg);
      transform-origin: 80px 80px;
    }

    .dnt-total {
      text-anchor: middle;
      font-size: 20px;
      font-weight: 800;
      fill: #1E3A52;
    }

    .dnt-unite {
      text-anchor: middle;
      font-size: 9px;
      letter-spacing: .08em;
      text-transform: uppercase;
      fill: #64748B;
    }

    .dnt-legende {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-width: 190px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .dnt-legende li {
      display: grid;
      grid-template-columns: 10px 1fr auto auto;
      align-items: baseline;
      gap: 9px;
      font-size: .78rem;
      line-height: 1.35;
    }

    .dnt-pastille {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      align-self: center;
    }

    .dnt-nom { color: #1E3A52; }

    /* Chiffres alignés en colonne : ils se comparent verticalement. */
    .dnt-valeur,
    .dnt-pct {
      font-variant-numeric: tabular-nums;
      color: #64748B;
      white-space: nowrap;
    }

    .dnt-valeur { font-weight: 700; color: #1E3A52; }
    .dnt-pct { min-width: 48px; text-align: right; }

    .dnt-vide {
      margin: 0;
      font-size: .8rem;
      font-style: italic;
      color: #64748B;
    }

    @media print {
      .dnt-corps { break-inside: avoid; page-break-inside: avoid; }
      .dnt-svg { width: 150px; height: 150px; }
    }
  `]
})
export class DonutRepartitionComponent {

  /** Rayon du cercle ; la circonférence en découle. */
  readonly RAYON = 62;
  private readonly CIRCONFERENCE = 2 * Math.PI * 62;

  /**
   * Écart entre deux arcs, en unités du tracé.
   *
   * <p>Encodage secondaire, pas ornement : il sépare deux parts que la couleur
   * seule ne sépare pas assez pour un lecteur daltonien.</p>
   */
  private readonly ECART = 2;

  @Input() titre = '';
  @Input() unite = 'tCO₂e';
  @Input() compact = false;
  @Input() messageVide = 'Aucune émission chiffrée sur ce périmètre.';

  /** Description du graphique pour les lecteurs d'écran. */
  @Input() alternative = 'Répartition des émissions';

  @Input() parts: PartRepartition[] = [];

  get totalKg(): number {
    return this.parts.reduce((somme, part) => somme + part.valeurKg, 0);
  }

  /**
   * Arcs à tracer.
   *
   * <p>Une part nulle n'est pas tracée : elle ne dessinerait rien mais
   * consommerait une entrée de légende, et la légende doit dire ce que le
   * cercle montre.</p>
   */
  get arcs(): ArcDonut[] {
    const parts = this.parts.filter(part => part.valeurKg > 0);
    const total = parts.reduce((somme, part) => somme + part.valeurKg, 0);
    if (!total) return [];

    let curseur = 0;

    return parts.map(part => {
      const fraction = part.valeurKg / total;
      const brute = fraction * this.CIRCONFERENCE;

      // L'écart est pris sur l'arc, jamais ajouté : la somme des parts doit
      // rester le cercle entier. Une part plus étroite que l'écart garde un
      // filet visible plutôt que de disparaître.
      const longueur = parts.length > 1
        ? Math.max(brute - this.ECART, 1)
        : brute;

      const arc: ArcDonut = {
        ...part,
        pct: fraction * 100,
        longueur,
        reste: this.CIRCONFERENCE - longueur,
        decalage: -curseur
      };

      curseur += brute;
      return arc;
    });
  }

  /**
   * Part en pourcentage, dans la même convention que les tonnages.
   *
   * <p>Le pipe `number` d'Angular suit la locale enregistrée par l'application
   * — l'anglaise, faute d'en avoir enregistré une autre — et rendait « 66.9 % »
   * à côté de « 5,32 t ». Deux séparateurs décimaux dans la même ligne de
   * légende font douter du nombre avant de faire douter du logiciel.</p>
   */
  enPourcent(pct: number): string {
    return pct.toLocaleString('fr-FR', {
      minimumFractionDigits: 1, maximumFractionDigits: 1
    });
  }

  enTonnes(kg: number): string {
    const tonnes = kg / 1000;
    const decimales = tonnes > 0 && tonnes < 10 ? 2 : tonnes < 1000 ? 1 : 0;
    return tonnes.toLocaleString('fr-FR', {
      minimumFractionDigits: decimales, maximumFractionDigits: decimales
    });
  }

  parLibelle = (_: number, arc: ArcDonut) => arc.libelle;
}
