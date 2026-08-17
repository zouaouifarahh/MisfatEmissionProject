import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

import { OrganizationService } from '../services/organization.service';
import { AnneeReference, Filiale } from '../models/organization.model';
import { EntityContextService } from './entity-context.service';

/**
 * Filtres du rapport de bilan carbone : pays et exercice.
 *
 * <p>Le tableau de bord filtre par société et par usine ; le rapport, lui, se lit
 * par <strong>pays</strong> — c'est le mix électrique national qui commande le
 * facteur d'émission, et le lecteur d'un rapport raisonne en implantations, non
 * en identifiants de filiale.</p>
 *
 * <p>Le pays n'est pas une donnée nouvelle : il est porté par
 * {@link Filiale#pays}. Ce service ne fait que le remonter en axe de premier
 * plan, et retrouver les sociétés qui s'y rattachent.</p>
 *
 * <p>L'état vit en <em>signals</em> : les sélecteurs de l'écran écrivent, les
 * vues dérivées se recalculent d'elles-mêmes. Le filtre du tableau de bord
 * ({@link EntityContextService}) est tenu en accord par un effet, pour que les
 * deux écrans ne se contredisent jamais sur l'exercice consulté.</p>
 */

/** Pays d'implantation, résolu depuis l'annuaire des sociétés. */
export interface PaysOption {
  /** Libellé du pays, tel que la fiche société le porte. */
  nom: string;
  drapeau: string;
  /** Sociétés implantées dans ce pays. */
  filiales: Filiale[];
  /** Devise dominante des sociétés du pays. */
  devise: string;
}

/** Pays inconnu : une société sans pays renseigné ne doit pas disparaître. */
export const PAYS_NON_RENSEIGNE = 'Non renseigné';

/** Drapeaux des implantations du groupe ; le globe couvre les autres. */
const DRAPEAUX: Record<string, string> = {
  'TUNISIE': '🇹🇳',
  'TUNISIA': '🇹🇳',
  'MAROC': '🇲🇦',
  'MOROCCO': '🇲🇦',
  'FRANCE': '🇫🇷',
  'ALGERIE': '🇩🇿',
  'ALGÉRIE': '🇩🇿',
  'ITALIE': '🇮🇹',
  'ESPAGNE': '🇪🇸'
};

/** Drapeau d'un pays ; le globe à défaut, jamais de chaîne vide. */
export function drapeauDuPays(pays: string | null | undefined): string {
  const cle = String(pays ?? '').trim().toUpperCase();
  return DRAPEAUX[cle] ?? '🌍';
}

@Injectable({ providedIn: 'root' })
export class ReportFiltersService {
  private readonly organizationService = inject(OrganizationService);
  private readonly entityContext = inject(EntityContextService);
  private readonly destroyRef = inject(DestroyRef);

  // ---------- ÉTAT BRUT ----------

  /** Annuaire des sociétés, source du référentiel des pays. */
  private readonly filiales = signal<Filiale[]>([]);

  /** Exercices ouverts en base. */
  private readonly annees = signal<AnneeReference[]>([]);

  /** Pays retenu ; `null` vaut consolidation de tous les pays. */
  readonly paysSelectionne = signal<string | null>(null);

  /** Exercice retenu ; `null` vaut vue pluriannuelle. */
  readonly anneeSelectionnee = signal<number | null>(null);

  /** Vrai tant que l'annuaire n'est pas revenu. */
  readonly chargement = signal<boolean>(true);

  /** Message d'indisponibilité du référentiel, à afficher plutôt qu'un vide. */
  readonly erreur = signal<string | null>(null);

  // ---------- VUES DÉRIVÉES ----------

