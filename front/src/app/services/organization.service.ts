import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Filiale, Usine, AnneeReference } from '../models/organization.model';

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {

  private baseUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  getFiliales(): Observable<Filiale[]> {
    return this.http.get<Filiale[]>(`${this.baseUrl}/filiales`);
  }

  getUsinesByFiliale(filialeId: number): Observable<Usine[]> {
    return this.http.get<Usine[]>(`${this.baseUrl}/usines/filiale/${filialeId}`);
  }

  getAnnees(): Observable<AnneeReference[]> {
    return this.http.get<AnneeReference[]>(`${this.baseUrl}/annees`);
  }

  // ---------- Gestion des sociétés ----------

  createFiliale(filiale: Partial<Filiale>): Observable<Filiale> {
    return this.http.post<Filiale>(`${this.baseUrl}/filiales`, filiale);
  }

  updateFiliale(id: number, filiale: Partial<Filiale>): Observable<Filiale> {
    return this.http.put<Filiale>(`${this.baseUrl}/filiales/${id}`, filiale);
  }

  deleteFiliale(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/filiales/${id}`);
  }

  // ---------- Usines ----------

  createUsine(usine: Partial<Usine>): Observable<Usine> {
    return this.http.post<Usine>(`${this.baseUrl}/usines`, usine);
  }

  updateUsine(id: number, usine: Partial<Usine>): Observable<Usine> {
    return this.http.put<Usine>(`${this.baseUrl}/usines/${id}`, usine);
  }

  deleteUsine(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/usines/${id}`);
  }

  // ---------- Exercices carbone ----------

  createAnnee(valeur: number, statut = 'EN_COURS'): Observable<AnneeReference> {
    return this.http.post<AnneeReference>(`${this.baseUrl}/annees`, { valeur, statut });
  }

  cloturerAnnee(id: number): Observable<AnneeReference> {
    return this.http.put<AnneeReference>(`${this.baseUrl}/annees/${id}/cloturer`, {});
  }

  rouvrirAnnee(id: number): Observable<AnneeReference> {
    return this.http.put<AnneeReference>(`${this.baseUrl}/annees/${id}/rouvrir`, {});
  }

  deleteAnnee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/annees/${id}`);
  }
}
