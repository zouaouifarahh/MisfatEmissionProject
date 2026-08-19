import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { CurrencyService } from '../services/currency.service';
import {
  TauxChange, ResultatConversion, convertirMontant, coursALaDate, DEVISE_PIVOT
} from './conversion-devises';

/**
 * Cours de change du référentiel, tenus à disposition des écrans.
 *
 * <p>L'historique complet est chargé une fois : les écrans convertissent
 * ensuite sans repartir au serveur, et surtout ils convertissent tous avec la
 * même table. Deux écrans qui interrogeraient le serveur séparément pourraient
 * afficher deux résultats différents pour la même ligne, au gré du moment de
 * leur chargement.</p>
 *
 * <p>La table reste vide tant que le chargement n'a pas abouti. Une conversion
 * demandée dans cet intervalle échoue proprement — statut {@code TAUX_ABSENT} —
 * plutôt que de rendre un montant faussement converti.</p>
 */
@Injectable({ providedIn: 'root' })
export class TauxChangeService {

  private readonly currencyService = inject(CurrencyService);
  private readonly table = new BehaviorSubject<TauxChange[]>([]);

  private charge = false;

  /** Cours connus, tels que les écrans les observent. */
  readonly taux$: Observable<TauxChange[]> = this.table.asObservable();

  get taux(): TauxChange[] { return this.table.value; }

  /** Dernière année couverte par un cours publié, tous codes confondus. */
  get derniereAnneeCouverte(): number | null {
    const debuts = this.table.value
      .map(t => Number(String(t.validFrom ?? '').slice(0, 4)))
      .filter(a => Number.isFinite(a) && a > 0);

    return debuts.length ? Math.max(...debuts) : null;
  }

  /** Première année couverte : en deçà, aucune conversion n'est possible. */
  get premiereAnneeCouverte(): number | null {
    const debuts = this.table.value
      .map(t => Number(String(t.validFrom ?? '').slice(0, 4)))
      .filter(a => Number.isFinite(a) && a > 0);

    return debuts.length ? Math.min(...debuts) : null;
  }

  /** Devises présentes au référentiel des cours, pivot compris. */
  get devises(): string[] {
    const codes = new Set<string>([DEVISE_PIVOT]);
    for (const t of this.table.value) codes.add(String(t.code ?? '').toUpperCase());
    return [...codes].sort();
  }

  /**
   * Charge l'historique des cours ; sans effet au-delà du premier appel.
   *
   * <p>Une erreur réseau laisse la table vide : les conversions échoueront
   * proprement, ce qui vaut mieux qu'un cours inventé.</p>
   */
  charger(): Observable<TauxChange[]> {
    if (this.charge) return of(this.table.value);
    this.charge = true;

    return this.currencyService.getExchangeRates().pipe(
      tap(devises => {
        const taux: TauxChange[] = (devises ?? []).map(d => ({
          code: d.code,
          rate: d.rate,
          validFrom: d.validFrom,
          validTo: d.validTo
        }));
        this.table.next(taux);
      }),
      catchError(() => {
        // Le rechargement reste possible : l'échec ne condamne pas la session.
        this.charge = false;
        return of([]);
      })
    ) as unknown as Observable<TauxChange[]>;
  }

  /** Convertit un montant au cours en vigueur à la date donnée. */
  convertir(
    montant: number,
    deviseSource: string | null | undefined,
    deviseCible: string | null | undefined,
    date: string
  ): ResultatConversion {
    return convertirMontant(montant, deviseSource, deviseCible, date, this.table.value);
  }

  /**
   * Ramène un facteur monétaire étranger au dinar.
   *
   * <p>Un facteur vaut « x kgCO₂e par euro » ; les montants saisis sont en
   * dinars. Diviser le facteur par le cours de l'euro le ramène en « kgCO₂e par
   * dinar », et toute la chaîne de calcul en aval reste inchangée — c'est
   * pourquoi la conversion est faite ici plutôt que sur chaque montant.</p>
   *
   * <p>Le cours retenu est celui de l'exercice de la dépense, non celui du
   * jour : sans quoi les émissions d'un exercice clos bougeraient à chaque
   * variation du dinar.</p>
   *
   * @param exercice année de la dépense ; le 30 juin sert de date d'observation,
   *   milieu d'exercice, pour ne pas dépendre d'un cours de fin d'année.
   * @returns le facteur en kgCO₂e/TND et le diagnostic ; le facteur d'origine
   *   est conservé quand le cours manque.
   */
  facteurEnDinars(
    facteur: number,
    deviseFacteur: string | null | undefined,
    exercice: number | null | undefined
  ): { facteur: number; converti: boolean; cours: number | null; avertissement: string } {

    const devise = String(deviseFacteur ?? '').trim().toUpperCase();
    if (!devise || devise === DEVISE_PIVOT) {
      return { facteur, converti: false, cours: null, avertissement: '' };
    }

    const date = `${exercice ?? new Date().getFullYear()}-06-30`;
    const cours = coursALaDate(devise, date, this.table.value);

    if (!cours) {
      return {
        facteur,
        converti: false,
        cours: null,
        avertissement: `Le facteur est libellé en ${devise} et aucun cours n'est `
          + `publié pour l'exercice ${exercice ?? '—'} : il est appliqué tel quel `
          + `au montant en dinars. Le résultat est un ordre de grandeur, non une mesure.`
      };
    }

    // 1 devise = cours TND, donc kgCO₂e/devise ÷ cours = kgCO₂e/TND.
    return {
      facteur: facteur / cours.rate!,
      converti: true,
      cours: cours.rate!,
      avertissement: ''
    };
  }
}
