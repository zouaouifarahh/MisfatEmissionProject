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

/**
 * Ligne d'import corrigée à l'écran, prête à être enregistrée.
 *
 * <p>Contrat miroir de {@code CorrectedLineDto} côté emission-service : toute
 * évolution doit être portée des deux côtés.</p>
 */
export interface LigneCorrigeePayload {
  /** Clé de la ligne dans le magasin de répartition, restituée par le serveur. */
  cle: string;
  measureDate: string; // 'YYYY-MM-DD'
  label: string;
  quantity: number;
  /** Facteur retenu par l'utilisateur, en kgCO₂e par unité de quantité. */
  factor: number;
  /** Renseignée pour un montant, nulle pour une quantité physique. */
  rawCurrency?: string | null;
  unit?: string | null;
  categoryCode?: string | null;
  sourceCode?: string | null;
  /** Site de la mesure, quand le périmètre consulté en désigne un. */
  usineId?: number | null;
  /**
   * Société de la mesure.
   *
   * <p>Transmise explicitement : le serveur la déduisait de {@link usineId},
   * que cet écran remplissait avec un identifiant de société. Les deux séries
   * se recouvrant, la société 2 était lue comme l'usine 2 — qui appartient à la
   * société 1.</p>
   */
  filialeId?: number | null;
  importLogId?: number | null;
}

/** Bilan rendu par le serveur après enregistrement des lignes corrigées. */
export interface BilanCorrections {
  /** Clés effectivement écrites en base. */
  clesEnregistrees: string[];
  ecartees: number;
  motifs: string[];
}

@Injectable({
  providedIn: 'root'
})
export class EmissionMeasureService {

  private apiUrl = 'http://localhost:8082/api/v1/emission-measures';

  /**
   * Les corrections ne passent pas par {@link apiUrl} : le point d'entrée des
   * mesures unitaires recalcule le total avec le facteur du référentiel, ce qui
   * effacerait précisément la correction que l'utilisateur vient de valider.
   */
  private correctionsUrl = 'http://localhost:8082/api/v1/emissions/corrections';

  constructor(private http: HttpClient) {}

  /**
   * Enregistre en base un lot de lignes d'import corrigées.
   *
   * <p>Le serveur rend les clés qu'il a retenues : celles qu'il a écartées,
   * faute de facteur à rattacher, restent à corriger côté écran.</p>
   */
  enregistrerCorrections(lignes: LigneCorrigeePayload[]): Observable<BilanCorrections> {
    return this.http.post<BilanCorrections>(this.correctionsUrl, lignes);
  }

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