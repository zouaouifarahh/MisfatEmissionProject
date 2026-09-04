import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Trace d'un dépôt de référentiel, telle que renvoyée par emission-service. */
export interface ReferentialImportLog {
  id: number;
  fileName: string;
  importDate: string;
  /** Société du dépôt. Nulle sur les dépôts antérieurs au cloisonnement. */
  filialeId?: number | null;
  /** Exercice du dépôt. Même régime que {@link filialeId}. */
  annee?: number | null;
  totalRows: number;
  createdReferences: number;
  createdSources: number;
  createdFactors: number;
  errorCount: number;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  errorDetail: string | null;
  importedBy: string | null;
}

export type ReferentialUploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'done'; log: ReferentialImportLog };

/**
 * Dépôt du classeur de référentiel carbone.
 *
 * <p>Appel direct à emission-service : il est propriétaire des tables
 * {@code emission_factor} et {@code ref_emission_sources} alimentées par ce
 * fichier, la gateway n'a pas à relayer un flux de 200 Mo.</p>
 */
@Injectable({ providedIn: 'root' })
export class ReferentialImportService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:8082/api/v1/referential';

  /** Gabarit généré par le serveur : seul Apache POI écrit les validations Excel. */
  get templateUrl(): string {
    return `${this.baseUrl}/template`;
  }

  /**
   * Historique du périmètre consulté.
   *
   * <p>Le filtrage est fait par le serveur, non par le navigateur : rapatrier
   * tous les dépôts du groupe pour n'en afficher qu'une poignée fait transiter
   * l'historique des autres sociétés jusqu'au poste de l'utilisateur.</p>
   *
   * <p>Un critère nul vaut « tous », ce que la vue Groupe demande légitimement ;
   * il n'est donc pas transmis plutôt que transmis vide.</p>
   */
  getHistory(filialeId?: number | null, annee?: number | null): Observable<ReferentialImportLog[]> {
    let params = new HttpParams();
    if (filialeId != null) params = params.set('filialeId', filialeId);
    if (annee != null) params = params.set('annee', annee);

    return this.http.get<ReferentialImportLog[]>(`${this.baseUrl}/imports`, { params });
  }

  /**
   * Dépose un classeur pour une société et un exercice.
   *
   * <p>Les deux sont des paramètres exigés, et non facultatifs : le serveur les
   * refuse absents, et un appelant qui les oublierait doit s'en apercevoir à la
   * compilation plutôt qu'en lisant un 400 à l'exécution.</p>
   */
  upload(
    file: File,
    filialeId: number,
    annee: number,
    importedBy?: string | null
  ): Observable<ReferentialUploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    let params = new HttpParams()
      .set('filialeId', filialeId)
      .set('annee', annee);
    if (importedBy) params = params.set('importedBy', importedBy);

    return this.http
      .post<ReferentialImportLog>(`${this.baseUrl}/import`, formData, {
        params,
        reportProgress: true,
        observe: 'events'
      })
      .pipe(
        map((event: HttpEvent<ReferentialImportLog>): ReferentialUploadEvent => {
          if (event.type === HttpEventType.UploadProgress) {
            return { kind: 'progress', percent: event.total ? Math.round((100 * event.loaded) / event.total) : 0 };
          }
          if (event.type === HttpEventType.Response) {
            return { kind: 'done', log: event.body as ReferentialImportLog };
          }
          return { kind: 'progress', percent: 0 };
        })
      );
  }
}
