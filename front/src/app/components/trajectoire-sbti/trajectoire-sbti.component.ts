import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  construireTrajectoire, effortRestant, statutTrajectoire, libellePerimetre,
  ExerciceBilan, PerimetreCible, PointTrajectoire
} from '../../core/trajectoire-sbti';

/**
 * Réel contre cible SBTi, de l'année de base à l'échéance.
 *
 * <p>Le graphique d'évolution du tableau de bord raconte l'histoire des
 * exercices collectés. Celui-ci répond à une autre question, la seule que pose
 * un vérificateur : où en sommes-nous de l'engagement, et combien reste-t-il à
 * retirer chaque année pour le tenir ?</p>
 *
 * <p>Le tracé du réel s'arrête au dernier exercice collecté. La cible, elle, se
 * prolonge jusqu'à l'échéance en trait discontinu — la discontinuité dit que
 * rien n'y a été mesuré.</p>
 */
@Component({
  selector: 'app-trajectoire-sbti',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trajectoire-sbti.component.html',
  styleUrl: './trajectoire-sbti.component.css'
})
export class TrajectoireSbtiComponent {

  /** Exercices chiffrés du périmètre consulté, en tonnes. */
  @Input({ required: true })
  set exercices(valeur: readonly ExerciceBilan[] | null | undefined) {
    this.serie.set(Array.isArray(valeur) ? [...valeur] : []);
  }

  /** Périmètre affiché ; nommé pour l'infobulle du tableau de bord. */
  @Input() titrePerimetre = '';

  private readonly serie = signal<ExerciceBilan[]>([]);

  // --- Paramètres de l'engagement, modifiables pour tester un scénario ---

  /**
   * Engagement Misfat Filtration : −42 % sur les scopes 1 et 3 à l'horizon
   * 2030, année de base 2021.
   *
   * <p>Ces valeurs sont modifiables à l'écran, mais elles ne sont pas
   * arbitraires : les changer revient à simuler un autre engagement, ce que le
   * bandeau signale.</p>
   *
   * <p>L'année de base était fixée à 2023 ; elle est ramenée à 2021 sur
   * indication du porteur du dossier. Elle commande tout le couloir — la valeur
   * de départ, la pente, et donc chaque écart du tableau —, si bien qu'une
   * erreur ici fausse la trajectoire entière sans rien casser de visible.</p>
   *
   * <p>La base n'est retenue que si l'exercice correspondant est chiffré :
   * {@code construireTrajectoire} retombe sinon sur le premier exercice
   * collecté, et l'encart « Année de base » affiche alors celle réellement
   * employée. La collecte débutant en 2022, c'est le cas tant que 2021 n'est
   * pas renseigné.</p>
   */
  readonly ANNEE_BASE_ENGAGEMENT = 2021;
  readonly ANNEE_CIBLE_ENGAGEMENT = 2030;
  readonly REDUCTION_ENGAGEMENT = 42;
  readonly PERIMETRE_ENGAGEMENT: PerimetreCible = 'SCOPES_1_3';

  readonly anneeBase = signal<number>(this.ANNEE_BASE_ENGAGEMENT);
  readonly anneeCible = signal<number>(this.ANNEE_CIBLE_ENGAGEMENT);
  readonly reductionPct = signal<number>(this.REDUCTION_ENGAGEMENT);
  readonly perimetre = signal<PerimetreCible>(this.PERIMETRE_ENGAGEMENT);

  readonly PERIMETRES: { code: PerimetreCible; libelle: string }[] = [
    { code: 'SCOPES_1_3', libelle: 'Scopes 1 + 3' },
    { code: 'TOTAL', libelle: 'Tous scopes' },
    { code: 'SCOPE_1', libelle: 'Scope 1' },
    { code: 'SCOPE_2', libelle: 'Scope 2' },
    { code: 'SCOPE_3', libelle: 'Scope 3' }
  ];

  /** Périmètre de l'engagement validé, rappelé quand l'écran le quitte. */
  readonly libellePerimetreEngagement = libellePerimetre(this.PERIMETRE_ENGAGEMENT);

  /** Les paramètres affichés sont-ils encore ceux de l'engagement validé ? */
  readonly engagementIntact = computed(() =>
    this.anneeBase() === this.ANNEE_BASE_ENGAGEMENT
    && this.anneeCible() === this.ANNEE_CIBLE_ENGAGEMENT
    && this.reductionPct() === this.REDUCTION_ENGAGEMENT
    && this.perimetre() === this.PERIMETRE_ENGAGEMENT);

  retablirEngagement(): void {
    this.anneeBase.set(this.ANNEE_BASE_ENGAGEMENT);
    this.anneeCible.set(this.ANNEE_CIBLE_ENGAGEMENT);
    this.reductionPct.set(this.REDUCTION_ENGAGEMENT);
    this.perimetre.set(this.PERIMETRE_ENGAGEMENT);
  }

  // --- Trajectoire ---

  readonly trajectoire = computed(() => construireTrajectoire(this.serie(), {
    anneeBase: this.anneeBase(),
    anneeCible: this.anneeCible(),
    reductionPct: this.reductionPct(),
    perimetre: this.perimetre()
  }));

  readonly statut = computed(() => statutTrajectoire(this.trajectoire()));
  readonly effortAnnuelRestant = computed(() => effortRestant(this.trajectoire()));
  readonly libelleDuPerimetre = computed(() => libellePerimetre(this.perimetre()));

  /** Nombre d'exercices réellement collectés dans le couloir. */
  readonly exercicesCollectes = computed(() =>
    this.trajectoire()?.points.filter(p => p.reel !== null).length ?? 0);

