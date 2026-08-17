import { ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CurrencyService, WeeklyRate } from '../../services/currency.service';

/** Devise affichée dans le bandeau, prête pour le gabarit. */
interface LigneTicker {
  code: string;
  label: string;
  paire: string;
  rate: number | null;
  variation: number | null;
  sens: 'hausse' | 'baisse' | 'stable' | 'inconnu';
}

/** Cours de repli, appliqués tant que le référentiel n'a pas répondu. */
const REPLI: Record<string, number> = { EUR: 3.38, USD: 3.12 };

/**
 * Bandeau des taux de change de la semaine.
 *
 * <p>Sert la comptabilité carbone monétaire : les facteurs libellés en euros ou
 * en dollars ne sont additionnables au reste du bilan qu'une fois ramenés au
 * dinar, et le cours retenu pour l'exercice est celui de la semaine.</p>
 *
 * <p>Les cours viennent d'{@code organization-service}, propriétaire de la table
 * {@code currency_exchange_rate}. Un service injoignable ne masque pas le
 * bandeau : les cours de repli s'affichent, signalés comme tels, pour que la
 * mise en page du tableau de bord reste stable.</p>
 */
@Component({
  selector: 'app-exchange-ticker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exchange-ticker.component.html',
  styleUrl: './exchange-ticker.component.css'
})
export class ExchangeTickerComponent implements OnInit {

  private readonly currencyService = inject(CurrencyService);
  private readonly cdr = inject(ChangeDetectorRef);

  private static readonly JOURS = [
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
  ];

  lignes: LigneTicker[] = [];
  chargement = true;
  /** Vrai tant que les cours affichés ne viennent pas du référentiel. */
  replique = false;

  private debutSemaine: Date = this.lundiDe(new Date());
  numeroSemaine = 0;
  /** Date effectivement retenue pour la semaine affichée. */
  private jourObserve: Date = new Date();

  /**
   * Rendu compact, destiné à l'en-tête du tableau de bord.
   *
   * <p>Seules les paires et leurs variations sont affichées : le repère
   * temporel est déjà porté par la bannière, le répéter consommerait la place
   * que la refonte cherche justement à récupérer.</p>
   */
  @Input() compact = false;

  private referenceCourante: string | null = null;

  /**
   * Jour d'observation, au format `AAAA-MM-JJ`.
   *
   * <p>Piloté par le périmètre du tableau de bord : sélectionner l'exercice
   * 2025 fait afficher les cours réellement enregistrés pour la semaine
   * correspondante de 2025, et non ceux de la semaine en cours. Sans cette
   * bascule, un bilan carbone monétaire 2025 serait valorisé à des taux 2026.</p>
   */
  @Input()
  set referenceDate(valeur: string | null | undefined) {
    const normalisee = valeur || null;
    if (normalisee === this.referenceCourante) return;
    this.referenceCourante = normalisee;
    this.charger();
  }

  ngOnInit(): void {
    // Le setter s'est déjà déclenché si le parent a fourni une date ; sinon on
    // part de la semaine courante.
    if (this.chargement && !this.lignes.length) {
      this.charger();
    }
  }

  private charger(): void {
    const jour = this.dateDe(this.referenceCourante) ?? new Date();
    this.jourObserve = jour;
    this.debutSemaine = this.lundiDe(jour);
    this.numeroSemaine = this.semaineIsoDe(jour);
    this.chargement = true;

    if (!this.lignes.length) {
      this.lignes = this.construireRepli();
    }

    this.currencyService.getWeeklyRates(['EUR', 'USD'], this.referenceCourante).subscribe({
      next: cours => {
        const exploitables = cours.filter(c => c.rate != null);
        if (exploitables.length) {
          this.lignes = exploitables.map(c => this.versLigne(c));
          this.debutSemaine = this.dateDe(exploitables[0].weekStart) ?? this.debutSemaine;
          this.numeroSemaine = exploitables[0].weekNumber || this.numeroSemaine;
          this.replique = false;
        } else {
          // Aucun cours en base pour cette semaine : mieux vaut l'afficher que
          // laisser croire à des taux applicables.
          this.lignes = this.construireRepli();
          this.replique = true;
        }
        this.chargement = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // Le bandeau reste lisible ; la mention « cours indicatifs » signale
        // que la valeur n'engage pas la clôture comptable.
        this.lignes = this.construireRepli();
        this.chargement = false;
        this.replique = true;
        this.cdr.markForCheck();
      }
    });
  }

  /** « Semaine du Lundi 03/08/2026 ». */
  get libelleSemaine(): string {
    return `Semaine du Lundi ${this.formaterDate(this.debutSemaine)}`;
  }

  /**
   * « Lundi 03 août 2026 » : jour d'observation.
   *
   * <p>C'est la date du périmètre analysé, pas nécessairement celle du jour :
   * consulter l'exercice 2025 affiche un repère de 2025.</p>
   */
  get libelleAujourdhui(): string {
    const nom = ExchangeTickerComponent.JOURS[this.jourObserve.getDay()];
    return `${nom} ${this.jourObserve.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  }

  /** Vrai si le bandeau montre une semaine passée et non la semaine en cours. */
  get estHistorique(): boolean {
    return this.lundiDe(new Date()).getTime() !== this.debutSemaine.getTime();
  }

  private versLigne(cours: WeeklyRate): LigneTicker {
    return {
      code: cours.code,
      label: cours.label,
      paire: `${cours.code} / TND`,
      rate: cours.rate,
      variation: cours.variationPercent,
      sens: this.sensDe(cours.variationPercent)
    };
  }

  private sensDe(variation: number | null): LigneTicker['sens'] {
    if (variation == null) return 'inconnu';
    if (variation > 0) return 'hausse';
    if (variation < 0) return 'baisse';
    return 'stable';
  }

  private construireRepli(): LigneTicker[] {
    return Object.entries(REPLI).map(([code, rate]) => ({
      code,
      label: code === 'EUR' ? 'Euro' : 'Dollar américain',
      paire: `${code} / TND`,
      rate,
      variation: null,
      sens: 'inconnu' as const
    }));
  }

  private lundiDe(jour: Date): Date {
    const lundi = new Date(jour);
    // getDay() place dimanche à 0 : on le ramène en fin de semaine ISO.
    const decalage = (lundi.getDay() + 6) % 7;
    lundi.setDate(lundi.getDate() - decalage);
    return lundi;
  }

  /** Numéro de semaine ISO 8601, celui qu'utilise le contrôle de gestion. */
  private semaineIsoDe(jour: Date): number {
    const repere = new Date(Date.UTC(jour.getFullYear(), jour.getMonth(), jour.getDate()));
    // Le jeudi de la semaine détermine l'année ISO de rattachement.
    repere.setUTCDate(repere.getUTCDate() + 4 - (repere.getUTCDay() || 7));
    const premierJanvier = new Date(Date.UTC(repere.getUTCFullYear(), 0, 1));
    return Math.ceil(((repere.getTime() - premierJanvier.getTime()) / 86400000 + 1) / 7);
  }

  private dateDe(iso: string | null): Date | null {
    if (!iso) return null;
    const date = new Date(`${iso}T00:00:00`);
    return isNaN(date.getTime()) ? null : date;
  }

  private formaterDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
