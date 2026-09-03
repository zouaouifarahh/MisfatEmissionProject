import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, concatMap, from, map, of } from 'rxjs';

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
  private readonly racineEmissions = 'http://localhost:8082/api/v1/emissions';

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
    return this.http
      .post(`${this.racineEmissions}/bulk-import`, lignes, { observe: 'response' })
      .pipe(map(reponse => ({
        importees: Number(reponse.headers.get('X-Imported-Count') ?? 0),
        ecartees: Number(reponse.headers.get('X-Skipped-Count') ?? 0),
        motifs: reponse.headers.get('X-Skipped-Reasons') ?? ''
      })));
  }

  /**
   * Verse un classeur entier, par lots successifs.
   *
   * <p>Trente-sept mille lignes en une requête tiennent le serveur plusieurs
   * minutes dans une seule transaction, et la connexion expire avant la réponse
   * — l'import échoue alors sans qu'on sache ce qui a été écrit. Découpé, chaque
   * lot se valide seul : une coupure laisse les lots précédents en base plutôt
   * que de tout perdre.</p>
   *
   * <p>Les lots partent l'un après l'autre, non en parallèle. Trente-huit
   * requêtes simultanées sur la même table se disputeraient les verrous, et le
   * gain de temps se paierait en interblocages.</p>
   *
   * <p>Le flux émet après chaque lot : c'est ce qui permet d'afficher où en est
   * l'import. Un import long et muet se confond avec un import bloqué.</p>
   */
  importerParLots(lignes: LigneImportBrute[],
                  tailleLot = TAILLE_LOT_IMPORT): Observable<ProgressionImport> {

    const lots: LigneImportBrute[][] = [];
    for (let debut = 0; debut < lignes.length; debut += tailleLot) {
      lots.push(lignes.slice(debut, debut + tailleLot));
    }

    if (!lots.length) {
      return of({ lot: 0, lots: 0, importees: 0, ecartees: 0, motifs: '', termine: true });
    }

    const cumul = { importees: 0, ecartees: 0, motifs: [] as string[] };

    return from(lots).pipe(
      concatMap((lot, index) => this.importerEnMasse(lot).pipe(
        map(bilan => {
          cumul.importees += bilan.importees;
          cumul.ecartees += bilan.ecartees;
          if (bilan.motifs) cumul.motifs.push(bilan.motifs);

          return {
            lot: index + 1,
            lots: lots.length,
            importees: cumul.importees,
            ecartees: cumul.ecartees,
            // Les motifs se répètent d'un lot à l'autre — même colonne absente,
            // même facteur introuvable : les dédoubler rendrait le message
            // illisible sans rien apprendre de plus.
            motifs: [...new Set(cumul.motifs)].join(' | '),
            termine: index + 1 === lots.length
          };
        })
      ))
    );
  }
}

/**
 * Nombre de lignes par lot d'import.
 *
 * <p>Mille : assez pour que trente-sept mille lignes tiennent en trente-huit
 * requêtes, assez peu pour qu'une transaction se boucle avant l'expiration
 * d'une connexion. La valeur n'a rien de sacré — elle arbitre entre le nombre
 * d'allers-retours et la durée de chacun.</p>
 */
export const TAILLE_LOT_IMPORT = 1000;

/** Où en est un import par lots. */
export interface ProgressionImport {
  /** Rang du lot qui vient d'aboutir, à partir de un. */
  lot: number;
  lots: number;
  /** Lignes enregistrées depuis le début, tous lots confondus. */
  importees: number;
  ecartees: number;
  motifs: string;
  termine: boolean;
}
