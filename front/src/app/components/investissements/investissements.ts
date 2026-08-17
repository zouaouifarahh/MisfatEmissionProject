import {
  ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, isDevMode, inject } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import {
  Rapprochement, adaptateurStandard, remigrerLignes, libelleRapprochement,
  migrationFaite, marquerMigration, messagePourMigration
} from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale } from '../../models/organization.model';

import {
  CategorieCarbone, CATEGORIES, CATEGORIE_REPLI, OrigineFacteur,
  retenirFacteurCapex, classerFacteursCapex, calculerEmissionCapex, enTonnes,
  tauxCouverture, categorieAppariee, classeBadgeCategorie, emojiCategorie
} from './investissements-facteur';

import { lireClasseurImmobilisations } from './investissements-excel';
import { statutRetenu } from '../../shared/ui/kpis-categorie';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersImmobilisation } from '../../shared/dispatch/adaptateurs-mesure';

/** Immobilisation valorisée, catégorie 15 du Scope 3. */
export interface EmissionInvestissement {
  id: number;
  scope: string;
  categorie: string;
  numeroImmo: string;
  /**
   * Référence carbone du référentiel, lorsque le classeur la porte.
   *
   * <p>Le numéro d'immobilisation identifie un actif comptable, pas un facteur :
   * il ne doit jamais servir de clé de valorisation. C'est cette référence qui
   * désigne le facteur, quand elle est renseignée.</p>
   */
  referenceCarbone?: string;
  /** Code article de l'ERP, identifiant de gestion de la pièce. */
  codeArticle?: string;
  designation: string;
  categorieCarbone: CategorieCarbone;
  /** Cellule d'origine, conservée pour justifier un repli. */
  categorieTexte: string;
  /** La famille a été appliquée d'office, faute d'appariement. */
  replique: boolean;
  montant: number;
  devise: string;
  facteur: number;
  uniteFacteur: string;
  libelleFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  creeLe: string;
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
}

const MOTIF_CATEGORIE = /^Category 15:/i;
const CLE_STOCKAGE = 'listeEmissionsInvestissements';
const LIBELLE_CATEGORIE = 'Investissements';
const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-investissements',
  standalone: true,
  imports: [LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './investissements.html',
  styleUrl: './investissements.css'
})
export class InvestissementsComponent implements OnInit {

  /** Provenance de la donnée : saisie, estimation ou import de classeur. */
  filtreProvenance = 'Toutes';

  readonly provenanceDe = provenanceDe;
  readonly classeProvenance = classeProvenance;
  readonly libelleProvenance = libelleProvenance;

  /**
   * Magasin des lignes ventilées.
   *
   * <p>Injecté par `inject()` plutôt qu'en paramètre de constructeur : la
   * fabrique du composant n'a alors aucun jeton à résoudre depuis les
   * métadonnées du type.</p>
   */
  private readonly dispatchStore = inject(DispatchStore);

