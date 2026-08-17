import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GasEmissionDetail {
  id?: number;
  gasName: string;
  factorValue: number;
}

export interface EmissionFactor {
  id?: number;
  scope: string;
  category: string;
  emissionSource: string;
  dataType: string;
  databaseSource: string;
  factorValue: number;
  unit: string;
  referenceYear: number;
  hasMargins: boolean;
  gasDetails?: GasEmissionDetail[];
}

@Injectable({
  providedIn: 'root'
})
export class EmissionService {
  // Port 8082 pour les facteurs d'émission
  private apiUrl = 'http://localhost:8082/api/v1/emission-factors';

  // URL vers le contrôleur des références carbone : le chemin doit suivre le
  // @RequestMapping de CarbonReferenceController, sans quoi /types renvoie 404.
  private carbonRefUrl = 'http://localhost:8082/api/referentiel-carbone';

  constructor(private http: HttpClient) {}

  getAll(): Observable<EmissionFactor[]> {
    return this.http.get<EmissionFactor[]>(this.apiUrl);
  }

  // Appelle l'endpoint de recherche de ton contrôleur Spring Boot
  searchFactors(category: string, source: string, dataType: string): Observable<EmissionFactor[]> {
    return this.http.get<EmissionFactor[]>(`${this.apiUrl}/search?category=${category}&emissionSource=${source}&dataType=${dataType}`);
  }

  create(factor: EmissionFactor): Observable<EmissionFactor> {
    return this.http.post<EmissionFactor>(this.apiUrl, factor);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // 🚀 NOUVELLE MÉTHODE : Récupère la liste dynamique des sources depuis la BDD
  getEmissionTypes(): Observable<string[]> {
    return this.http.get<string[]>(`${this.carbonRefUrl}/types`);
  }
}