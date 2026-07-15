import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GasEmissionDetail {
  id?: number;
  gasName: string;
  factorValueTnd: number;
  factorValueEur: number;
}

export interface EmissionFactor {
  id?: number;
  cropType: string;
  referenceYear: number;
  unit: string;
  factorValueTnd: number;
  factorValueEur: number;
  hasMargins: boolean;
  gasDetails?: GasEmissionDetail[];
}

@Injectable({
  providedIn: 'root'
})
export class EmissionService {
  private apiUrl = 'http://localhost:8082/api/v1/emission-factors';

  constructor(private http: HttpClient) {}

  getAll(): Observable<EmissionFactor[]> {
    return this.http.get<EmissionFactor[]>(this.apiUrl);
  }

  create(factor: EmissionFactor): Observable<EmissionFactor> {
    return this.http.post<EmissionFactor>(this.apiUrl, factor);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}