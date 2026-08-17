import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EmissionSource } from '../models/emission-source';

@Injectable({
  providedIn: 'root'
})
export class EmissionSourceService {
  // Remplace par l'URL et le port de ton backend Spring Boot
  private apiUrl = 'http://localhost:8082/api/emission-sources';

  constructor(private http: HttpClient) {}

  // Récupérer toutes les sources d'émissions
  getAllSources(): Observable<EmissionSource[]> {
    return this.http.get<EmissionSource[]>(this.apiUrl);
  }

  // Récupérer les sources filtrées par catégorie
  getSourcesByCategory(category: string): Observable<EmissionSource[]> {
    return this.http.get<EmissionSource[]>(`${this.apiUrl}/category/${encodeURIComponent(category)}`);
  }

  // Créer une nouvelle source
  createSource(source: EmissionSource): Observable<EmissionSource> {
    return this.http.post<EmissionSource>(this.apiUrl, source);
  }

  // Supprimer une source par son ID
  deleteSource(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}