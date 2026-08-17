import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Type de source d'import déclaré côté serveur. */
export interface ImportSourceType {
  id: number;
  codeName: string;
  displayName: string;
  scopeTarget: string;
  categoryTarget: string;
  excelStructureType: 'ROW_BY_ROW' | 'MONTHLY_MATRIX';
  active: boolean;
}

export interface ImportLog {
  id: number;
  fileName: string;
  importSourceTypeId: number;
  importSourceTypeName?: string;
  filialeId: number;
  usineId?: number | null;
  importDate: string;
  totalLinesProcessed: number;
  successCount: number;
  errorCount: number;
  status: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'PARTIAL_SUCCESS';
  importedBy?: string | null;
  errorDetail?: string | null;
}

export interface ImportResult {
  log: ImportLog;
  rows: unknown[];
  errors: string[];
}

/** Étape d'un envoi : progression puis résultat. */
export type UploadEvent =
  | { kind: 'progress'; percent: number }
  | { kind: 'done'; result: ImportResult };

/**
 * Dépôt de fichiers vers `data-import-service`, à travers la gateway.
 *
 * <p>L'envoi est suivi grâce à `reportProgress`, ce qui alimente la barre de
 * progression du composant d'import.</p>
 */
@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:8080/api/v1';

  /** Types de source disponibles ; seuls les actifs sont proposés à la saisie. */
  getSourceTypes(activeOnly = true): Observable<ImportSourceType[]> {
    return this.http.get<ImportSourceType[]>(`${this.baseUrl}/import-sources`, {
      params: new HttpParams().set('activeOnly', activeOnly)
    });
  }

  /** Historique, filtré par entité et usine lorsque le contexte en désigne une. */
  getLogs(filialeId?: number | null, usineId?: number | null): Observable<ImportLog[]> {
    let params = new HttpParams();
    if (filialeId != null) params = params.set('filialeId', filialeId);
    if (usineId != null) params = params.set('usineId', usineId);
    return this.http.get<ImportLog[]>(`${this.baseUrl}/import-logs`, { params });
  }

  /**
   * Envoie un fichier et suit sa progression.
   *
   * @param sourceType `codeName` du modèle de fichier, il détermine le parser
   */
  upload(
    file: File,
    sourceType: string,
    filialeId: number,
    usineId?: number | null,
    importedBy?: string | null
  ): Observable<UploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    let params = new HttpParams().set('sourceType', sourceType).set('filialeId', filialeId);
    if (usineId != null) params = params.set('usineId', usineId);
    if (importedBy) params = params.set('importedBy', importedBy);

    return this.http
      .post<ImportResult>(`${this.baseUrl}/imports`, formData, {
        params,
        reportProgress: true,
        observe: 'events'
      })
      .pipe(
        map((event: HttpEvent<ImportResult>): UploadEvent => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
            return { kind: 'progress', percent };
          }
          if (event.type === HttpEventType.Response) {
            return { kind: 'done', result: event.body as ImportResult };
          }
          return { kind: 'progress', percent: 0 };
        })
      );
  }
}
