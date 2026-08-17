import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersAchat } from '../../shared/dispatch/adaptateurs-mesure';

/** Ligne d'achat de bien ou service, catégorie 1 du Scope 3. */
export interface EmissionAchat {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;
  /** Catégorie Carbone de l'ERP : c'est elle qui porte le facteur. */
  categorieCarbone: string;
  /**
   * Code article de l'ERP, tel que la base achats le porte.
   *
   * <p>Il identifie la pièce dans le système de gestion, là où la référence
   * carbone identifie le facteur : l'un permet à un acheteur de retrouver la
   * ligne, l'autre à un vérificateur de retrouver le facteur appliqué.</p>
   */
  codeArticle?: string;
  /**
   * Comment le facteur a été rattaché à la ligne.
   *
   * <p>Un rapprochement par référence carbone est exact ; un rapprochement par
   * libellé est une interprétation. La distinction reste visible au tableau.</p>
   */
  rapprochement?: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE';
  /** Nom du produit MISFAT : identifie la ligne sans influer sur le calcul. */
  etiquette: string;
  typeDonnee: 'Physique' | 'Monetaire';
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
  /**
   * Justification de l'hypothèse retenue.
   *
   * <p>Sur une ligne ventilée, elle porte la règle qui l'a acheminée jusqu'ici
   * — numéro de compte, catégorie carbone ou libellé reconnu.</p>
   */
  descriptionHypothese?: string;
  creeLe: string;
  databaseSource?: string;
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
}

/** Catégorie GHG couverte : achats de biens et services. */
const MOTIF_CATEGORIE = /Category 1/i;

const CLE_STOCKAGE = 'listeEmissionsAchats';

