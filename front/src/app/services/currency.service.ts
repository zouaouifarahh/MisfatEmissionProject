import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Cours d'une devise face au dinar tunisien.
 *
 * `rate` se lit « 1 {@link code} = rate TND », dans le sens du référentiel
 * chargé depuis `devise_base_misfat_tunisie.xlsx`.
 */
export interface Currency {
  code: string;
  label: string;
  rate: number | null;
  validFrom: string | null;
  validTo: string | null;
  pivot: boolean;
}

/**
 * Cours d'une devise pour la semaine en cours, avec sa variation.
 *
 * <p>`variationPercent` vaut `null` quand l'historique ne permet pas la
 * comparaison : le bandeau n'affiche alors aucune puce, plutôt qu'une stabilité
 * qui n'a pas été constatée.</p>
 */
export interface WeeklyRate {
  code: string;
  label: string;
  rate: number | null;
  previousRate: number | null;
  variationPercent: number | null;
  rateDate: string | null;
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
}

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:8080/api/v1/currencies';

  /** Devises disponibles, chacune avec son cours le plus récent. */
  getCurrencies(): Observable<Currency[]> {
    return this.http.get<Currency[]>(this.baseUrl);
  }

  /** Historique des cours, restreignable à une devise et à une date. */
  getExchangeRates(currency?: string, date?: string): Observable<Currency[]> {
    let params = new HttpParams();
    if (currency) params = params.set('currency', currency);
    if (date) params = params.set('date', date);
    return this.http.get<Currency[]>(`${this.baseUrl}/exchange-rates`, { params });
  }

  /**
   * Cours de la semaine et variation, pour le bandeau du tableau de bord.
   *
   * @param date jour d'observation au format `AAAA-MM-JJ` ; la semaine ISO qui
   *             le contient sert de période. Absent, le serveur retient la
   *             semaine courante.
   */
  getWeeklyRates(codes: string[] = ['EUR', 'USD'], date?: string | null): Observable<WeeklyRate[]> {
    let params = new HttpParams().set('codes', codes.join(','));
    if (date) params = params.set('date', date);
    return this.http.get<WeeklyRate[]>(`${this.baseUrl}/weekly`, { params });
  }
}
