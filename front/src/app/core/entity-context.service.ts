import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, filter, map, shareReplay } from 'rxjs';

import { OrganizationService } from '../services/organization.service';
import { Filiale, Usine, AnneeReference } from '../models/organization.model';
import { EntityProfile, GROUP_ENTITY, profileFor } from './entity-catalogue';

/** Filtres actifs, transmis à tous les appels HTTP de l'application. */
export interface EntityFilter {
  /** Identifiant de filiale, `null` en vue consolidée. */
  entityId: number | null;
  /** Identifiant d'usine, `null` pour toutes les usines de l'entité. */
  usineId: number | null;
  year: number | null;
}

/** Entité sélectionnable dans le sélecteur du header. */
export interface EntityOption extends EntityProfile {
  /** `null` pour la vue consolidée. */
  id: number | null;
}

/**
 * État global de filtrage : entité, usine et année.
 *
 * <p>Un seul point de vérité pour toute l'application. Les composants
 * s'abonnent à {@link filter$} et rechargent leurs données à chaque
 * changement ; ils n'ont jamais à propager les filtres eux-mêmes.</p>
 */
@Injectable({ providedIn: 'root' })
export class EntityContextService {
  private readonly organizationService = inject(OrganizationService);

  private readonly entitySubject = new BehaviorSubject<EntityOption>({ ...GROUP_ENTITY, id: null });
  private readonly usineSubject = new BehaviorSubject<number | null>(null);
  private readonly yearSubject = new BehaviorSubject<number | null>(null);

  private readonly entitiesSubject = new BehaviorSubject<EntityOption[]>([{ ...GROUP_ENTITY, id: null }]);
  private readonly usinesSubject = new BehaviorSubject<Usine[]>([]);
  private readonly yearsSubject = new BehaviorSubject<AnneeReference[]>([]);

  /** Entité active. */
  readonly entity$ = this.entitySubject.asObservable();
  /** Entités proposées dans le sélecteur, vue consolidée en tête. */
  readonly entities$ = this.entitiesSubject.asObservable();
  /** Usines de l'entité active uniquement. */
  readonly usines$ = this.usinesSubject.asObservable();
  readonly years$ = this.yearsSubject.asObservable();
  readonly usineId$ = this.usineSubject.asObservable();
  readonly year$ = this.yearSubject.asObservable();

  /**
   * L'exercice par défaut a-t-il été arrêté ?
   *
   * <p>Tant qu'il ne l'est pas, {@link year} vaut `null` faute d'être connu —
   * et non parce que l'utilisateur aurait demandé tous les exercices. Les deux
   * s'écrivent pareil et ne veulent pas dire la même chose : c'est ce que ce
   * drapeau distingue.</p>
   */
  private readonly amorceSubject = new BehaviorSubject<boolean>(false);