@Component({
  selector: 'app-biens-services',
  standalone: true,
  imports: [KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './biens-services.html',
  styleUrl: './biens-services.css'
})
export class BiensServicesComponent implements OnInit {

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

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionAchat[] = [];
  filtreEtablissement = 'Tous';
  rechercheTexte = '';

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  modaleSaisieOuverte = false;
  modaleImportOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;
  messageErreur = '';

  fichierSelectionne: File | null = null;
  importSuccesMsg = '';
  importErreurMsg = '';

  // ---------- Référentiel carbone ----------
  facteursDisponibles: FacteurDetaille[] = [];
  /** Catégories Carbone documentées, telles qu'elles figurent en colonne T. */
  categoriesCarbone: string[] = [];
  /** Facteurs de la catégorie choisie, restreints au mode de valorisation. */
  facteursDeLaCategorie: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';
  /** Renseigné quand la catégorie ne documente pas le mode demandé. */
  avertissementMode = '';

  /** Compte rendu du re-rapprochement des lignes existantes, s'il a eu lieu. */
  messageMigration = '';

  /** Recherche du sélecteur de catégorie : la liste en compte plusieurs dizaines. */
  rechercheCategorie = '';
  categorieOuverte = false;

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    scope: 'SCOPE_3',
    categorie: 'Biens et services achetés',
    etablissement: '',
    reference: '',
    categorieCarbone: '',
    etiquette: '',
    typeDonnee: 'Monetaire' as 'Physique' | 'Monetaire',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: 'TND',
    dateDebut: '',
    dateFin: '',
    hypothese: 'Réelle' as 'Estimation' | 'Réelle',
    databaseSource: ''
  };

  constructor(
    private datePipe: DatePipe,
    private referentialService: ReferentialService,
    private organizationService: OrganizationService,
    private entityService: EntityContextService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const sauvegarde = localStorage.getItem(CLE_STOCKAGE);
      if (sauvegarde) {
        try {
          this.listeEmissions = JSON.parse(sauvegarde);
        } catch {
          this.listeEmissions = [];
        }
      }
    }

    this.chargerFacteurs();
    this.chargerFiliales();

    this.entityService.filter$.subscribe(filtre => {
      this.societeActiveId = filtre.entityId;
      this.majPerimetre();
    });
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.chargementFacteurs = true;
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = facteurs;

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau.
        this.remigrerParReferentiel();
        this.categoriesCarbone = [...new Set(facteurs.map(f => f.typeName))]
          .sort((a, b) => a.localeCompare(b, 'fr'));
        this.chargementFacteurs = false;

        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur d\'achat dans le référentiel carbone. '
            + 'Importez la base depuis « Référentiel Facteurs ».';
        this.cdr.detectChanges();
      },
      error: () => {
        this.chargementFacteurs = false;
        this.avertissementReferentiel = 'Référentiel carbone injoignable (emission-service, port 8082).';
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Rattache une ligne d'achat à son facteur, par ordre de certitude.
   *
   * <p>Trois degrés, du plus sûr au plus interprétatif : la référence carbone
   * exacte, puis le code article de l'ERP, puis le libellé de catégorie. Aucun
   * repli générique n'est appliqué — une ligne qu'aucun degré ne rattache est
   * signalée plutôt que valorisée avec un facteur qui ne la documente pas.</p>
   *
   * @returns le facteur retenu et le degré qui l'a désigné, ou `null`.
   */
  private apparier(referenceCarbone: string, codeArticle: string, categorie: string):
    { facteur: FacteurDetaille; rapprochement: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE' } | null {

    if (referenceCarbone) {
      const cible = referenceCarbone.trim().toUpperCase();
      const exact = this.facteursDisponibles
        .find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
      if (exact) return { facteur: exact, rapprochement: 'REFERENCE' };
    }

    if (codeArticle) {
      const cible = codeArticle.trim().toUpperCase();
      const parArticle = this.facteursDisponibles
        .find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
      if (parArticle) return { facteur: parArticle, rapprochement: 'CODE_ARTICLE' };
    }

    if (categorie) {
      const parCategorie = this.facteursDisponibles
        .find(f => this.normaliser(f.typeName) === this.normaliser(categorie));
      if (parCategorie) return { facteur: parCategorie, rapprochement: 'CATEGORIE' };
    }

    return null;
  }


  /**
   * Rejoue l'appariement sur les lignes d'achat déjà enregistrées.
   *
   * <p>Les lignes antérieures à {@link apparier} ont été rattachées au premier
   * facteur de leur catégorie. Cette migration les confronte à nouveau au
   * référentiel : celle qui porte sa référence carbone retrouve son facteur
   * exact et sa base documentaire réelle. Rien n'est écrasé qui ne s'améliore.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = 'misfat_ref_matching_v2_biens_services';
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(MARQUEUR) === 'fait') return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    let corrigees = 0;

    this.listeEmissions = this.listeEmissions.map(ligne => {
      const apparie = this.apparier(
        ligne.reference ?? '', ligne.codeArticle ?? '', ligne.categorieCarbone ?? ''
      );
      if (!apparie) return ligne;

      const { facteur, rapprochement } = apparie;

      const memeFacteur = Math.abs((ligne.facteur ?? 0) - facteur.factorValue) < 1e-9;
      const memeBase = (ligne.databaseSource ?? '') === (facteur.databaseSource ?? '');
      if (memeFacteur && memeBase && ligne.rapprochement === rapprochement) return ligne;

      corrigees++;
      return {
        ...ligne,
        reference: facteur.referenceCode,
        categorieCarbone: facteur.typeName,
        facteur: facteur.factorValue,
        databaseSource: facteur.databaseSource,
        rapprochement,
        emissionCalculee: parseFloat((ligne.quantite * facteur.factorValue).toFixed(4))
      };
    });

    if (corrigees) {
      this.sauvegarder();
      this.messageMigration = `${corrigees} ligne(s) ont été rapprochées à nouveau du `
        + `référentiel : facteur et base documentaire mis à jour.`;
    }

    try {
      localStorage.setItem(MARQUEUR, 'fait');
    } catch (erreur) {
      console.error('[achats] Marqueur de migration non persisté', erreur);
    }

    this.cdr.detectChanges();
  }

  /** Libellé du degré de rapprochement, pour le tableau. */
  libelleRapprochement(ligne: EmissionAchat): string {
    switch (ligne.rapprochement) {
      case 'REFERENCE': return 'Référence carbone';
      case 'CODE_ARTICLE': return 'Code article ERP';
      case 'CATEGORIE': return 'Libellé de catégorie';
      default: return 'Saisie manuelle';
    }
  }

  /**
   * Forme comparable d'un libellé de catégorie.
   *
   * <p>L'ERP et le référentiel divergent sur la casse et la ponctuation, et le
   * fichier d'achats porte quelques coquilles (« expect » pour « except »).
   * Comparer les chaînes brutes laisserait ces lignes sans facteur.</p>
   */
  private normaliser(valeur: string): string {
    return (valeur ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** Catégories proposées par le sélecteur, filtrées à la frappe. */
  get categoriesFiltrees(): string[] {
    const terme = this.normaliser(this.rechercheCategorie);
    if (!terme) return this.categoriesCarbone;
    return this.categoriesCarbone.filter(c => this.normaliser(c).includes(terme));
  }

  ouvrirCategorie(): void {
    this.categorieOuverte = true;
    this.rechercheCategorie = '';
    this.cdr.detectChanges();
  }

  fermerCategorie(): void {
    this.categorieOuverte = false;
    this.cdr.detectChanges();
  }

  choisirCategorie(categorie: string): void {
    this.formModel.categorieCarbone = categorie;
    this.categorieOuverte = false;
    this.onCategorieChange();
  }

  // ---------- Périmètre ----------

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = filiales;
        this.majPerimetre();
      },
      error: () => this.cdr.detectChanges()
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';

    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    if (this.formModel.etablissement
        && !this.usinesDisponibles.some(u => u.nom === this.formModel.etablissement)) {
      this.formModel.etablissement = '';
    }
    if (this.filtreEtablissement !== 'Tous'
        && !this.usinesDisponibles.some(u => u.nom === this.filtreEtablissement)) {
      this.filtreEtablissement = 'Tous';
    }
    if (this.formModel.typeDonnee === 'Monetaire') {
      this.formModel.unite = this.deviseActive;
    }
    this.cdr.detectChanges();
  }

  // ---------- Tableau ----------

  get emissionsFiltrees(): EmissionAchat[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.toutesLignes.filter(item => {
      if (!provenanceRetenue(item, this.filtreProvenance)) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (!terme) return true;
      return [item.categorieCarbone, item.etiquette, item.etablissement, item.reference, item.databaseSource]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'periode') {
          return (new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime()) * sens;
        }
        if (this.sortColumn === 'reference') return a.reference.localeCompare(b.reference) * sens;
        return 0;
      });
    }
    return liste;
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  sortData(colonne: string): void {
    if (this.sortColumn === colonne) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = colonne;
      this.sortDirection = 'desc';
    }
    this.cdr.detectChanges();
  }

  reinitialiserFiltres(): void {
    this.filtreProvenance = 'Toutes';
    this.filtreStatut = 'Tous';
    this.filtreEtablissement = 'Tous';
    this.rechercheTexte = '';
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionAchat): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursDeLaCategorie = [];
    this.categorieOuverte = false;

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope,
        categorie: 'Biens et services achetés',
        etablissement: emission.etablissement,
        reference: emission.reference,
        categorieCarbone: emission.categorieCarbone,
        etiquette: emission.etiquette,
        typeDonnee: emission.typeDonnee,
        quantite: emission.quantite,
        facteur: emission.facteur,
        unite: emission.unite,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin,
        hypothese: emission.hypothese,
        databaseSource: emission.databaseSource ?? ''
      };
      this.onCategorieChange(emission.databaseSource);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_3',
        categorie: 'Biens et services achetés',
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        reference: '',
        categorieCarbone: '',
        etiquette: '',
        typeDonnee: 'Monetaire',
        quantite: null,
        facteur: null,
        unite: this.deviseActive,
        dateDebut: '',
        dateFin: '',
        hypothese: 'Réelle',
        databaseSource: ''
      };
    }

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  /**
   * La catégorie carbone détermine le facteur applicable.
   *
   * <p>Un même poste peut être documenté en monétaire et en physique : on ne
   * retient que les facteurs du mode courant, faute de quoi un facteur exprimé
   * par dinar s'appliquerait à un nombre de pièces.</p>
   */
  onCategorieChange(sourcePreferee?: string): void {
    const cible = this.normaliser(this.formModel.categorieCarbone);
    const typeSQL = this.formModel.typeDonnee === 'Physique' ? 'PHYSIQUE' : 'MONETAIRE';

    const memeCategorie = this.facteursDisponibles.filter(f => this.normaliser(f.typeName) === cible);
    this.facteursDeLaCategorie = memeCategorie.filter(f => f.dataType.toUpperCase() === typeSQL);

    // Le mode demandé n'est pas documenté : on le dit plutôt que de laisser un
    // formulaire muet, et on propose le mode réellement disponible.
    if (!this.facteursDeLaCategorie.length && memeCategorie.length) {
      const autre = memeCategorie[0].dataType.toUpperCase() === 'MONETAIRE' ? 'monétaire' : 'physique';
      this.avertissementMode =
        `Cette catégorie n'est documentée qu'en mode ${autre}. Basculez le type de données.`;
    } else if (!memeCategorie.length && this.formModel.categorieCarbone) {
      this.avertissementMode =
        'Aucun facteur pour cette catégorie dans le référentiel carbone.';
    } else {
      this.avertissementMode = '';
    }

    const prefere = sourcePreferee
      ? this.facteursDeLaCategorie.find(f => f.databaseSource === sourcePreferee)
      : undefined;
    const retenu: FacteurDetaille | null = prefere ?? this.facteursDeLaCategorie[0] ?? null;

    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  onBaseChange(): void {
    const retenu = this.facteursDeLaCategorie.find(f => f.databaseSource === this.formModel.databaseSource) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /**
   * Reporte le facteur retenu.
   *
   * <p>L'unité vient du référentiel en mode physique (pcs, kg, unit) et de la
   * société active en mode monétaire.</p>
   */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.databaseSource = '';
      this.formModel.unite = this.formModel.typeDonnee === 'Monetaire' ? this.deviseActive : 'pcs';
      return;
    }

    this.formModel.reference = facteur.referenceCode;
    this.formModel.facteur = facteur.factorValue;
    this.formModel.databaseSource = facteur.databaseSource;
    this.formModel.unite = this.formModel.typeDonnee === 'Monetaire'
      ? this.deviseActive
      : facteur.unit;
  }

  changerTypeDonnee(type: 'Physique' | 'Monetaire'): void {
    this.formModel.typeDonnee = type;
    // Le jeu de facteurs applicables change avec le mode.
    this.onCategorieChange();
  }

  get emissionPrevisionnelle(): number {
    return (this.formModel.quantite ?? 0) * (this.formModel.facteur ?? 0);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.categorieCarbone || m.quantite === null || m.facteur === null
        || !m.dateDebut || !m.dateFin) {
      this.erreurFormulaire = true;
      this.messageErreur = 'Usine, catégorie carbone, quantité et période sont obligatoires.';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      this.erreurFormulaire = true;
      this.messageErreur = 'La date de fin précède la date de début.';
      this.cdr.detectChanges();
      return;
    }

    const ligne: EmissionAchat = {
      id: this.idEditionActive ?? Date.now(),
      scope: m.scope,
      categorie: m.categorie,
      etablissement: m.etablissement,
      reference: m.reference,
      categorieCarbone: m.categorieCarbone,
      etiquette: m.etiquette.trim(),
      typeDonnee: m.typeDonnee,
      quantite: m.quantite,
      facteur: m.facteur,
      unite: m.unite,
      dateDebut: m.dateDebut,
      dateFin: m.dateFin,
      emissionCalculee: m.quantite * m.facteur,
      hypothese: m.hypothese,
      creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '',
      databaseSource: m.databaseSource
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

  supprimerEmission(id: number): void {
    this.listeEmissions = this.listeEmissions.filter(e => e.id !== id);
    this.sauvegarder();
    this.cdr.detectChanges();
  }

  /**
   * Persiste la saisie dans le stockage local.
   *
   * <p>L'export ERP compte des dizaines de milliers de lignes, bien au-delà des
   * quelques mégaoctets qu'accorde le navigateur. Sans ce garde, un import
   * complet échouerait en silence et la page se figerait sur une exception de
   * quota. L'utilisateur est averti et invité à restreindre le périmètre.</p>
   */
  private sauvegarder(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(this.listeEmissions));
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes). `
        + 'Les lignes restent affichées mais ne seront pas conservées à la fermeture : '
        + 'filtrez la base achats par usine ou par période avant import.';
      this.cdr.detectChanges();
    }
  }

  /** Renseigné quand le stockage local a refusé le volume importé. */
  avertissementStockage = '';

  // ---------- Import de la base achats ----------

  ouvrirModaleImport(): void {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importSuccesMsg = '';
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport(): void {
    this.modaleImportOuverte = false;
    this.cdr.detectChanges();
  }

  onFichierChange(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    this.fichierSelectionne = input.files?.[0] ?? null;
    this.importSuccesMsg = '';
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  telechargerGabarit(): void {
    // Colonnes reprises de l'export ERP, dans leurs intitulés d'origine.
    const exemple: Record<string, string | number> = {
      'Usine': this.usinesDisponibles[0]?.nom ?? 'MISFAT 1',
      'Nom du produit': 'Emballage MECAFILTER HABITACLE',
      'Catégorie Carbone': this.categoriesCarbone[0] ?? 'Other Paperboard Container Manufacturing',
      'Reçu (Q )': 8130,
      'Montant en TND': 3292.65,
      'Unité': 'pcs',
      'Devise': 'TND',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [20, 34, 44, 14, 16, 10, 10, 14, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Achats');
    XLSX.writeFile(classeur, 'gabarit-biens-services.xlsx');
  }

  /**
   * Lecture de l'export ERP.
   *
   * <p>Le facteur est résolu depuis la Catégorie Carbone, jamais lu du fichier.
   * Le mode de valorisation suit ce que documente le référentiel : une catégorie
   * dont le facteur est exprimé par dinar est valorisée sur le montant, celle
   * exprimée par pièce sur la quantité reçue.</p>
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
        const classeur = XLSX.read(lecteur.result, { type: 'array' });
        // L'export ERP place ses en-têtes en deuxième ligne, sous un titre.
        const feuille = classeur.Sheets['Sheet1'] ?? classeur.Sheets[classeur.SheetNames[0]];
        let lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        if (lignes.length && !this.contientColonne(lignes[0], 'Catégorie Carbone')) {
          lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null, range: 1 });
        }

        const ajoutees: EmissionAchat[] = [];
        const sansFacteur = new Set<string>();
        let ignorees = 0;

        lignes.forEach((ligne, index) => {
          const valeur = (cle: string) => {
            const trouve = Object.keys(ligne).find(k => this.normaliser(k) === this.normaliser(cle));
            return trouve ? ligne[trouve] : null;
          };

          const categorie = String(valeur('Catégorie Carbone') ?? '').trim();
          const etiquette = String(valeur('Nom du produit') ?? '').trim();
          const codeArticle = String(
            valeur('Code Article ERP') ?? valeur('Code Article') ?? valeur('Code article') ?? ''
          ).trim();
          const referenceLue = String(
            valeur('Référence Carbone') ?? valeur('Reference Carbone') ?? valeur('Référence') ?? ''
          ).trim();

          // La référence carbone prime : une ligne d'achat qui la porte désigne
          // son facteur, elle n'a pas à être devinée depuis son libellé.
          const apparie = this.apparier(referenceLue, codeArticle, categorie);
          if (!apparie) {
            sansFacteur.add(referenceLue || categorie || codeArticle || '(ligne sans repère)');
            return;
          }

          const { facteur, rapprochement } = apparie;
          const monetaire = facteur.dataType.toUpperCase() === 'MONETAIRE';

          const montant = Number(valeur('Montant en TND'));
          const recu = Number(valeur('Reçu (Q )') ?? valeur('Reçu Q'));
          const quantite = monetaire ? montant : recu;
          if (!Number.isFinite(quantite)) { ignorees++; return; }

          ajoutees.push({
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: 'Biens et services achetés',
            etablissement: String(valeur('Usine') ?? this.usinesDisponibles[0]?.nom ?? '').trim(),
            reference: facteur.referenceCode,
            categorieCarbone: facteur.typeName,
            codeArticle: codeArticle || undefined,
            rapprochement,
            etiquette,
            typeDonnee: monetaire ? 'Monetaire' : 'Physique',
            quantite,
            facteur: facteur.factorValue,
            unite: monetaire
              ? (String(valeur('Devise') ?? this.deviseActive).trim() || this.deviseActive)
              : (String(valeur('Unité') ?? facteur.unit).trim() || facteur.unit),
            dateDebut: this.texteDate(valeur('Date debut')),
            dateFin: this.texteDate(valeur('Date fin')),
            emissionCalculee: quantite * facteur.factorValue,
            hypothese: 'Réelle',
            creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '',
            databaseSource: facteur.databaseSource
          });
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.sauvegarder();

        this.importSuccesMsg = `${ajoutees.length} ligne(s) importée(s) sur ${lignes.length}.`;
        const details: string[] = [];
        if (sansFacteur.size) {
          details.push(`${sansFacteur.size} catégorie(s) sans facteur : ${[...sansFacteur].slice(0, 4).join(', ')}`);
        }
        if (ignorees) details.push(`${ignorees} ligne(s) sans catégorie ou sans montant exploitable`);
        this.importErreurMsg = details.join(' · ');
        this.cdr.detectChanges();
      } catch {
        this.importErreurMsg = 'Fichier illisible : vérifiez qu\'il s\'agit bien d\'un classeur .xlsx.';
        this.cdr.detectChanges();
      }
    };
    lecteur.readAsArrayBuffer(this.fichierSelectionne);
  }

  private contientColonne(ligne: Record<string, unknown>, cle: string): boolean {
    return Object.keys(ligne).some(k => this.normaliser(k) === this.normaliser(cle));
  }

  /** Excel renvoie soit un texte, soit un numéro de série de date. */
  private texteDate(valeur: unknown): string {
    if (valeur == null) return '';
    if (typeof valeur === 'number') {
      const date = XLSX.SSF.parse_date_code(valeur);
      if (date) {
        const mm = String(date.m).padStart(2, '0');
        const jj = String(date.d).padStart(2, '0');
        return `${date.y}-${mm}-${jj}`;
      }
    }
    return String(valeur).trim();
  }

  exporterExcel(): void {
    const donnees = this.emissionsFiltrees.map(e => ({
      'Usine': e.etablissement,
      'Reference': e.reference,
      'Categorie Carbone': e.categorieCarbone,
      'Etiquette': e.etiquette,
      'Type de donnees': e.typeDonnee,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Facteur': e.facteur,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Base appliquee': e.databaseSource ?? '',
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin,
      'Hypothese': e.hypothese
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Achats');
    XLSX.writeFile(classeur, `biens-services-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Les quatre indicateurs de tête de la catégorie.
   *
   * <p>Ils suivent les filtres : ce que l'écran montre est ce que les cartes
   * comptent, sans quoi le total démentirait le tableau.</p>
   */
  get kpisCategorie(): CarteKpi[] {
    const lignes = this.emissionsFiltrees as any[];
    const somme = (extrait: (e: any) => number) =>
      lignes.reduce((total, e) => total + (extrait(e) || 0), 0);

    const emissionsKg = somme(e => e.emissionCalculee);
    const couverture = tauxCouvertureReferentiel(lignes);

    return [
      {
        libelle: 'Volume acheté', icone: '📦', accent: 'volume',
        valeur: (somme(e => e.quantite)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: uniteDominante(this.listeEmissions.map(e => e.unite), 'unités')
      },
      {
        libelle: 'Total émissions', icone: '🌍', accent: 'emissions',
        valeur: (emissionsKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 }),
        unite: 'tCO₂e · ' + emissionsKg.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' kgCO₂e'
      },
      {
        libelle: 'Nombre de lignes', icone: '📄', accent: 'lignes',
        valeur: lignes.length.toLocaleString('fr-FR'),
        unite: 'saisie(s) au périmètre'
      },
      {
        libelle: 'Couverture MS SQL', icone: '🎯', accent: 'couverture',
        valeur: couverture.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %',
        unite: 'sinon repli ADEME',
        alerte: couverture < 80
      }
    ];
  }


  /**
   * Rejoue le filtrage après un changement de la barre de filtres.
   *
   * <p>Les listes filtrées sont des accesseurs : il suffit que le clic soit
   * capté pour que le tableau et les indicateurs se recalculent ensemble.</p>
   */
  onFiltreChange(): void {
  }


  /**
   * Lignes reçues de la ventilation d'un classeur comptable.
   *
   * <p>Elles s'affichent dans la grille au même titre que les saisies, mais
   * portent un identifiant négatif : la sauvegarde de l'écran ne les écrit
   * jamais dans son stockage, faute de quoi chaque import les dupliquerait.</p>
   */
  get lignesVentilees(): EmissionAchat[] {
    return lignesVentileesPour<EmissionAchat>(
      this.dispatchStore, 'biens-services', (ligne, rang) => adapterVersAchat(ligne, rang, this.usineVentilation) as unknown as EmissionAchat, this.usineVentilation
    );
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionAchat[] {
    return [...this.lignesVentilees, ...this.listeEmissions];
  }


  /**
   * Usine portée par les lignes ventilées.
   *
   * <p>L'usine du périmètre actif, à défaut la société : la colonne « Usine »
   * doit rester lisible, un libellé technique n'y apprendrait rien.</p>
   */
  get usineVentilation(): string {
    return this.usinesDisponibles[0]?.nom || this.societeActiveLabel || '';
  }

}