  /**
   * Pays d'implantation, dédupliqués et triés.
   *
   * <p>Une société sans pays renseigné est rattachée à
   * {@link PAYS_NON_RENSEIGNE} : l'écarter ferait disparaître ses émissions du
   * rapport sans que rien ne le signale.</p>
   */
  readonly paysDisponibles = computed<PaysOption[]>(() => {
    const parPays = new Map<string, Filiale[]>();

    for (const filiale of this.filiales()) {
      const nom = String(filiale.pays ?? '').trim() || PAYS_NON_RENSEIGNE;
      const groupe = parPays.get(nom) ?? [];
      groupe.push(filiale);
      parPays.set(nom, groupe);
    }

    return [...parPays.entries()]
      .map(([nom, filiales]) => ({
        nom,
        drapeau: drapeauDuPays(nom),
        filiales,
        devise: this.deviseDominante(filiales)
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });

  /** Exercices proposés, du plus récent au plus ancien. */
  readonly anneesDisponibles = computed<AnneeReference[]>(() =>
    [...this.annees()].sort((a, b) => b.valeur - a.valeur));

  /** Pays consulté, résolu ; `null` en consolidation. */
  readonly paysActif = computed<PaysOption | null>(() => {
    const nom = this.paysSelectionne();
    if (nom === null) return null;
    return this.paysDisponibles().find(p => p.nom === nom) ?? null;
  });

  /** Sociétés du périmètre : celles du pays, ou toutes en consolidation. */
  readonly filialesDuPerimetre = computed<Filiale[]>(() =>
    this.paysActif()?.filiales ?? this.filiales());

  /** Devise de restitution du périmètre consulté. */
  readonly devise = computed<string>(() =>
    this.paysActif()?.devise ?? this.deviseDominante(this.filiales()));

  /** Libellé du périmètre, tel que la page de garde le porte. */
  readonly libellePerimetre = computed<string>(() => {
    const pays = this.paysActif();
    if (!pays) return 'Groupe MISFAT — toutes implantations';
    return `${pays.drapeau} ${pays.nom} — ${pays.filiales.length} société(s)`;
  });

  /** Libellé de l'exercice : une année, ou la vue pluriannuelle. */
  readonly libelleExercice = computed<string>(() => {
    const annee = this.anneeSelectionnee();
    return annee === null ? 'Tous exercices' : String(annee);
  });

  /** Le périmètre est-il assez défini pour produire un rapport ? */
  readonly perimetrePret = computed<boolean>(() =>
    !this.chargement() && this.filialesDuPerimetre().length > 0);

  constructor() {
    this.charger();

    // L'exercice choisi ici commande aussi le tableau de bord : les deux écrans
    // doivent parler du même millésime, sans quoi un rapport imprimé
    // contredirait la console qui l'a produit.
    effect(() => {
      const annee = this.anneeSelectionnee();
      if (annee !== this.entityContext.filter.year) {
        this.entityContext.selectYear(annee);
      }
    });
  }

  // ---------- ÉCRITURES ----------

  /** Retient un pays ; `null` rétablit la consolidation de tous les pays. */
  choisirPays(nom: string | null): void {
    this.paysSelectionne.set(nom);
  }

  /** Retient un exercice ; `null` rétablit la vue pluriannuelle. */
  choisirAnnee(annee: number | null): void {
    this.anneeSelectionnee.set(annee);
  }

  /** Rétablit le périmètre le plus large. */
  reinitialiser(): void {
    this.paysSelectionne.set(null);
    this.anneeSelectionnee.set(null);
  }

  // ---------- CHARGEMENT DU RÉFÉRENTIEL ----------

  /**
   * Charge sociétés et exercices.
   *
   * <p>Une indisponibilité d'organization-service n'est pas silencieuse : le
   * rapport doit dire qu'il n'a pas pu établir son périmètre, plutôt que d'en
   * présenter un vide comme s'il était complet.</p>
   */
  private charger(): void {
    this.chargement.set(true);

    this.organizationService.getFiliales()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: filiales => {
          this.filiales.set(filiales ?? []);
          this.chargement.set(false);
        },
        error: () => {
          this.erreur.set('Référentiel des sociétés injoignable (organization-service, port 8083).');
          this.chargement.set(false);
        }
      });

    this.organizationService.getAnnees()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: annees => {
          this.annees.set(annees ?? []);

          // L'exercice en cours est le plus utile par défaut ; à défaut, le
          // plus récent. Ouvrir sur « tous exercices » noierait le lecteur.
          if (this.anneeSelectionnee() === null && annees?.length) {
            const enCours = annees.find(a => a.statut === 'EN_COURS');
            this.anneeSelectionnee.set((enCours ?? annees[annees.length - 1]).valeur);
          }
        },
        error: () => this.annees.set([])
      });
  }

  /** Devise la plus représentée d'un groupe de sociétés ; TND par défaut. */
  private deviseDominante(filiales: Filiale[]): string {
    const comptes = new Map<string, number>();

    for (const filiale of filiales) {
      const devise = String(filiale.devise ?? '').trim().toUpperCase();
      if (devise) comptes.set(devise, (comptes.get(devise) ?? 0) + 1);
    }

    let dominante = 'TND';
    let maximum = 0;
    for (const [devise, compte] of comptes) {
      if (compte > maximum) {
        dominante = devise;
        maximum = compte;
      }
    }
    return dominante;
  }
}
