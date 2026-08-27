import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

/** Facteur tel que renvoyé par `/emission-factors`, référence imbriquée. */
interface RawFactor {
  id: number;
  factorValue: number;
  unit: string;
  dataType: string;
  currency: string | null;
  databaseSource: string | null;
  referenceYear: number | null;
  validityLabel?: string | null;
  carbonReference?: {
    referenceCode: string;
    typeName: string;
    category?: { name: string; scope?: { code: string } | null } | null;
  } | null;
}

/** Facteur aplati, prêt pour les écrans de saisie. */
export interface FacteurDetaille {
  id: number;
  referenceCode: string;
  typeName: string;
  categoryName: string;
  scopeCode: string | null;
  factorValue: number;
  unit: string;
  dataType: string;
  currency: string | null;
  /** Base documentaire : EPA-ORD 2024, Ecoinvent, IPCC 2007… */
  databaseSource: string;
  referenceYear: number | null;
  validityLabel: string | null;
}

/** Un facteur applicable à une source, tel que la saisie peut le retenir. */
export interface VarianteFacteur {
  factorId: number;
  factorValue: number | null;
  unit: string | null;
  dataType: string | null;
  currency: string | null;
  databaseSource: string | null;
  referenceYear: number | null;
  uncertaintyPercent: number | null;
  validityLabel: string | null;
}

/** Source sélectionnable, avec son unité imposée et son facteur par défaut. */
export interface SourceOption {
  carbonReferenceId: number;
  referenceCode: string;
  typeName: string;
  unit: string | null;
  defaultFactorId: number | null;
  defaultFactorValue: number | null;
  dataType: string | null;
  currency: string | null;
  databaseSource: string | null;
  referenceYear: number | null;
  uncertaintyPercent: number | null;
  /** Validité telle que publiée : « Current » ou « From 2024-01-01 ». */
  validityLabel: string | null;

  /**
   * Tous les facteurs rattachés à cette source, le plus récent en tête.
   *
   * <p>Les champs {@code default*} n'en désignent qu'un : celui que la saisie
   * applique tant que l'utilisateur ne tranche pas. Une même source est
   * documentée par plusieurs bases — EPA, ADEME, IPCC — et un ajout manuel en
   * crée une de plus : la liste les porte toutes, pour que la modale puisse
   * les proposer au lieu de n'en montrer qu'une.</p>
   *
   * <p>Absente d'une réponse servie par une version antérieure du serveur : la
   * lecture retombe alors sur le facteur par défaut seul.</p>
   */
  variantes?: VarianteFacteur[];
}

export interface CategoryWithSources {
  categoryId: number;
  categoryName: string;
  scopeCode: string | null;
  scopeLabel: string | null;
  sources: SourceOption[];
}

/** Bilan d'un dépôt de classeur, renvoyé par emission-service. */
export interface ReferentialImportLog {
  totalRows: number;
  createdReferences: number;
  createdSources: number;
  createdFactors: number;
  errorCount: number;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  errorDetail: string | null;
}

/** Ligne du tableau du référentiel, aplatie depuis l'arborescence. */
export interface FactorRow extends SourceOption {
  scopeCode: string | null;
  scopeLabel: string | null;
  categoryName: string;
  /** Le référentiel est seedé depuis Excel ; une création via l'UI sera « Manuel ». */
  origin: 'MANUAL_ENTRY' | 'EXCEL_IMPORT';
}

