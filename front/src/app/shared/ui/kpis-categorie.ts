import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Bandeau des quatre indicateurs de tête, commun à toutes les catégories.
 *
 * <p>Un seul composant pour les onze écrans : la mise en forme reste identique
 * d'un scope à l'autre, et une évolution du gabarit les touche tous.</p>
 */

/** Accent coloré d'une carte, aligné sur le rôle de l'indicateur. */
export type AccentKpi = 'volume' | 'emissions' | 'lignes' | 'couverture';

export interface CarteKpi {
  libelle: string;
  /** Valeur déjà formatée : chaque écran connaît la précision qui lui convient. */
  valeur: string;
  unite: string;
  icone: string;
  accent: AccentKpi;
  /** Passe la carte en alerte : couverture insuffisante, repli majoritaire. */
  alerte?: boolean;
  /**
   * Filtre que la carte applique au tableau lorsqu'on la clique.
   *
   * <p>Une alerte qui annonce « 62 % de couverture » laissait l'utilisateur
   * chercher lui-même, parmi des centaines de lignes, celles qui manquaient.
   * La carte devient le chemin le plus court vers ce qu'elle signale.</p>
   *
   * <p>Absent, la carte reste un simple indicateur : toutes n'ont pas de
   * contrepartie dans le tableau, et rendre cliquable ce qui ne filtre rien
   * tromperait sur ce que le clic va faire.</p>
   */
  filtreStatut?: FiltreStatut;
}

