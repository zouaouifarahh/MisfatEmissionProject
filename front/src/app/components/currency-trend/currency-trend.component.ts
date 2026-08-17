import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, PLATFORM_ID,
  ViewChild, inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { forkJoin } from 'rxjs';

import { CurrencyService, Currency } from '../../services/currency.service';

Chart.register(...registerables);

/** Palette par devise, alignée sur la charte. */
const COULEURS: Record<string, string> = {
  EUR: '#2563eb',
  USD: '#0f766e',
  GBP: '#7c3aed',
  CHF: '#f97316',
  AED: '#db2777',
  MAD: '#059669'
};

/**
 * Évolution des cours de change, alimentée par `currency_exchange_rate`.
 *
 * <p>Les séries sont échantillonnées avant tracé : les 1 906 lignes de la table
 * représentent des cours quotidiens, en dessiner un point par jour saturerait
 * le canevas sans rien apporter à la lecture d'une tendance.</p>
 */
@Component({
  selector: 'app-currency-trend',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './currency-trend.component.html',
  styleUrl: './currency-trend.component.css'
})
export class CurrencyTrendComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly currencyService = inject(CurrencyService);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * Chart.js requiert un contexte 2D, que le rendu serveur n'expose pas.
   *
   * <p>Sans ce garde, la construction du graphique lève {@code NotYetImplemented}
   * pendant le rendu serveur dès que les cours sont effectivement reçus. Le
   * graphique se dessine au premier rendu navigateur ; le reste de la carte,
   * lui, reste rendu côté serveur.</p>
   */
  private readonly navigateur = isPlatformBrowser(inject(PLATFORM_ID));

  /** Devises tracées ; seules celles présentes en base seront retenues. */
  readonly devisesSouhaitees = ['EUR', 'USD', 'GBP', 'CHF', 'AED'];

  private chart?: Chart;

  chargement = true;
  erreur = '';
  devisesTracees: { code: string; couleur: string; dernier: number | null }[] = [];
  nbPoints = 0;
  devisesAbsentes: string[] = [];

  ngAfterViewInit(): void {
    this.charger();
  }

  ngOnDestroy(): void {
    // Le report de redimensionnement doit mourir avec le composant : sinon il
    // se déclenche sur un canevas détaché et lève « ownerDocument » — inoffensif
    // à l'écran, mais il pollue la sortie des tests.
    if (this.reportTaille !== null) clearTimeout(this.reportTaille);
    this.reportTaille = null;

    this.chart?.destroy();
    this.chart = undefined;
  }

  /** Report du redimensionnement, annulé à la destruction. */
  private reportTaille: ReturnType<typeof setTimeout> | null = null;

  private charger(): void {
    this.chargement = true;
    this.erreur = '';

    forkJoin(
      this.devisesSouhaitees.reduce((acc, code) => {
        acc[code] = this.currencyService.getExchangeRates(code);
        return acc;
      }, {} as Record<string, ReturnType<CurrencyService['getExchangeRates']>>)
    ).subscribe({
      next: series => {
        // L'ordre compte : `.canvas-wrap` porte `display: none` tant que
        // `chargement` est vrai. Construire le graphique avant de lever ce
        // drapeau ferait mesurer une largeur nulle à Chart.js, qui figerait
        // alors le canevas à une taille réduite.
        this.chargement = false;
        this.cdr.markForCheck();

        this.construire(series);
        this.ajusterTaille();
      },
      error: err => {
        this.chargement = false;
        this.erreur = err?.status === 0
          ? 'Service organisation injoignable (port 8083).'
          : `Chargement des cours impossible (code ${err?.status ?? '?'}).`;
        this.cdr.markForCheck();
      }
    });
  }

  private construire(series: Record<string, Currency[]>): void {
    // Axe temporel commun : union des dates de toutes les devises retenues.
    const dates = new Set<string>();
    const parDevise: Record<string, Map<string, number>> = {};

    this.devisesAbsentes = [];
    this.devisesTracees = [];

    for (const code of this.devisesSouhaitees) {
      const lignes = (series[code] ?? []).filter(l => l.rate != null && l.validFrom);
      if (lignes.length < 2) {
        this.devisesAbsentes.push(code);
        continue;
      }
      const carte = new Map<string, number>();
      for (const ligne of lignes) {
        const jour = ligne.validFrom!.slice(0, 10);
        carte.set(jour, Number(ligne.rate));
        dates.add(jour);
      }
      parDevise[code] = carte;
    }

    const axe = [...dates].sort();
    const echantillon = this.echantillonner(axe, 180);
    this.nbPoints = echantillon.length;

    const datasets = Object.entries(parDevise).map(([code, carte]) => {
      const couleur = COULEURS[code] ?? '#64748b';
      let dernierConnu: number | null = null;

      const donnees = echantillon.map(jour => {
        // Report du dernier cours connu : les week-ends n'ont pas de cotation.
        const valeur = carte.get(jour);
        if (valeur != null) dernierConnu = valeur;
        return dernierConnu;
      });

      this.devisesTracees.push({ code, couleur, dernier: dernierConnu });

      return {
        label: `1 ${code} = ? TND`.replace('?', ''),
        data: donnees,
        borderColor: couleur,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
        backgroundColor: (ctx: { chart: Chart }) => this.degrade(ctx.chart, couleur)
      };
    });

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: { labels: echantillon, datasets: datasets as never },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, font: { size: 12 } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            padding: 10,
            titleFont: { size: 12 },
            bodyFont: { size: 12 },
            callbacks: {
              label: item => `${item.dataset.label?.trim()} ${Number(item.parsed.y).toFixed(4)} TND`
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, font: { size: 11 }, color: '#94a3b8' },
            grid: { display: false }
          },
          y: {
            ticks: {
              font: { size: 11 },
              color: '#94a3b8',
              callback: v => `${Number(v).toFixed(2)}`
            },
            grid: { color: '#eef2f7' }
          }
        }
      }
    };

    if (!this.navigateur) {
      return;
    }
    this.chart?.destroy();
    this.chart = new Chart(this.canvasRef.nativeElement, config);
  }

  /**
   * Réaligne le canevas sur son conteneur une fois la vue rendue.
   *
   * <p>La détection de changements n'a pas encore retiré la classe masquante
   * quand le graphique est construit : le canevas conserverait les dimensions
   * mesurées à cet instant. Le report d'une tâche laisse Angular appliquer le
   * rendu avant la mesure définitive.</p>
   */
  private ajusterTaille(): void {
    if (this.reportTaille !== null) clearTimeout(this.reportTaille);
    this.reportTaille = setTimeout(() => {
      this.reportTaille = null;
      this.chart?.resize();
    });
  }

  /** Dégradé vertical sous la courbe, de la couleur de série vers le transparent. */
  private degrade(chart: Chart, couleur: string): CanvasGradient | string {
    const { ctx, chartArea } = chart;
    if (!chartArea) return 'transparent'; // premier rendu, aire pas encore calculée
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, this.avecAlpha(couleur, 0.28));
    gradient.addColorStop(1, this.avecAlpha(couleur, 0));
    return gradient;
  }

  private avecAlpha(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  /** Conserve au plus `max` points répartis régulièrement, dernier point inclus. */
  private echantillonner(axe: string[], max: number): string[] {
    if (axe.length <= max) return axe;
    const pas = Math.ceil(axe.length / max);
    const reduit = axe.filter((_, i) => i % pas === 0);
    if (reduit[reduit.length - 1] !== axe[axe.length - 1]) {
      reduit.push(axe[axe.length - 1]);
    }
    return reduit;
  }
}