  listeEmissions: EmissionInvestissement[] = [];
  filtreCategorie = 'Toutes';
  /** Appariement de la catégorie carbone : validé ou rattrapé sur #N/A. */
  filtreStatut = 'Tous';
  /** Origine du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreOrigine = 'Tous';
  rechercheTexte = '';

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  readonly taillesPage = TAILLES_PAGE;
  taillePage = TAILLES_PAGE[0];
  pageCourante = 1;

  modaleSaisieOuverte = false;
  modaleImportOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;
  messageErreur = '';

  fichierSelectionne: File | null = null;
  importErreurMsg = '';
  toastMessage = '';
  toastSecondaire = '';

  readonly categoriesCarbone = CATEGORIES;
  readonly categorieRepli = CATEGORIE_REPLI;
  readonly classeBadgeCategorie = classeBadgeCategorie;
  readonly emojiCategorie = emojiCategorie;

  facteursDisponibles: FacteurDetaille[] = [];

  /**
   * Compte rendu de la migration d'appariement.
   *
   * <p>Distinct de {@link avertissementReferentiel}, que le chargement réécrit
   * juste après : les deux messages s'effaceraient l'un l'autre.</p>
   */
  messageMigration = '';
  facteursCompatibles: FacteurDetaille[] = [];
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  erreurInitialisation = '';
  avertissementStockage = '';

  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    numeroImmo: '',
    designation: '',
    categorieCarbone: 'Metals / Metal Products' as CategorieCarbone,
    montant: null as number | null
  };

  constructor(
    private datePipe: DatePipe,
    private referentialService: ReferentialService,
    private organizationService: OrganizationService,
    private entityService: EntityContextService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /**
   * Initialisation défensive : un échec est rapporté dans l'interface, jamais
   * propagé au tableau de bord dont il interromprait le rendu.
   */
  ngOnInit(): void {
    try {
      this.listeEmissions = this.listeEmissions ?? [];

      if (isPlatformBrowser(this.platformId)) {
        const sauvegarde = localStorage.getItem(CLE_STOCKAGE);
        if (sauvegarde) {
          try {
            const relu = JSON.parse(sauvegarde);
            this.listeEmissions = Array.isArray(relu) ? relu : [];
          } catch {
            this.listeEmissions = [];
          }
        }
      }

      this.chargerFacteurs();
      this.chargerFiliales();

      this.entityService.filter$.subscribe({
        next: filtre => {
          this.societeActiveId = filtre?.entityId ?? null;
          this.majPerimetre();
        },
        error: () => this.signalerEchec('Périmètre organisationnel indisponible.')
      });

      if (isDevMode()) console.log('Composant Investissements initialisé avec succès');
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[investissements] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 15 : les facteurs de '
            + 'repli ADEME sont appliqués. Versez la base pour les remplacer.';
        this.majFacteursCompatibles();
        this.cdr.detectChanges();
      },
      error: () => {
        this.avertissementReferentiel = 'Référentiel carbone injoignable (port 8082) : '
          + 'les facteurs de repli ADEME sont appliqués.';
        this.cdr.detectChanges();
      }
    });
  }

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => { this.filiales = Array.isArray(filiales) ? filiales : []; this.majPerimetre(); },
      error: () => { this.filiales = []; this.majPerimetre(); }
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;
    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
    this.cdr.detectChanges();
  }

  // ---------- Indicateurs de synthèse ----------

  get totalAcquisitions(): number {
    return this.emissionsFiltrees.reduce((s, e) => s + e.montant, 0);
  }

  get totalEmissionsKg(): number {
    return this.emissionsFiltrees.reduce((s, e) => s + e.emissionCalculee, 0);
  }

  get totalEmissionsTonnes(): number {
    return enTonnes(this.totalEmissionsKg);
  }

  get nombreImmobilisations(): number {
    return this.emissionsFiltrees.length;
  }

  /** Part des immobilisations appariées à une famille documentée. */
  get couvertureCategorisee(): number {
    return tauxCouverture(this.emissionsFiltrees.map(e => e.categorieCarbone));
  }

  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.replique).length;
  }

  // ---------- Tableau et pagination ----------

  get emissionsFiltrees(): EmissionInvestissement[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.toutesLignes.filter(item => {
      if (!provenanceRetenue(item, this.filtreProvenance)) return false;
      if (this.filtreCategorie !== 'Toutes' && item.categorieCarbone !== this.filtreCategorie) return false;
      if (this.filtreStatut === 'Validé' && item.replique) return false;
      if (this.filtreStatut === 'Fallback' && !item.replique) return false;
      if (!statutRetenu(item, this.filtreOrigine)) return false;
      if (!terme) return true;
      return [item.numeroImmo, item.designation, item.categorieCarbone, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'montant') return (a.montant - b.montant) * sens;
        if (this.sortColumn === 'designation') return a.designation.localeCompare(b.designation) * sens;
        if (this.sortColumn === 'numeroImmo') return a.numeroImmo.localeCompare(b.numeroImmo) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionInvestissement[] {
    const liste = this.emissionsFiltrees;
    const page = Math.min(this.pageCourante, Math.max(1, Math.ceil(liste.length / this.taillePage)));
    return liste.slice((page - 1) * this.taillePage, (page - 1) * this.taillePage + this.taillePage);
  }

  get premierIndexPage(): number {
    return this.emissionsFiltrees.length ? (this.pageCourante - 1) * this.taillePage + 1 : 0;
  }

  get dernierIndexPage(): number {
    return Math.min(this.pageCourante * this.taillePage, this.emissionsFiltrees.length);
  }

  allerPage(page: number): void {
    this.pageCourante = Math.min(Math.max(1, page), this.nombrePages);
    this.cdr.detectChanges();
  }

  changerTaillePage(): void {
    this.taillePage = Number(this.taillePage);
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  onFiltreChange(): void { this.pageCourante = 1; this.cdr.detectChanges(); }

  /** Conversion d'une ligne en tonnes, pour la colonne de restitution. */
  enTonnes(kilogrammes: number): number { return enTonnes(kilogrammes); }

  sortData(colonne: string): void {
    if (this.sortColumn === colonne) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = colonne;
      this.sortDirection = 'desc';
    }
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  reinitialiserFiltres(): void {
    this.filtreProvenance = 'Toutes';
    this.filtreCategorie = 'Toutes';
    this.filtreOrigine = 'Tous';
    this.filtreStatut = 'Tous';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionInvestissement): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        numeroImmo: emission.numeroImmo,
        designation: emission.designation,
        categorieCarbone: emission.categorieCarbone,
        montant: emission.montant
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        numeroImmo: '', designation: '',
        categorieCarbone: 'Metals / Metal Products', montant: null
      };
    }

    this.majFacteursCompatibles();
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void { this.modaleSaisieOuverte = false; this.cdr.detectChanges(); }

  onCategorieChange(): void { this.majFacteursCompatibles(); this.cdr.detectChanges(); }
  onSaisieChange(): void { this.cdr.detectChanges(); }
  onFacteurChoisiChange(): void { this.cdr.detectChanges(); }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursCapex(this.facteursDisponibles, {
      categorie: this.formModel.categorieCarbone, devise: this.deviseActive
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
  }

  get facteurCourant() {
    const choisi = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId));
    if (choisi) {
      return {
        origine: 'MS SQL BDD' as OrigineFacteur, valeur: choisi.factorValue,
        unite: choisi.currency?.trim() || choisi.unit || this.deviseActive,
        libelle: choisi.typeName, reference: choisi.referenceCode,
        baseAppliquee: choisi.databaseSource || 'MS SQL BDD', id: choisi.id
      };
    }
    return retenirFacteurCapex(this.facteursDisponibles, {
      categorie: this.formModel.categorieCarbone, devise: this.deviseActive
    });
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionCapex(this.formModel.montant, this.facteurCourant.valeur);
  }

  get emissionPrevisionnelleTonnes(): number {
    return enTonnes(this.emissionPrevisionnelle);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.designation.trim() && !m.numeroImmo.trim()) {
      return this.refuser('La désignation ou le n° d\'immobilisation est obligatoire.');
    }
    if (m.montant === null || m.montant <= 0) {
      return this.refuser('Le montant d\'acquisition est obligatoire.');
    }

    const facteur = this.facteurCourant;

    const ligne: EmissionInvestissement = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      numeroImmo: m.numeroImmo.trim()
        || `IMM-${String(this.listeEmissions.length + 1).padStart(5, '0')}`,
      designation: m.designation.trim() || m.numeroImmo.trim(),
      categorieCarbone: m.categorieCarbone,
      categorieTexte: m.categorieCarbone,
      replique: !categorieAppariee(m.categorieCarbone),
      montant: m.montant,
      devise: this.deviseActive,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionCapex(m.montant, facteur.valeur),
      creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? ''
    };

    if (this.isEdition && this.idEditionActive !== null) {
      const index = this.listeEmissions.findIndex(e => e.id === this.idEditionActive);
      if (index >= 0) this.listeEmissions[index] = ligne;
    } else {
      this.listeEmissions = [ligne, ...this.listeEmissions];
    }

    this.sauvegarder();
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  private refuser(message: string): void {
    this.erreurFormulaire = true;
    this.messageErreur = message;
    this.cdr.detectChanges();
  }

  supprimerEmission(id: number): void {
    this.listeEmissions = this.listeEmissions.filter(e => e.id !== id);
    this.sauvegarder();
    this.cdr.detectChanges();
  }

  private sauvegarder(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(this.listeEmissions));
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes).`;
      this.cdr.detectChanges();
    }
  }

  // ---------- Import ----------

  ouvrirModaleImport(): void {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport(): void { this.modaleImportOuverte = false; this.cdr.detectChanges(); }

  onFichierChange(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    this.fichierSelectionne = input.files?.[0] ?? null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerToast(): void {
    this.toastMessage = '';
    this.toastSecondaire = '';
    this.cdr.detectChanges();
  }

  telechargerGabarit(): void {
    const exemples = [
      {
        'Numéro d\'immobilisation': '20113', 'Nom': 'MOULE 25.088 ARGO',
        'Acquisitions': 34001, 'Catégorie Carbone': 'Metals / Metal Products'
      },
      {
        'Numéro d\'immobilisation': '21580', 'Nom': 'PROFILE ALUMINIUM 6M',
        'Acquisitions': 12500, 'Catégorie Carbone': 'Alum / Aluminium'
      },
      {
        'Numéro d\'immobilisation': 'IME-00851', 'Nom': 'CONVOYEUR A BANDE',
        'Acquisitions': 60000, 'Catégorie Carbone': '#N/A'
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [24, 32, 18, 28].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Immobilisations');
    XLSX.writeFile(classeur, 'gabarit-investissements.xlsx');
  }

  /**
   * Import de l'extraction des immobilisations.
   *
   * <p>Une catégorie absente ou en erreur ne rejette jamais la ligne : elle
   * bascule sur la famille de repli, signalée par le statut de la ligne.</p>
   */
  importerFichier(): void {
    if (!this.fichierSelectionne) {
      this.importErreurMsg = 'Sélectionnez un fichier .xlsx.';
      this.cdr.detectChanges();
      return;
    }

    const lecteur = new FileReader();
    lecteur.onload = () => {
      try {
        const classeur = XLSX.read(lecteur.result, { type: 'array', cellDates: true });
        const lecture = lireClasseurImmobilisations(classeur);

        if (!lecture) {
          this.importErreurMsg = 'Aucune feuille d\'immobilisations reconnue dans ce classeur.';
          this.cdr.detectChanges();
          return;
        }

        if (lecture.colonnesManquantes.length) {
          this.importErreurMsg = lecture.avertissement;
          this.cdr.detectChanges();
          return;
        }

        if (!lecture.lignes.length) {
          this.importErreurMsg = `Feuille « ${lecture.feuille} » : aucune immobilisation exploitable.`;
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';

        const ajoutees: EmissionInvestissement[] = lecture.lignes.map((ligne, index) => {
          // La référence carbone du classeur prime sur la catégorie : elle
          // désigne le facteur exact, là où la catégorie n'oriente que vers une
          // famille.
          const facteur = retenirFacteurCapex(this.facteursDisponibles, {
            categorie: ligne.categorie,
            devise: this.deviseActive,
            referenceCarbone: ligne.referenceCarbone,
            codeArticle: ligne.codeArticle
          });

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            numeroImmo: ligne.numeroImmo,
            referenceCarbone: ligne.referenceCarbone,
            codeArticle: ligne.codeArticle,
            designation: ligne.designation,
            categorieCarbone: ligne.categorie,
            categorieTexte: ligne.categorieTexte,
            replique: ligne.categorieAbsente,
            montant: ligne.montant,
            devise: this.deviseActive,
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionCapex(ligne.montant, facteur.valeur),
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} immobilisations effectuée avec succès !`;
        this.toastSecondaire = lecture.repliesNA
          ? `${lecture.repliesNA} ligne(s) sans catégorie exploitable (#N/A) basculée(s) sur `
            + '« Équipements Ind. » au facteur de sécurité 0,250 kgCO₂e/TND.'
          : '';
        this.importErreurMsg = lecture.rejets.length
          ? `${lecture.rejets.length} ligne(s) écartée(s) : ${lecture.rejets[0].motif}.`
          : '';

        this.modaleImportOuverte = false;
        this.cdr.detectChanges();
      } catch (erreur) {
        this.importErreurMsg = 'Fichier illisible : '
          + (erreur instanceof Error ? erreur.message : 'vérifiez qu\'il s\'agit d\'un classeur .xlsx.');
        this.cdr.detectChanges();
      }
    };
    lecteur.readAsArrayBuffer(this.fichierSelectionne);
  }

  exporterExcel(): void {
    const donnees = this.emissionsFiltrees.map(e => ({
      'N immobilisation': e.numeroImmo,
      'Designation de l actif': e.designation,
      'Categorie carbone': e.categorieCarbone,
      'Montant acquisition': e.montant,
      'Devise': e.devise,
      'Facteur d emission': e.facteur,
      'Unite facteur': `kgCO2e/${e.uniteFacteur}`,
      'Base appliquee': e.baseAppliquee,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Emissions (tCO2e)': enTonnes(e.emissionCalculee),
      'Statut': e.replique ? 'Fallback applique (#N/A)' : 'Valide'
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Investissements');
    XLSX.writeFile(classeur, `investissements-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Lignes reçues de la ventilation d'un classeur comptable.
   *
   * <p>Elles s'affichent dans la grille au même titre que les saisies, mais
   * portent un identifiant négatif : la sauvegarde de l'écran ne les écrit
   * jamais dans son stockage, faute de quoi chaque import les dupliquerait.</p>
   */
  get lignesVentilees(): EmissionInvestissement[] {
    return lignesVentileesPour<EmissionInvestissement>(
      this.dispatchStore, 'investissements', (ligne, rang) => adapterVersImmobilisation(ligne, rang) as unknown as EmissionInvestissement
    );
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionInvestissement[] {
    return [...this.lignesVentilees, ...this.listeEmissions];
  }

  /**
   * Rejoue l'appariement sur les immobilisations déjà enregistrées.
   *
   * <p>C'est l'écran où le symptôme se voyait le mieux : les lignes antérieures
   * aux colonnes Référence / Code article ERP n'en portaient aucune et
   * affichaient un tiret, tout en gardant le facteur de repli de leur famille.
   * La migration les confronte au référentiel de la catégorie 15.</p>
   *
   * <p>Une référence appartenant à une autre catégorie — un bien d'équipement en
   * catégorie 2, par exemple — reste volontairement non appariée : la rattacher
   * ici verserait son empreinte dans la mauvaise catégorie du rapport.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = 'misfat_ref_matching_v2_investissements';
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionInvestissement>({
        reference: 'referenceCarbone',
        codeArticle: 'codeArticle',
        categorie: 'categorieCarbone',
        facteur: 'facteur',
        base: 'baseAppliquee',
        uniteFacteur: 'uniteFacteur',
        emission: 'emissionCalculee',
        rapprochement: 'rapprochement'
      })
    );

    if (corrigees) {
      this.listeEmissions = lignes;
      this.sauvegarder();
      this.messageMigration = messagePourMigration(corrigees);
    }

    marquerMigration(MARQUEUR);
  }

  /** Intitulé du degré de rapprochement, pour l'infobulle du tableau. */
  libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
    return libelleRapprochement(rapprochement);
  }

}
