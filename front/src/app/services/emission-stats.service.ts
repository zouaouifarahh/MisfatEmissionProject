import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Mode de valorisation demandé au serveur. */
export type StatsMode = 'PHYSIQUE' | 'MONETAIRE';

/** Contribution d'une filiale au total du périmètre. */
export interface FilialeShare {
  /** Identifiant côté organization-service ; null si la mesure n'est pas affectée. */
  filialeId: number | null;
  value: number;
  /** Quote-part en pourcentage du total, calculée par le serveur. */
  share: number;
  measureCount: number;
}

/** Agrégats calculés depuis `emission_measure`. */
export interface EmissionStats {
  mode: StatsMode;
  unit: string;
  /** Devise de restitution en mode monétaire ; null en mode physique. */
  currency: string | null;
  measureCount: number;
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  byScope: Record<string, number>;
  byCategory: Record<string, number>;
  /** Catégories cloisonnées par scope, pour les vues qui détaillent un scope. */
  byScopeCategory: Record<string, Record<string, number>>;
  byFiliale: FilialeShare[];
  byCurrency: Record<string, number>;
  /** Devises sans taux connu, reprises telles quelles dans le total. */
  unconvertedCurrencies: string[];
}

@Injectable({ providedIn: 'root' })
export class EmissionStatsService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:8082/api/v1/emissions/stats';

  /**
   * Agrégats du périmètre courant.
   *
   * <p>Un `entityId` absent vaut consolidation groupe : le serveur n'applique
   * alors aucun filtre de filiale.</p>
   */
  aggregate(
    mode: StatsMode,
    entityId?: number | null,
    usineId?: number | null,
    year?: number | null,
    currency?: string | null
  ): Observable<EmissionStats> {
    let params = new HttpParams().set('mode', mode);
    if (entityId != null) params = params.set('entityId', entityId);
    if (usineId != null) params = params.set('usineId', usineId);
    if (year != null) params = params.set('year', year);
    if (currency) params = params.set('currency', currency);
    return this.http.get<EmissionStats>(`${this.baseUrl}/aggregate`, { params });
  }
}
