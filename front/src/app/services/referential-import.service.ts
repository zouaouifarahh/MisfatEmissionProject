import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Trace d'un dépôt de référentiel, telle que renvoyée par emission-service. */
export interface ReferentialImportLog {
  id: number;
  fileName: string;
  importDate: string;
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

  getHistory(): Observable<ReferentialImportLog[]> {
    return this.http.get<ReferentialImportLog[]>(`${this.baseUrl}/imports`);
  }

  upload(file: File, importedBy?: string | null): Observable<ReferentialUploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    let params = new HttpParams();
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