  /**
   * Année de base réellement employée, quand ce n'est pas celle demandée.
   *
   * <p>Une base non collectée ne peut pas servir de référence : la trajectoire
   * se rabat sur le premier exercice chiffré. Le repli est juste, mais il doit
   * se voir — sans quoi l'écran annonce une trajectoire « base 2021 » calculée
   * sur 2022, et l'écart affiché n'est pas celui que l'on croit lire.</p>
   *
   * @returns l'année substituée, ou `null` si la base demandée est bien celle
   *          employée.
   */
  readonly baseSubstituee = computed(() => {
    const t = this.trajectoire();
    return t && t.anneeBase !== this.anneeBase() ? t.anneeBase : null;
  });

  // --- Repère du tracé ---

  readonly larg = 720;
  readonly haut = 300;
  private readonly margeHaut = 20;
  private readonly margeBas = 34;
  private readonly margeGauche = 8;

  /**
   * Plafond de l'échelle.
   *
   * <p>Il retient le plus haut du réel et de la base : borner sur le seul réel
   * ferait sortir la cible du cadre quand la collecte démarre sous la base.</p>
   */
  private readonly plafond = computed(() => {
    const t = this.trajectoire();
    if (!t) return 0;
    const valeurs = t.points.map(p => Math.max(p.reel ?? 0, p.cible));
    return Math.max(...valeurs, t.valeurBase) * 1.08;
  });

  private x(annee: number): number {
    const t = this.trajectoire();
    if (!t || t.anneeCible === t.anneeBase) return this.margeGauche;

    const part = (annee - t.anneeBase) / (t.anneeCible - t.anneeBase);
    return this.margeGauche + part * (this.larg - 2 * this.margeGauche);
  }

  private y(valeur: number): number {
    const max = this.plafond();
    const utile = this.haut - this.margeHaut - this.margeBas;
    if (max <= 0) return this.haut - this.margeBas;
    return this.margeHaut + (1 - valeur / max) * utile;
  }

  /** Trait de la cible, de la base à l'échéance. */
  readonly traceCible = computed(() => {
    const t = this.trajectoire();
    if (!t) return '';
    return t.points
      .map((p, i) => `${i ? 'L' : 'M'} ${this.x(p.annee).toFixed(1)} ${this.y(p.cible).toFixed(1)}`)
      .join(' ');
  });

  /** Trait du réel : il s'arrête au dernier exercice collecté. */
  readonly traceReel = computed(() => {
    const collectes = this.trajectoire()?.points.filter(p => p.reel !== null) ?? [];
    return collectes
      .map((p, i) => `${i ? 'L' : 'M'} ${this.x(p.annee).toFixed(1)} ${this.y(p.reel!).toFixed(1)}`)
      .join(' ');
  });

  /**
   * Aire de dérive : la surface entre le réel et la cible quand le réel est
   * au-dessus. C'est la dette carbone accumulée, et elle se lit d'un coup.
   */
  readonly aireDerive = computed(() => {
    const collectes = this.trajectoire()?.points.filter(p => p.reel !== null) ?? [];
    if (collectes.length < 2) return '';

    const haut = collectes
      .map((p, i) => `${i ? 'L' : 'M'} ${this.x(p.annee).toFixed(1)} ${this.y(p.reel!).toFixed(1)}`)
      .join(' ');
    const bas = [...collectes].reverse()
      .map(p => `L ${this.x(p.annee).toFixed(1)} ${this.y(p.cible).toFixed(1)}`)
      .join(' ');

    return `${haut} ${bas} Z`;
  });

  /** Points collectés, marqués sur le tracé. */
  readonly marqueurs = computed(() =>
    (this.trajectoire()?.points ?? [])
      .filter(p => p.reel !== null)
      .map(p => ({
        annee: p.annee,
        cx: +this.x(p.annee).toFixed(1),
        cy: +this.y(p.reel!).toFixed(1),
        conforme: p.conforme === true,
        reel: p.reel!,
        cible: p.cible,
        ecart: p.ecart
      })));

  /** Bornes de l'axe horizontal, une graduation sur deux pour rester lisible. */
  readonly graduations = computed(() => {
    const t = this.trajectoire();
    if (!t) return [];

    return t.points
      .filter((p, i) => i === 0 || i === t.points.length - 1 || p.annee % 2 === 0)
      .map(p => ({ annee: p.annee, x: +this.x(p.annee).toFixed(1), projete: p.projete }));
  });

  /** Repères horizontaux, pour donner l'échelle. */
  readonly grille = computed(() => {
    const max = this.plafond();
    if (max <= 0) return [];

    return [1, 0.75, 0.5, 0.25, 0].map(part => ({
      y: +this.y(max * part).toFixed(1),
      libelle: this.abrege(max * part)
    }));
  });

  /** Ordonnée du plancher de la cible, pour le trait d'échéance. */
  readonly yCible = computed(() => {
    const t = this.trajectoire();
    return t ? +this.y(t.valeurCible).toFixed(1) : 0;
  });

  readonly xEcheance = computed(() => {
    const t = this.trajectoire();
    return t ? +this.x(t.anneeCible).toFixed(1) : 0;
  });

  readonly basGraphe = this.haut - this.margeBas;

  /** Lignes du tableau : seuls les exercices collectés ont un écart à montrer. */
  readonly lignesTableau = computed<PointTrajectoire[]>(() =>
    this.trajectoire()?.points ?? []);

  abrege(valeur: number): string {
    const absolu = Math.abs(valeur);
    const format = (n: number, d: number) =>
      n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

    if (absolu >= 1e6) return `${format(valeur / 1e6, 2)} M`;
    if (absolu >= 1e3) return `${format(valeur / 1e3, 1)} k`;
    return format(valeur, 0);
  }
}