@Injectable({ providedIn: 'root' })
export class ReferentialService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = 'http://localhost:8082/api/v1';

  /** Arborescence scope → catégorie → source pour les listes en cascade. */
  getCategoriesWithSources(): Observable<CategoryWithSources[]> {
    return this.http.get<CategoryWithSources[]>(`${this.baseUrl}/referential/categories-with-sources`);
  }

  /**
   * Même donnée, aplatie pour alimenter le tableau des facteurs.
   *
   * <p>Une ligne par <strong>facteur</strong>, et non par source. Le tableau
   * n'en montrait qu'une par référence, portant le seul facteur par défaut :
   * ajouter un second facteur à une source existante ne faisait donc
   * apparaître aucune ligne, et l'ancienne valeur restait seule à l'écran.
   * L'ajout paraissait écraser l'existant alors que les deux facteurs étaient
   * bien enregistrés — c'est l'aplatissement qui en cachait un.</p>
   *
   * <p>Une source sans variante déclarée — serveur d'une version antérieure —
   * retombe sur son facteur par défaut, pour que le tableau ne se vide pas.</p>
   */
  getFactorRows(): Observable<FactorRow[]> {
    return new Observable<FactorRow[]>(subscriber => {
      const subscription = this.getCategoriesWithSources().subscribe({
        next: categories => {
          const lignes: FactorRow[] = categories.flatMap(categorie =>
            categorie.sources.flatMap(source => {
              const contexte = {
                scopeCode: categorie.scopeCode,
                scopeLabel: categorie.scopeLabel,
                categoryName: categorie.categoryName
              };

              const variantes = source.variantes?.length
                ? source.variantes
                : [{
                    factorId: source.defaultFactorId as number,
                    factorValue: source.defaultFactorValue,
                    unit: source.unit,
                    dataType: source.dataType,
                    currency: source.currency,
                    databaseSource: source.databaseSource,
                    referenceYear: source.referenceYear,
                    uncertaintyPercent: source.uncertaintyPercent,
                    validityLabel: source.validityLabel
                  } satisfies VarianteFacteur];

              return variantes.map(variante => ({
                ...source,
                ...contexte,

                // Chaque ligne porte SON facteur : sans cela, deux variantes
                // d'une même source afficheraient la même valeur, et modifier
                // l'une reviendrait à modifier l'autre.
                defaultFactorId: variante.factorId ?? null,
                defaultFactorValue: variante.factorValue,
                unit: variante.unit ?? source.unit,
                dataType: variante.dataType ?? source.dataType,
                currency: variante.currency ?? null,
                databaseSource: variante.databaseSource ?? null,
                referenceYear: variante.referenceYear ?? null,
                uncertaintyPercent: variante.uncertaintyPercent ?? null,
                validityLabel: variante.validityLabel ?? null,

                // Les facteurs issus du seed portent le nom de leur base source
                // (EPA, IPCC…) ; ceux créés depuis l'UI sont marqués MISFAT_INTERNE.
                origin: variante.databaseSource === 'MISFAT_INTERNE'
                  ? 'MANUAL_ENTRY' as const
                  : 'EXCEL_IMPORT' as const
              }));
            })
          );
          subscriber.next(lignes);
          subscriber.complete();
        },
        error: err => subscriber.error(err)
      });
      return () => subscription.unsubscribe();
    });
  }

  /** Création manuelle d'un facteur : elle produit le badge « Manuel ». */
  createFactor(payload: {
    carbonReferenceId: number;
    factorValue: number;
    unit: string;
    dataType: string;
    currency?: string | null;
    referenceYear?: number | null;
    uncertaintyPercent?: number | null;
  }): Observable<unknown> {
    const { carbonReferenceId, ...reste } = payload;
    // L'API attend l'entité EmissionFactor, donc la référence imbriquée : un
    // `carbonReferenceId` à plat serait ignoré et violerait la contrainte NOT NULL.
    return this.http.post(`${this.baseUrl}/emission-factors`, {
      ...reste,
      carbonReference: { id: carbonReferenceId },
      databaseSource: 'MISFAT_INTERNE'
    });
  }

  /** Mise à jour d'un facteur, quelle que soit sa provenance. */
  updateFactor(id: number, payload: {
    carbonReferenceId: number;
    factorValue: number;
    unit: string;
    dataType: string;
    currency?: string | null;
    referenceYear?: number | null;
    uncertaintyPercent?: number | null;
    databaseSource?: string | null;
  }): Observable<unknown> {
    const { carbonReferenceId, ...reste } = payload;
    return this.http.put(`${this.baseUrl}/emission-factors/${id}`, {
      ...reste,
      carbonReference: { id: carbonReferenceId }
    });
  }

  deleteFactor(id: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/emission-factors/${id}`);
  }

  /**
   * Tous les facteurs d'une catégorie, chacun avec sa source.
   *
   * <p>Contrairement à {@link getCategoriesWithSources}, qui ne retient qu'un
   * facteur par référence, cette vue conserve les doublons de source : une même
   * référence peut être documentée par l'EPA, l'ADEME et l'IPCC avec des
   * valeurs distinctes, et la saisie doit pouvoir trancher explicitement.</p>
   */
  getFactorsByCategory(motifCategorie: RegExp): Observable<FacteurDetaille[]> {
    return this.http.get<RawFactor[]>(`${this.baseUrl}/emission-factors`).pipe(
      map(facteurs => facteurs
        .filter(f => f.carbonReference?.category?.name && motifCategorie.test(f.carbonReference.category.name))
        .map(f => ({
          id: f.id,
          referenceCode: f.carbonReference!.referenceCode,
          typeName: f.carbonReference!.typeName,
          categoryName: f.carbonReference!.category!.name,
          scopeCode: f.carbonReference!.category!.scope?.code ?? null,
          factorValue: f.factorValue,
          unit: f.unit,
          dataType: f.dataType,
          currency: f.currency,
          databaseSource: f.databaseSource ?? 'MISFAT_INTERNE',
          referenceYear: f.referenceYear,
          validityLabel: f.validityLabel ?? null
        }))
      )
    );
  }

  /**
   * Import par lot de facteurs depuis un classeur Excel.
   *
   * <p>Le serveur résout les colonnes par leur intitulé : le modèle réduit
   * (Type, Référence Carbone, Catégorie, Fact, Valeur Fact, Source, Date Fact,
   * Unité) est accepté au même titre que le gabarit complet.</p>
   */
  importFactors(fichier: File): Observable<ReferentialImportLog> {
    const formData = new FormData();
    formData.append('file', fichier, fichier.name);
    return this.http.post<ReferentialImportLog>(`${this.baseUrl}/referential/import`, formData);
  }

  getMeasures(entityId?: number | null, usineId?: number | null): Observable<any[]> {
    let params = new HttpParams();
    if (entityId != null) params = params.set('entityId', entityId);
    if (usineId != null) params = params.set('usineId', usineId);
    return this.http.get<any[]>(`${this.baseUrl}/emission-measures`, { params });
  }
}
