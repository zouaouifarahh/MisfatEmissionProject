import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, shareReplay } from 'rxjs';

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

  /** Combinaison des trois filtres : source de rechargement des vues. */
  readonly filter$: Observable<EntityFilter> = combineLatest([
    this.entitySubject,
    this.usineSubject,
    this.yearSubject
  ]).pipe(
    map(([entity, usineId, year]) => ({ entityId: entity.id, usineId, year })),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  constructor() {
    this.loadEntities();
    this.loadYears();
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
        if (conserverSelection && courante !== null && annees.some(a => a.valeur === courante)) {
          return;
        }

        const enCours = annees.find(a => a.statut === 'EN_COURS');
        this.yearSubject.next(enCours ? enCours.valeur : annees[annees.length - 1]?.valeur ?? null);
      },
      error: err => console.error('Chargement des années impossible', err)
    });
  }
}
