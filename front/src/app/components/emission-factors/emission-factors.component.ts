import {ChangeDetectorRef, Component, OnInit, inject} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import {
  ReferentialService, FactorRow, CategoryWithSources, aplatirEnLignes
} from '../../services/referential.service';
import { OriginBadgeComponent } from '../../shared/origin-badge/origin-badge.component';

/**
 * Référentiel des facteurs d'émission : recherche, filtres, pagination et
 * création manuelle.
 *
 * <p>Les données proviennent de `/api/v1/referential/categories-with-sources`,
 * aplaties en lignes de tableau. Le tri et la pagination sont côté client :
 * le référentiel compte 68 sources, un aller-retour serveur par page n'aurait
 * aucun intérêt.</p>
 */
@Component({
  selector: 'app-emission-factors',
  standalone: true,
  imports: [CommonModule, FormsModule, OriginBadgeComponent],
  templateUrl: './emission-factors.component.html',
  styleUrl: './emission-factors.component.css'
})
export class EmissionFactorsComponent implements OnInit {
  private readonly referentialService = inject(ReferentialService);
  private readonly cdr = inject(ChangeDetectorRef);

  lignes: FactorRow[] = [];
  categories: CategoryWithSources[] = [];
  chargement = false;
  erreur = '';

  // Filtres
  recherche = '';
  filtreScope = 'ALL';
  filtreCategorie = 'ALL';
  filtreOrigine = 'ALL';

  // Pagination
  page = 1;
  taillePage = 10;
  readonly taillesPage = [10, 25, 50];

  // Formulaire de création manuelle
  formulaireOuvert = false;
  enregistrement = false;
  messageFormulaire = '';
  nouveau = {
    carbonReferenceId: null as number | null,
    factorValue: null as number | null,
    unit: '',
    dataType: 'PHYSIQUE',
    currency: '',
    referenceYear: new Date().getFullYear(),
    uncertaintyPercent: null as number | null,
    /** Base documentaire citée : c'est elle qui rend le facteur vérifiable. */
    databaseSource: 'MISFAT_INTERNE',
    /** Validité telle que publiée : « Current », « From 2024-01-01 »… */
    validityLabel: ''
  };

