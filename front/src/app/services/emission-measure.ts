import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EmissionMeasurePayload {
  id?: number;
  quantity: number;
  measureDate: string; // 'YYYY-MM-DD'
  totalCo2e?: number;  // Calculé automatiquement par votre backend
  /**
   * Usine à laquelle la mesure se rattache.
   *
   * <p>Le serveur en déduit la filiale par la clé étrangère
   * {@code usine.filiale_id} : c'est l'identifiant qui doit voyager, jamais le
   * nom de l'usine, qu'une orthographe suffit à rendre inexploitable.</p>
   */
  usineId?: number | null;
  emissionFactor: {
    id: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class EmissionMeasureService {

  private apiUrl = 'http://localhost:8082/api/v1/emission-measures';

  constructor(private http: HttpClient) {}

  // 📥 Récupérer la liste de toutes les mesures enregistrées
  getAllMeasures(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // ➕ Enregistrer une nouvelle mesure (Ajout de facteur avec quantité/date)
  createMeasure(measure: EmissionMeasurePayload): Observable<any> {
    return this.http.post<any>(this.apiUrl, measure);
  }

  // ✏️ Modifier une mesure
  updateMeasure(id: number, measure: EmissionMeasurePayload): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, measure);
  }

  // 🗑️ Supprimer une mesure
  deleteMeasure(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}