  /**
   * Combinaison des trois filtres : source de rechargement des vues.
   *
   * <p>Rien n'est émis avant que l'exercice par défaut soit arrêté. Les
   * {@link BehaviorSubject} qui composent ce flux émettent tous dès leur
   * création : sans cette retenue, un premier filtre partait avec
   * `year: null` avant même que la liste des exercices soit revenue, et les
   * vingt-quatre écrans abonnés lançaient leurs requêtes avec.</p>
   *
   * <p>Le serveur lit alors un exercice non renseigné comme « tous les
   * exercices » — ce qu'il désigne légitimement quand l'utilisateur le demande.
   * Le tableau de bord affichait donc la somme de toutes les années sous le
   * millésime en cours, avant de se corriger à la réponse suivante. Sur le
   * rendu serveur, où il n'y a pas de seconde réponse, le total faux était le
   * seul que la page portait.</p>
   */
  readonly filter$: Observable<EntityFilter> = combineLatest([
    this.entitySubject,
    this.usineSubject,
    this.yearSubject,
    this.amorceSubject
  ]).pipe(
    filter(([, , , amorce]) => amorce),
    map(([entity, usineId, year]) => ({ entityId: entity.id, usineId, year })),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  constructor() {
    this.loadEntities();
    this.loadYears();
  }

  /**
   * L'exercice par défaut est-il arrêté ?
   *
   * <p>Pour les rares écrans qui lisent {@link filter} de façon synchrone,
   * hors de tout abonnement à {@link filter$}.</p>
   */
  get amorce(): boolean {
    return this.amorceSubject.value;
  }

  get entity(): EntityOption {
    return this.entitySubject.value;
  }

  get filter(): EntityFilter {
    return { entityId: this.entity.id, usineId: this.usineSubject.value, year: this.yearSubject.value };
  }

  /** Change d'entité et réinitialise l'usine, qui n'appartient plus au périmètre. */
  selectEntity(entity: EntityOption): void {
    this.entitySubject.next(entity);
    this.usineSubject.next(null);
    this.loadUsines(entity.id);
  }

  selectUsine(usineId: number | null): void {
    this.usineSubject.next(usineId);
  }

  selectYear(year: number | null): void {
    this.yearSubject.next(year);
  }

  /**
   * Recharge la liste des sociétés depuis la base.
   *
   * <p>Appelé après une création, une modification ou une suppression : les
   * sélecteurs, le drapeau et la devise du tableau de bord se réalignent sans
   * rechargement de la page.</p>
   */
  refreshEntities(): void {
    this.loadEntities();
  }

  /** Recharge les exercices en conservant l'année sélectionnée si elle existe encore. */
  refreshYears(): void {
    this.loadYears(true);
  }

  /** Paramètres de requête à joindre aux appels HTTP. */
  toQueryParams(): Record<string, string> {
    const { entityId, usineId, year } = this.filter;
    const params: Record<string, string> = {};
    if (entityId !== null) params['entityId'] = String(entityId);
    if (usineId !== null) params['usineId'] = String(usineId);
    if (year !== null) params['year'] = String(year);
    return params;
  }

  private loadEntities(): void {
    this.organizationService.getFiliales().subscribe({
      next: (filiales: Filiale[]) => {
        const options: EntityOption[] = [
          { ...GROUP_ENTITY, id: null },
          ...filiales.map(f => ({
            id: f.id,
            apiCode: f.code,
            ...profileFor(f.code, f.libelle, f.pays, f.devise)
          }))
        ];
        this.entitiesSubject.next(options);

        // Une société renommée ou supprimée ne doit pas rester sélectionnée
        // avec ses anciennes caractéristiques.
        const active = this.entitySubject.value;
        if (active.id !== null) {
          const rafraichie = options.find(o => o.id === active.id);
          this.entitySubject.next(rafraichie ?? { ...GROUP_ENTITY, id: null });
          if (!rafraichie) this.usineSubject.next(null);
        }
      },
      error: err => console.error('Chargement des entités impossible', err)
    });
  }

  private loadUsines(entityId: number | null): void {
    if (entityId === null) {
      this.usinesSubject.next([]);
      return;
    }
    this.organizationService.getUsinesByFiliale(entityId).subscribe({
      next: usines => this.usinesSubject.next(usines),
      error: err => {
        console.error('Chargement des usines impossible', err);
        this.usinesSubject.next([]);
      }
    });
  }

  private loadYears(conserverSelection = false): void {
    this.organizationService.getAnnees().subscribe({
      next: annees => {
        this.yearsSubject.next(annees);

        // Après un ajout d'exercice, l'utilisateur consulte souvent encore
        // l'année en cours d'analyse : la remplacer d'office lui ferait perdre
        // son périmètre de travail.
        const courante = this.yearSubject.value;
        const conserve =
          conserverSelection && courante !== null && annees.some(a => a.valeur === courante);

        if (!conserve) {
          const enCours = annees.find(a => a.statut === 'EN_COURS');
          this.yearSubject.next(enCours ? enCours.valeur : annees[annees.length - 1]?.valeur ?? null);
        }

        // L'exercice est arrêté : les vues peuvent partir. Levé après la
        // sélection, jamais avant, sans quoi un filtre sortirait tout de même
        // sans année.
        this.ouvrirLesVues();
      },
      error: err => {
        console.error('Chargement des années impossible', err);

        // Les vues partent quand même, sur un exercice non renseigné : sans
        // cela, un serveur d'organisation muet figerait toute l'application
        // sur un écran vide, là où elle sait n'afficher qu'un bilan consolidé.
        this.ouvrirLesVues();
      }
    });
  }

  /** Laisse {@link filter$} émettre, une fois pour toutes. */
  private ouvrirLesVues(): void {
    if (!this.amorceSubject.value) this.amorceSubject.next(true);
  }
}