  /**
   * Bases documentaires déjà présentes dans le référentiel.
   *
   * <p>Proposées à la saisie pour que « EPA 2024 » ne devienne pas « EPA2024 »
   * puis « epa 2024 » — trois provenances là où il n'y en a qu'une. La liste
   * reste ouverte : une base nouvelle doit pouvoir être citée sans qu'on ait
   * à modifier le code.</p>
   */
  get basesConnues(): string[] {
    return [...new Set(this.lignes.map(l => l.databaseSource).filter((b): b is string => !!b))]
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  ngOnInit(): void {
    this.charger();
  }

  /**
   * Colonnes du modèle d'échange des facteurs.
   *
   * <p>Export et import partagent la même structure : un fichier exporté,
   * corrigé dans Excel, se réimporte tel quel sans remise en forme.</p>
   */
  private static readonly COLONNES_ECHANGE = [
    'Type', 'Référence Carbone', 'Catégorie', 'Fact',
    'Valeur Fact', 'Source', 'Date Fact', 'Unité'
  ] as const;

  /** Exporte les lignes actuellement filtrées, pas tout le référentiel. */
  exporterExcel(): void {
    const donnees = this.lignesFiltrees.map(l => ({
      'Type': l.typeName,
      'Référence Carbone': l.referenceCode,
      'Catégorie': l.categoryName,
      'Fact': l.dataType === 'MONETAIRE' ? 'CO2e (monétaire)' : 'CO2e (KgCO2)',
      'Valeur Fact': l.defaultFactorValue,
      'Source': l.databaseSource,
      'Date Fact': l.validityLabel ?? l.referenceYear ?? '',
      'Unité': l.unit
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees, {
      header: [...EmissionFactorsComponent.COLONNES_ECHANGE]
    });
    feuille['!cols'] = [40, 18, 34, 18, 16, 22, 16, 12].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Facteurs');
    XLSX.writeFile(classeur, `referentiel-facteurs-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Télécharge un gabarit vide, en-têtes et ligne d'exemple. */
  telechargerModele(): void {
    const exemple = {
      'Type': 'Diesel',
      'Référence Carbone': 'MS2ENDI',
      'Catégorie': 'Energy',
      'Fact': 'CO2e (KgCO2)',
      'Valeur Fact': 3.294,
      'Source': 'IPCC 2019',
      'Date Fact': 'Current',
      'Unité': 'L'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple], {
      header: [...EmissionFactorsComponent.COLONNES_ECHANGE]
    });
    feuille['!cols'] = [40, 18, 34, 18, 16, 22, 16, 12].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Facteurs');
    XLSX.writeFile(classeur, 'modele-import-facteurs.xlsx');
  }

  // ---------- Import Excel par lot ----------

  importEnCours = false;
  bilanImport: { total: number; crees: number; references: number; erreurs: number; detail: string | null } | null = null;

  /**
   * Dépose un classeur de facteurs.
   *
   * <p>Le fichier part vers `emission-service`, qui porte déjà le moteur
   * d'import du référentiel : dupliquer la lecture Excel côté navigateur
   * ferait diverger les deux chemins d'alimentation de la même table.</p>
   */
  onFichierImport(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;

    this.importEnCours = true;
    this.bilanImport = null;
    this.erreur = '';

    this.referentialService.importFactors(fichier).subscribe({
      next: journal => {
        this.importEnCours = false;
        this.bilanImport = {
          total: journal.totalRows,
          crees: journal.createdFactors,
          references: journal.createdReferences,
          erreurs: journal.errorCount,
          detail: journal.errorDetail
        };
        this.charger();
        this.cdr.markForCheck();
      },
      error: err => {
        this.importEnCours = false;
        this.erreur = err?.error?.message
          ?? `Import refusé par le serveur (code ${err?.status ?? '?'}).`;
        this.cdr.markForCheck();
      }
    });
  }

  fermerBilanImport(): void {
    this.bilanImport = null;
  }

  charger(): void {
    this.chargement = true;
    this.erreur = '';

    this.referentialService.getCategoriesWithSources().subscribe({
      next: categories => {
        this.categories = categories;

        // L'aplatissement vit dans le service, pas ici : cet écran en tenait
        // sa propre copie, restée à une ligne par source quand celle du
        // service passait à une ligne par facteur. Un second facteur ajouté à
        // une source existante n'apparaissait donc pas, et son ajout passait
        // pour un écrasement.
        this.lignes = aplatirEnLignes(categories);
        this.chargement = false;
        this.recalculerFiltrage();
        this.cdr.markForCheck();
      },
      error: err => {
        this.chargement = false;
        this.erreur =
          err?.status === 0
            ? 'Service des émissions injoignable (port 8082).'
            : `Chargement du référentiel impossible (code ${err?.status ?? '?'}).`;
        this.cdr.markForCheck();
      }
    });
  }

  // ---------- Filtrage ----------

  get scopes(): string[] { return this._scopes; }

  get categoriesDisponibles(): string[] { return this._categoriesDisponibles; }

  /**
   * Résultat du filtrage, recalculé uniquement quand un critère change.
   *
   * <p>Un getter qui filtrerait à chaque appel renverrait un nouveau tableau à
   * chaque cycle de détection : en mode zoneless, Angular considère alors la vue
   * comme sans cesse modifiée et lève NG0103.</p>
   */
  private _lignesFiltrees: FactorRow[] = [];
  private _lignesPage: FactorRow[] = [];
  private _scopes: string[] = [];
  private _categoriesDisponibles: string[] = [];
  private _referencesDisponibles: { id: number; libelle: string }[] = [];

  private recalculerFiltrage(): void {
    const terme = this.recherche.trim().toLowerCase();

    this._lignesFiltrees = this.lignes.filter(ligne => {
      if (this.filtreScope !== 'ALL' && ligne.scopeCode !== this.filtreScope) return false;
      if (this.filtreCategorie !== 'ALL' && ligne.categoryName !== this.filtreCategorie) return false;
      if (this.filtreOrigine !== 'ALL' && ligne.origin !== this.filtreOrigine) return false;
      if (!terme) return true;

      return [ligne.referenceCode, ligne.typeName, ligne.categoryName, ligne.unit, ligne.databaseSource]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    this._scopes = [...new Set(this.lignes.map(l => l.scopeCode).filter((s): s is string => !!s))].sort();
    this._categoriesDisponibles = [...new Set(
      this.lignes
        .filter(l => this.filtreScope === 'ALL' || l.scopeCode === this.filtreScope)
        .map(l => l.categoryName)
    )].sort();
    this._referencesDisponibles = this.lignes
      .map(l => ({ id: l.carbonReferenceId, libelle: `${l.referenceCode} — ${l.typeName}` }))
      .filter((v, i, tab) => tab.findIndex(x => x.id === v.id) === i)
      .sort((a, b) => a.libelle.localeCompare(b.libelle));

    this._lignesPage = this._lignesFiltrees.slice(
      (this.page - 1) * this.taillePage,
      (this.page - 1) * this.taillePage + this.taillePage
    );
  }

  get lignesFiltrees(): FactorRow[] {
    return this._lignesFiltrees;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.lignesFiltrees.length / this.taillePage));
  }

  get lignesPage(): FactorRow[] { return this._lignesPage; }

  /** Toute modification de filtre ramène à la première page. */
  onFiltreChange(): void {
    this.page = 1;
    this.recalculerFiltrage();
  }

  onScopeChange(): void {
    this.filtreCategorie = 'ALL';
    this.page = 1;
    this.recalculerFiltrage();
  }

  allerPage(numero: number): void {
    this.page = Math.min(Math.max(1, numero), this.totalPages);
    this.recalculerFiltrage();
  }

  reinitialiserFiltres(): void {
    this.recherche = '';
    this.filtreScope = 'ALL';
    this.filtreCategorie = 'ALL';
    this.filtreOrigine = 'ALL';
    this.page = 1;
    this.recalculerFiltrage();
  }

  // ---------- Création manuelle ----------

  get referencesDisponibles(): { id: number; libelle: string }[] { return this._referencesDisponibles; }

  /** Identifiant du facteur en cours d'édition ; null en création. */
  factorEnEdition: number | null = null;
  ligneASupprimer: FactorRow | null = null;
  suppressionEnCours = false;

  ouvrirFormulaire(): void {
    this.factorEnEdition = null;
    this.nouveau = {
      carbonReferenceId: null,
      factorValue: null,
      unit: '',
      dataType: 'PHYSIQUE',
      currency: '',
      referenceYear: new Date().getFullYear(),
      uncertaintyPercent: null,
      databaseSource: 'MISFAT_INTERNE',
      validityLabel: ''
    };
    this.formulaireOuvert = true;
    this.messageFormulaire = '';
  }

  /** Édition ouverte pour toute ligne, manuelle comme importée. */
  editerLigne(ligne: FactorRow): void {
    if (ligne.defaultFactorId == null) {
      this.messageFormulaire = "Cette source n'a pas de facteur rattaché à modifier.";
      return;
    }
    this.factorEnEdition = ligne.defaultFactorId;
    this.nouveau = {
      carbonReferenceId: ligne.carbonReferenceId,
      factorValue: ligne.defaultFactorValue,
      unit: ligne.unit ?? '',
      dataType: ligne.dataType ?? 'PHYSIQUE',
      currency: ligne.currency ?? '',
      referenceYear: ligne.referenceYear ?? new Date().getFullYear(),
      uncertaintyPercent: ligne.uncertaintyPercent,
      // La provenance de la ligne éditée, et non celle du formulaire vide :
      // rouvrir un facteur EPA ne doit pas le rebaptiser « interne ».
      databaseSource: ligne.databaseSource ?? 'MISFAT_INTERNE',
      validityLabel: ligne.validityLabel ?? ''
    };
    this.formulaireOuvert = true;
    this.messageFormulaire = '';
  }

  demanderSuppression(ligne: FactorRow): void {
    this.ligneASupprimer = ligne;
  }

  annulerSuppression(): void {
    this.ligneASupprimer = null;
  }

  confirmerSuppression(): void {
    const ligne = this.ligneASupprimer;
    if (!ligne || ligne.defaultFactorId == null) {
      this.ligneASupprimer = null;
      return;
    }
    this.suppressionEnCours = true;

    this.referentialService.deleteFactor(ligne.defaultFactorId).subscribe({
      next: () => {
        this.suppressionEnCours = false;
        this.ligneASupprimer = null;
        this.charger();
        this.cdr.markForCheck();
      },
      error: err => {
        this.suppressionEnCours = false;
        this.erreur = err?.error?.message ?? `Suppression refusée (code ${err?.status ?? '?'}).`;
        this.ligneASupprimer = null;
        this.cdr.markForCheck();
      }
    });
  }

  fermerFormulaire(): void {
    this.formulaireOuvert = false;
    this.messageFormulaire = '';
  }

  get formulaireValide(): boolean {
    return (
      this.nouveau.carbonReferenceId !== null &&
      this.nouveau.factorValue !== null &&
      this.nouveau.factorValue > 0 &&
      this.nouveau.unit.trim().length > 0
    );
  }

  enregistrer(): void {
    if (!this.formulaireValide) return;

    this.enregistrement = true;
    this.messageFormulaire = '';

    const apres = {
      next: () => {
        this.enregistrement = false;
        this.formulaireOuvert = false;
        this.factorEnEdition = null;
        this.charger();
        this.cdr.markForCheck();
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.enregistrement = false;
        this.messageFormulaire =
          err?.error?.message ?? `Enregistrement refusé par le serveur (code ${err?.status ?? '?'}).`;
        this.cdr.markForCheck();
      }
    };

    if (this.factorEnEdition !== null) {
      this.referentialService
        .updateFactor(this.factorEnEdition, {
          carbonReferenceId: this.nouveau.carbonReferenceId!,
          factorValue: this.nouveau.factorValue!,
          unit: this.nouveau.unit.trim(),
          dataType: this.nouveau.dataType,
          currency: this.nouveau.dataType === 'MONETAIRE' ? this.nouveau.currency || null : null,
          referenceYear: this.nouveau.referenceYear,
          uncertaintyPercent: this.nouveau.uncertaintyPercent,
          databaseSource: this.nouveau.databaseSource.trim() || null,
          validityLabel: this.nouveau.validityLabel.trim() || null
        })
        .subscribe(apres);
      return;
    }

    this.referentialService
      .createFactor({
        carbonReferenceId: this.nouveau.carbonReferenceId!,
        factorValue: this.nouveau.factorValue!,
        unit: this.nouveau.unit.trim(),
        dataType: this.nouveau.dataType,
        currency: this.nouveau.dataType === 'MONETAIRE' ? this.nouveau.currency || null : null,
        referenceYear: this.nouveau.referenceYear,
        uncertaintyPercent: this.nouveau.uncertaintyPercent,
        databaseSource: this.nouveau.databaseSource.trim() || null,
        validityLabel: this.nouveau.validityLabel.trim() || null
      })
      .subscribe({
        next: () => {
          this.enregistrement = false;
          this.formulaireOuvert = false;
          this.charger();
          this.cdr.markForCheck();
        },
        error: err => {
          this.enregistrement = false;
          this.messageFormulaire =
            err?.error?.message ?? `Enregistrement refusé par le serveur (code ${err?.status ?? '?'}).`;
          this.cdr.markForCheck();
        }
      });
  }
}
