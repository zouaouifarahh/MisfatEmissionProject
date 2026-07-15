import { Injectable, signal, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  // Centralisation de l'URL sur ton port backend (8081)
  private apiUrl = 'http://localhost:8081/api/users';

  // Signal pour stocker le token en toute sécurité
  token = signal<string | null>(null);

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object // Injection pour détecter l'environnement (Serveur ou Navigateur)
  ) {
    // On ne lit le localStorage QUE si on est sur le navigateur (client)
    if (isPlatformBrowser(this.platformId)) {
      this.token.set(localStorage.getItem('token') || null);
    }
  }

  // 1. Inscription (Soumission de la demande - Nom mis en accord avec signup.ts)
  signUp(user: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/signup`, user);
  }

  // 2. Connexion 
  signIn(credentials: { username: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/signin`, credentials);
  }

  // 3. Récupérer tous les utilisateurs (pour le filtrage EN_ATTENTE)
  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // 4. Approbation (1 seul argument attendu)
  approveUser(id: number): Observable<string> {
    return this.http.put(`${this.apiUrl}/${id}/approve`, {}, { responseType: 'text' });
  }
}