import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Lecture paginée des mesures, servie par la base.
 *
 * <p>Les écrans de saisie tenaient leurs lignes dans le stockage du navigateur.
 * Le procédé convient à quelques centaines de saisies ; il ne tient pas les cent
 * onze mille lignes d'un exercice d'achats — le quota du navigateur est dépassé
 * bien avant, l'import « réussit » sans rien conserver, et tout disparaît au
 * rafraîchissement suivant.</p>
 *
 * <p>La base fait désormais foi pour ces mesures. Elle pagine, filtre et
 * totalise : trois travaux qu'elle fait sans effort et que le navigateur payait
 * en mémoire.</p>
 */

/** Mesure telle que la base la rend pour un tableau de saisie. */
export interface MesureServeurLigne {
  id: number;
  label: string;
  quantity: number;
  unit: string;
  currency: string | null;
  totalCo2e: number;
  measureDate: string;
  origin: string;
  filialeId: number | null;
  usineId: number | null;
  referenceCode: string | null;
  factorValue: number | null;
  factorUnit: string | null;
  dataType: string | null;
  databaseSource: string | null;
  categoryName: string | null;
}

/** Page de mesures, et les totaux du périmètre qu'elle découpe. */
export interface PageMesures {
  lignes: MesureServeurLigne[];
  page: number;
  taille: number;
  totalLignes: number;
  totalPages: number;
  /** Émissions du périmètre entier, en kgCO₂e — non celles de la page. */
  totalCo2eKg: number;
  totalQuantite: number;
}

/** Ligne brute soumise à l'import en masse, telle que le serveur l'attend. */
export interface LigneImportBrute {
  dateDocument: string | null;
  label: string;
  rawAmount: number;
  rawCurrency: string | null;
  categoryCode: string | null;
  sourceCode: string | null;
  filialeId: number | null;
  unit: string | null;
  sourceRowNumber: number | null;
}

/** Compte rendu d'un import en masse, tel que les en-têtes le rapportent. */
export interface BilanImport {
  importees: number;
  ecartees: number;
  motifs: string;
}

@Injectable({ providedIn: 'root' })
export class MesuresPageService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8082/api/v1/emission-measures';

  /**
   * Page de mesures d'une catégorie, cloisonnée par exercice et par société.
   *
   * <p>Un critère absent vaut « tous » : c'est la convention du périmètre dans
   * toute l'application, et l'omettre du corps de la requête la porte jusqu'au
   * serveur sans traduction.</p>
   */
  pager(criteres: {
    categorie?: string | null;
    annee?: number | null;
    filialeId?: number | null;
    page?: number;
    taille?: number;
  }): Observable<PageMesures> {

    let params = new HttpParams()
      .set('page', String(criteres.page ?? 0))
      .set('taille', String(criteres.taille ?? 50));

    if (criteres.categorie) params = params.set('categorie', criteres.categorie);
    if (criteres.annee != null) params = params.set('annee', String(criteres.annee));
    if (criteres.filialeId != null) params = params.set('filialeId', String(criteres.filialeId));

    return this.http.get<PageMesures>(`${this.baseUrl}/page`, { params });
  }

  /**
   * Verse un lot de lignes en base.
   *
   * <p>Le compte rendu voyage par les en-têtes de la réponse : le serveur
   * distingue un import complet d'un import partiel par son statut, et nomme
   * les motifs d'écart. Les lire évite d'annoncer un succès pour un lot dont la
   * moitié a été refusée.</p>
   */
  importerEnMasse(lignes: LigneImportBrute[]): Observable<BilanImport> {
    return new Observable<BilanImport>(observateur => {
      this.http.post(`${this.baseUrl.replace('/emission-measures', '')}/emissions/bulk-import`,
        lignes, { observe: 'response' }).subscribe({
        next: reponse => {
          observateur.next({
            importees: Number(reponse.headers.get('X-Imported-Count') ?? 0),
            ecartees: Number(reponse.headers.get('X-Skipped-Count') ?? 0),
            motifs: reponse.headers.get('X-Skipped-Reasons') ?? ''
          });
          observateur.complete();
        },
        error: erreur => observateur.error(erreur)
      });
    });
  }
}