@Component({
  selector: 'app-kpis-categorie',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-grille">
      <div class="kpi-carte" *ngFor="let carte of cartes"
           [ngClass]="'kpi-' + carte.accent" [class.kpi-alerte]="carte.alerte"
           [class.kpi-cliquable]="carte.filtreStatut"
           [class.kpi-actif]="carte.filtreStatut && carte.filtreStatut === filtreActif"
           [attr.role]="carte.filtreStatut ? 'button' : null"
           [attr.tabindex]="carte.filtreStatut ? 0 : null"
           [attr.aria-pressed]="carte.filtreStatut
             ? (carte.filtreStatut === filtreActif ? 'true' : 'false') : null"
           [title]="carte.filtreStatut ? infobulle(carte) : ''"
           (click)="basculer(carte)"
           (keydown.enter)="basculer(carte)"
           (keydown.space)="basculer(carte)">
        <span class="kpi-icone" aria-hidden="true">{{ carte.icone }}</span>
        <div class="kpi-corps">
          <span class="kpi-libelle">{{ carte.libelle }}</span>
          <span class="kpi-valeur">{{ carte.valeur }}</span>
          <span class="kpi-unite">{{ carte.unite }}</span>
        </div>
        <span class="kpi-loupe" *ngIf="carte.filtreStatut" aria-hidden="true">
          {{ carte.filtreStatut === filtreActif ? '✕' : '🔎' }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; }

    .kpi-grille {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(216px, 1fr));
      gap: 12px;
    }

    .kpi-carte {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid #E2E8F0;
      border-left: 4px solid #1E92CD;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }

    .kpi-icone { font-size: 22px; line-height: 1; }
    .kpi-corps { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

    .kpi-libelle {
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em;
      text-transform: uppercase; color: #94A3B8;
    }

    .kpi-valeur {
      font-size: 21px; font-weight: 800; line-height: 1.15;
      color: #1E3A52; font-variant-numeric: tabular-nums;
    }

    .kpi-unite {
      font-size: 11px; font-weight: 600; color: #475569;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .kpi-volume { border-left-color: #0891B2; }
    .kpi-emissions { border-left-color: #1E3A52; }
    .kpi-lignes { border-left-color: #6D28D9; }
    .kpi-couverture { border-left-color: #059669; }

    /* Une couverture dégradée annonce un bilan largement bâti sur des replis. */
    .kpi-alerte { border-left-color: #D97706; background: #FFFBF5; }
    .kpi-alerte .kpi-valeur { color: #B4652F; }

    /* Une carte qui filtre doit s'annoncer comme telle avant le clic. */
    .kpi-cliquable { cursor: pointer; position: relative; }
    .kpi-cliquable:hover { border-color: #1E92CD; box-shadow: 0 2px 10px rgba(30,146,205,.16); }
    .kpi-cliquable:focus-visible { outline: 2px solid #1E92CD; outline-offset: 2px; }

    .kpi-actif { border-color: #1E92CD; background: #F2F9FD; }
    .kpi-actif.kpi-alerte { border-color: #D97706; background: #FFF4E6; }

    .kpi-loupe {
      margin-left: auto;
      font-size: 13px;
      opacity: .55;
      flex: 0 0 auto;
    }
    .kpi-cliquable:hover .kpi-loupe { opacity: 1; }

    @media (prefers-reduced-motion: reduce) {
      .kpi-cliquable { transition: none; }
    }
  `]
})
export class KpisCategorieComponent {
  @Input({ required: true }) cartes: CarteKpi[] = [];

  /** Filtre actuellement appliqué au tableau, pour marquer la carte active. */
  @Input() filtreActif: FiltreStatut | string = 'Tous';

  /**
   * Filtre demandé par un clic sur une carte d'alerte.
   *
   * <p>L'écran reste maître : le composant dit ce qui a été demandé, il
   * n'impose rien. Cliquer une carte déjà active la relâche, pour qu'on
   * revienne au tableau complet par le même geste.</p>
   */
  @Output() filtrer = new EventEmitter<FiltreStatut>();

  basculer(carte: CarteKpi): void {
    if (!carte.filtreStatut) return;
    this.filtrer.emit(carte.filtreStatut === this.filtreActif ? 'Tous' : carte.filtreStatut);
  }

  /** Ce que le clic va faire, annoncé avant qu'il ne soit fait. */
  infobulle(carte: CarteKpi): string {
    return carte.filtreStatut === this.filtreActif
      ? 'Cliquer pour revenir au tableau complet'
      : 'Cliquer pour n’afficher que les lignes concernées';
  }
}

/** Ligne valorisée, quelle que soit la catégorie qui la porte. */
export interface LigneValorisable {
  origineFacteur?: string;
  baseAppliquee?: string;
  /** Base documentaire des écrans du Scope 1 et 2, antérieurs à la refonte. */
  databaseSource?: string;
  facteur?: number | null;
}

/**
 * La ligne est-elle adossée au référentiel MS SQL ?
 *
 * <p>Les écrans ne tracent pas tous l'origine de la même façon : certains
 * portent {@code origineFacteur}, d'autres la seule base documentaire, les
 * plus anciens rien d'autre que le facteur retenu. La règle couvre les trois
 * cas, et refuse toute base qui s'annonce comme un repli.</p>
 */
export function adosseeAuReferentiel(ligne: LigneValorisable): boolean {
  if (ligne.origineFacteur) return ligne.origineFacteur === 'MS SQL BDD';

  const base = (ligne.baseAppliquee ?? ligne.databaseSource ?? '').toLowerCase();
  if (base) return !/repli|fallback|ademe|defaut|défaut/.test(base);

  // Faute de traçabilité, un facteur résolu vaut rattachement au référentiel.
  return typeof ligne.facteur === 'number' && ligne.facteur > 0;
}

/** Part des lignes adossées au référentiel, en pourcentage. */
export function tauxCouvertureReferentiel(lignes: LigneValorisable[]): number {
  if (!Array.isArray(lignes) || !lignes.length) return 0;
  return (lignes.filter(adosseeAuReferentiel).length / lignes.length) * 100;
}

/** Statut retenu par la barre de filtres. */
export type FiltreStatut = 'Tous' | 'MS SQL' | 'Fallback';

/** La ligne satisfait-elle le statut demandé ? */
export function statutRetenu(ligne: LigneValorisable, filtre: FiltreStatut | string): boolean {
  if (filtre === 'MS SQL') return adosseeAuReferentiel(ligne);
  if (filtre === 'Fallback') return !adosseeAuReferentiel(ligne);
  return true;
}

/** Provenance d'une ligne, telle qu'elle est restituée en pastille. */
export type Provenance = 'Réel' | 'Estimation' | 'Import Excel';

/** Ligne dont on cherche la provenance, quelle que soit sa catégorie. */
export interface LigneTracable {
  provenance?: string;
  /** Renseignée par la ventilation d'un classeur comptable. */
  sourceData?: string;
  hypothese?: string;
}

/**
 * Provenance d'une ligne.
 *
 * <p>Les écrans ne la tracent pas tous de la même façon : les plus récents
 * portent un champ dédié, les autres une hypothèse « Réelle » ou
 * « Estimation », et une ligne ventilée porte sa source. La règle couvre les
 * trois cas plutôt que d'imposer un champ unique à dix-neuf modèles.</p>
 */
export function provenanceDe(ligne: LigneTracable): Provenance {
  if (ligne.sourceData) return 'Import Excel';

  const declaree = (ligne.provenance ?? '').toLowerCase();
  if (declaree.includes('excel') || declaree.includes('import')) return 'Import Excel';
  if (declaree.includes('estim')) return 'Estimation';
  if (declaree) return 'Réel';

  return (ligne.hypothese ?? '').toLowerCase().includes('estim') ? 'Estimation' : 'Réel';
}

/** Pastille associée à une provenance. */
export function classeProvenance(provenance: Provenance): string {
  if (provenance === 'Import Excel') return 'prov-excel';
  return provenance === 'Estimation' ? 'prov-estim' : 'prov-reel';
}

/** Libellé affiché, marqueur compris. */
export function libelleProvenance(provenance: Provenance): string {
  if (provenance === 'Import Excel') return '📄 Import Excel';
  return provenance === 'Estimation' ? '≈ Estimation' : '✓ Réel';
}

/** La ligne satisfait-elle la provenance demandée ? */
export function provenanceRetenue(ligne: LigneTracable, filtre: string): boolean {
  return filtre === 'Toutes' || provenanceDe(ligne) === filtre;
}

/** Unité dominante d'un lot de lignes, pour l'étiquette d'un indicateur. */
export function uniteDominante(unites: (string | null | undefined)[], defaut = ''): string {
  const comptes = new Map<string, number>();
  for (const unite of unites) {
    const propre = (unite ?? '').trim();
    if (!propre) continue;
    comptes.set(propre, (comptes.get(propre) ?? 0) + 1);
  }
  if (!comptes.size) return defaut;
  return [...comptes].sort((a, b) => b[1] - a[1])[0][0];
}
