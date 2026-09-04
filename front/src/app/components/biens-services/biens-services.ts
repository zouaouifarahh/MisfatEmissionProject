import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { marqueurEcran } from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersAchat } from '../../shared/dispatch/adaptateurs-mesure';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre
} from '../../shared/ui/perimetre-ecran';
import { periodeDeLExercice } from '../../shared/dispatch/exercice-de-ligne';
import {
  MesuresPageService, PageMesures, LigneImportBrute, ProgressionImport
} from '../../services/mesures-page.service';

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
  /**
   * Societe proprietaire de la mesure.
   *
   * <p>Seul rattachement certain : le nom d'usine est une donnee de
   * saisie, et plusieurs ecrans n'en demandent aucune. Les lignes
   * anterieures n'en portent pas, et restent affichees faute de
   * pouvoir dire a qui elles appartiennent.</p>
   */
  societeId?: number | null;
  creeLe: string;
  databaseSource?: string;
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
}

/** Catégorie GHG couverte : achats de biens et services. */
/**
 * Catégorie GHG couverte : biens et services achetés.
 *
 * <p>Le deux-points n'est pas décoratif. Sans lui, « Category 1 » capturait
 * aussi « Category 10 » à « Category 15 » : l'écran des achats se voyait offrir
 * 86 facteurs au lieu de 67, dont ceux des investissements, des franchises et
 * du traitement en fin de vie. Un rapprochement par catégorie pouvait alors
 * valoriser un achat avec le facteur d'une franchise.</p>
 */
const MOTIF_CATEGORIE = /^Category 1:/i;

const CLE_STOCKAGE = 'listeEmissionsAchats';

@Component({
  selector: 'app-biens-services',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
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
  private readonly mesuresPage = inject(MesuresPageService);

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

  /**
   * Avancement de l'import en cours, ou null hors import.
   *
   * <p>Un import long et muet se confond avec un import bloque : sur
   * trente-huit lots, l'utilisateur doit voir que quelque chose avance.</p>
   */
  progressionImport: ProgressionImport | null = null;

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
    // Le tableau lit la base ; le stockage du navigateur reste relu pour les
    // seules lignes d'avant la bascule. Elles ne sont plus affichées — la base
    // fait foi — mais la reprise d'appariement continue de les réparer, et les
    // effacer d'office perdrait une donnée que personne n'a demandé à perdre.
    // Un réimport les versera en base, et ce chargement deviendra sans objet.
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
      this.exerciceActif = filtre.year ?? null;
      this.majPerimetre();
      // La page vient de la base : un changement de perimetre la redemande.
      this.pageCourante = 1;
      this.chargerPage();
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
    const MARQUEUR = marqueurEcran('biens_services');
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

  /**
   * Filtre métier, aligné sur la liste déroulante de la saisie manuelle.
   *
   * <p>Chaque écran filtre selon ce qu'il documente : imposer une dimension
   * commune reviendrait à proposer un critère étranger à la moitié d'entre
   * eux.</p>
   */
  filtreMetier = 'Tous';

  /** Champs que la reprise en masse écrit sur chaque ligne de cet écran. */
  readonly champsMasse = {
    grandeur: 'quantite', facteur: 'facteur',
    emission: 'emissionCalculee', base: 'baseAppliquee'
  };

  /**
   * Prend acte d'une reprise en masse.
   *
   * <p>Seules les lignes saisies sont réécrites : les lignes ventilées
   * appartiennent au magasin de répartition, qui les recalcule à chaque
   * import.</p>
   */
  reprendreEnMasse(evenement: { avant: any[]; apres: any[] }): void {
    const reprises = new Map(evenement.avant.map((l, rang) => [l, evenement.apres[rang]]));

    // Les lignes saisies vivent ici ; celles issues de la ventilation
    // appartiennent au magasin, seul capable de les republier à tous ses
    // abonnés — tableau, indicateurs et bilan se mettent à jour ensemble.
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarder();

    const clesVentilees = evenement.avant
      .map((ligne: any) => ligne?.cleVentilation)
      .filter((cle: unknown): cle is string => typeof cle === 'string' && cle.length > 0);

    if (clesVentilees.length) {
      const facteur = Number(evenement.apres[0]?.facteur ?? 0);
      this.dispatchStore.reprendreFacteur(clesVentilees, facteur);
    }
  }

  /** Exercice consulte, impose au tableau comme au tableau de bord. */
  exerciceActif: number | null = null;

  /** Perimetre organisationnel que les lignes doivent respecter. */
  /** Perimetre consulte, ouvert au gabarit pour le panneau des mesures serveur. */
  get perimetreAffiche(): PerimetreOrganisation { return this.perimetreActif; }
  private get perimetreActif(): PerimetreOrganisation {
    return perimetreOrganisation(
      this.societeActiveId, this.usinesDisponibles.map(u => u.nom), this.filiales.length);
  }

  /** Tri du perimetre : ce qui est retenu, et ce qui est ecarte. */
  private get triPerimetre() {
    return trierParPerimetre(this.toutesLignes, this.exerciceActif, this.perimetreActif);
  }

  /** Lignes du perimetre consulte : societe ET exercice. */
  get lignesDuPerimetre() { return this.triPerimetre.retenues; }

  get emissionsFiltrees(): EmissionAchat[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.categorieCarbone !== this.filtreMetier) return false;
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
      societeId: this.societeActiveId,
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
      if (!enregistrerLignes(CLE_STOCKAGE, this.listeEmissions)) throw new Error('stockage refuse');
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
      // Les deux colonnes que l'importeur sait lire depuis la refonte de
      // l'appariement : sans elles, la ligne arrivait sans référence.
      'Référence Carbone': 'MS3C1PB',
      'Code Article ERP': 'ART-4417',
      'Catégorie Carbone': this.categoriesCarbone[0] ?? 'Other Paperboard Container Manufacturing',
      'Reçu (Q )': 8130,
      'Montant en TND': 3292.65,
      'Unité': 'pcs',
      'Devise': 'TND',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [20, 34, 20, 18, 44, 14, 16, 10, 10, 14, 14].map(w => ({ wch: w }));
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

        // Période de repli pour les lignes que le classeur ne date pas. Elle est
        // décidée ici, une fois, et inscrite sur chaque ligne : un repli calculé
        // à l'affichage ferait au contraire remonter la même ligne sur tous les
        // millésimes consultés.
        const periodeImport = periodeDeLExercice(this.exerciceActif);

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
            // La colonne de date prime ; à défaut, la ligne reçoit la période de
            // l'exercice consulté au moment de l'import. Sans ce repli, elle
            // n'avait aucune période et retombait sur sa date de création —
            // donc sur l'année de l'import. Un export d'achats 2025 versé en
            // 2026 devenait invisible pour qui consulte 2025, alors même que
            // l'import venait d'annoncer trente-sept mille lignes.
            dateDebut: this.texteDate(valeur('Date debut')) || periodeImport.dateDebut,
            dateFin: this.texteDate(valeur('Date fin')) || periodeImport.dateFin,
            emissionCalculee: quantite * facteur.factorValue,
            hypothese: 'Réelle',
            societeId: this.societeActiveId,
            creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '',
            databaseSource: facteur.databaseSource
          });
        });

        // Les lignes partent en base, non dans le stockage du navigateur : ce
        // dernier plafonne à quelques mégaoctets, et un export d'achats les
        // dépasse largement — l'import « réussissait » sans rien conserver, et
        // tout disparaissait au rafraîchissement suivant.
        const aVerser: LigneImportBrute[] = ajoutees.map((ligne, rang) => ({
          dateDocument: ligne.dateDebut || null,
          label: ligne.etiquette || ligne.categorieCarbone || 'Achat',
          rawAmount: ligne.quantite,
          rawCurrency: ligne.typeDonnee === 'Monetaire' ? ligne.unite : null,
          categoryCode: ligne.categorieCarbone || null,
          sourceCode: ligne.reference || null,
          filialeId: this.societeActiveId,
          unit: ligne.unite || null,
          sourceRowNumber: rang + 1
        }));

        const details: string[] = [];
        if (sansFacteur.size) {
          details.push(`${sansFacteur.size} catégorie(s) sans facteur : ${[...sansFacteur].slice(0, 4).join(', ')}`);
        }
        if (ignorees) details.push(`${ignorees} ligne(s) sans catégorie ou sans montant exploitable`);

        // Par lots : trente-sept mille lignes en une requête tiennent le serveur
        // plusieurs minutes dans une seule transaction, et la connexion expire
        // avant la réponse — l'import échoue alors sans qu'on sache ce qui a été
        // écrit. Découpé, chaque lot se valide seul.
        this.progressionImport = null;

        this.mesuresPage.importerParLots(aVerser).subscribe({
          next: avancement => {
            this.progressionImport = avancement;

            if (!avancement.termine) {
              this.cdr.detectChanges();
              return;
            }

            this.importSuccesMsg = `${avancement.importees.toLocaleString('fr-FR')} ligne(s) `
              + `enregistrée(s) en base sur ${lignes.length.toLocaleString('fr-FR')} lue(s).`;

            if (avancement.ecartees) {
              details.push(`${avancement.ecartees.toLocaleString('fr-FR')} ligne(s) refusée(s) `
                + `par le serveur` + (avancement.motifs ? ` : ${avancement.motifs.slice(0, 160)}` : ''));
            }
            this.importErreurMsg = details.join(' · ');

            // La base fait foi : le tableau se relit plutôt que de se deviner.
            this.pageCourante = 1;
            this.chargerPage();
            this.cdr.detectChanges();
          },
          error: () => {
            // Les lots déjà acceptés restent en base : le dire évite un second
            // import qui doublerait ce qui est passé.
            const acquis = this.progressionImport?.importees ?? 0;
            this.importSuccesMsg = '';
            this.importErreurMsg = 'Import interrompu : emission-service ne répond plus '
              + `(port 8082). ${acquis.toLocaleString('fr-FR')} ligne(s) sont déjà en base — `
              + 'reprenez à partir de là plutôt que de tout reverser.';
            this.progressionImport = null;
            this.cdr.detectChanges();
          }
        });
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
  /**
   * Indicateurs du haut d'écran, comptés par la base.
   *
   * <p>Ils se déduisaient des lignes affichées. Sur une page de cinquante
   * lignes tirées de cent onze mille, cela ne dit rien : les cartes montraient
   * le total d'un échantillon sous un libellé qui promettait le périmètre. Les
   * totaux viennent désormais de la même requête que la page, sur exactement
   * les mêmes critères — l'en-tête et le tableau ne peuvent plus se
   * contredire.</p>
   *
   * <p>La couverture référentielle, elle, reste calculée sur la page : elle
   * mesure une proportion, et une proportion se lit sur un échantillon. Son
   * libellé le dit.</p>
   */
  get kpisCategorie(): CarteKpi[] {
    const lignes = this.emissionsFiltrees as any[];
    const emissionsKg = this.pageServeur?.totalCo2eKg ?? 0;
    const couverture = tauxCouvertureReferentiel(lignes);

    return [
      {
        libelle: 'Volume acheté', icone: '📦', accent: 'volume',
        valeur: (this.pageServeur?.totalQuantite ?? 0)
          .toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: uniteDominante(this.lignesDeLaPage.map(e => e.unite), 'unités')
      },
      {
        libelle: 'Total émissions', icone: '🌍', accent: 'emissions',
        valeur: (emissionsKg / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 }),
        unite: 'tCO₂e · ' + emissionsKg.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' kgCO₂e'
      },
      {
        libelle: 'Nombre de lignes', icone: '📄', accent: 'lignes',
        valeur: this.lignesDuServeur.toLocaleString('fr-FR'),
        unite: 'mesure(s) en base au périmètre'
      },
      {
        libelle: 'Couverture MS SQL', icone: '🎯', accent: 'couverture',
        valeur: couverture.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %',
        unite: 'sinon repli ADEME',
        alerte: couverture < 80,
        // Cliquer la carte n'affiche que les lignes qu'elle signale : celles
        // qu'aucun facteur du référentiel n'adosse.
        filtreStatut: 'Fallback' as const
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
    // Un filtre resserré peut rendre la page courante vide : on revient au
    // début plutôt que d'afficher un tableau blanc sur une page qui n'existe
    // plus.
    this.pageCourante = 1;
  }

  // ---------- Pagination ----------

  /**
   * Tailles de page proposées.
   *
   * <p>Cet écran porte le plus gros volume de l'application — cent onze mille
   * lignes d'achats sur un exercice. Il les rendait toutes d'un coup : autant
   * de lignes de tableau dans le document, que le navigateur doit disposer,
   * peindre et garder en mémoire. La page se figeait avant d'avoir fini.</p>
   */
  readonly taillesPage = [20, 50, 100];
  taillePage = 50;
  pageCourante = 1;

  /** Page servie par la base : lignes, totaux du périmètre et découpage. */
  pageServeur: PageMesures | null = null;
  chargementPage = false;
  erreurPage = '';

  /**
   * Lignes de la page, ramenées à la forme que le tableau attend.
   *
   * <p>La base ne connaît pas la forme de cet écran : elle rend une mesure, pas
   * une ligne d'achat. L'adaptation est faite ici, en un seul endroit, plutôt
   * que d'imposer au gabarit de connaître deux formes.</p>
   */
  private get lignesDeLaPage(): EmissionAchat[] {
    return (this.pageServeur?.lignes ?? []).map(ligne => ({
      id: ligne.id,
      scope: 'SCOPE_3',
      categorie: 'Biens et services achetés',
      etablissement: '',
      reference: ligne.referenceCode ?? '',
      categorieCarbone: ligne.categoryName ?? '',
      etiquette: ligne.label,
      typeDonnee: (ligne.dataType ?? '').toUpperCase() === 'MONETAIRE' ? 'Monetaire' : 'Physique',
      quantite: Number(ligne.quantity) || 0,
      facteur: Number(ligne.factorValue) || 0,
      unite: ligne.unit || ligne.factorUnit || '',
      dateDebut: ligne.measureDate ?? '',
      dateFin: ligne.measureDate ?? '',
      emissionCalculee: Number(ligne.totalCo2e) || 0,
      hypothese: 'Réelle',
      societeId: ligne.filialeId,
      creeLe: '',
      databaseSource: ligne.databaseSource ?? '',
      sourceData: ligne.origin === 'EXCEL_IMPORT' ? 'Import Excel' : undefined
    } as EmissionAchat));
  }

  /**
   * Demande une page à la base, sur le périmètre consulté.
   *
   * <p>La recherche et les filtres métier restent appliqués côté navigateur, sur
   * la page reçue. Les porter au serveur demanderait autant de critères dans la
   * requête, et l'écran n'en a pas besoin pour tenir : cinquante lignes se
   * filtrent instantanément.</p>
   */
  chargerPage(): void {
    this.chargementPage = true;

    this.mesuresPage.pager({
      categorie: 'Category 1',
      annee: this.exerciceActif,
      filialeId: this.societeActiveId,
      page: Math.max(0, this.pageCourante - 1),
      taille: this.taillePage
    }).subscribe({
      next: page => {
        this.pageServeur = page;
        this.erreurPage = '';
        this.chargementPage = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.pageServeur = null;
        this.erreurPage = 'Mesures indisponibles : emission-service ne répond pas (port 8082).';
        this.chargementPage = false;
        this.cdr.detectChanges();
      }
    });
  }

  get nombrePages(): number {
    return Math.max(1, this.pageServeur?.totalPages ?? 1);
  }

  /** Lignes de la page courante, seules montées dans le document. */
  get emissionsPage(): EmissionAchat[] {
    return this.emissionsFiltrees;
  }

  /** Nombre de mesures du périmètre entier, non de la page. */
  get lignesDuServeur(): number {
    return this.pageServeur?.totalLignes ?? 0;
  }

  /**
   * Un filtre de l'écran restreint-il l'affichage sous le périmètre serveur ?
   *
   * <p>Les totaux du serveur décrivent la catégorie entière. Dès qu'un filtre
   * local trie parmi les lignes remontées, ils ne décrivent plus ce qui est à
   * l'écran : le pied doit alors compter ce qu'il montre, non ce qu'il ignore.</p>
   */
  get filtreLocalActif(): boolean {
    return this.rechercheTexte.trim() !== ''
      || this.filtreMetier !== 'Tous'
      || this.filtreProvenance !== 'Toutes'
      || this.filtreStatut !== 'Tous'
      || this.filtreEtablissement !== 'Tous';
  }

  /**
   * Lignes annoncées par le pied de tableau.
   *
   * <p>Sans filtre local, c'est le compte du périmètre entier — trente-huit
   * mille achats, non les cinquante de la page. Un pied qui annonçait « Total —
   * 50 ligne(s) » au-dessus d'une barre disant « sur 38 012 » se contredisait à
   * deux lignes d'intervalle.</p>
   */
  get lignesDuTotal(): number {
    return this.filtreLocalActif ? this.emissionsFiltrees.length : this.lignesDuServeur;
  }

  /** Émissions annoncées par le pied, en kgCO₂e — même règle que le compte. */
  get emissionsDuTotal(): number {
    if (this.filtreLocalActif) {
      return this.totalEmissions;
    }
    return this.pageServeur?.totalCo2eKg ?? this.totalEmissions;
  }

  get premierIndexPage(): number {
    return this.lignesDuServeur ? (this.pageCourante - 1) * this.taillePage + 1 : 0;
  }

  get dernierIndexPage(): number {
    return Math.min(this.pageCourante * this.taillePage, this.lignesDuServeur);
  }

  allerPage(page: number): void {
    this.pageCourante = Math.min(Math.max(1, page), this.nombrePages);
    this.chargerPage();
  }

  changerTaillePage(): void {
    this.pageCourante = 1;
    this.chargerPage();
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
  /**
   * Lignes affichées : la page servie par la base.
   *
   * <p>Elles venaient du stockage du navigateur. Le procédé convient à quelques
   * centaines de saisies ; il ne tient pas les cent onze mille lignes d'un
   * exercice d'achats — le quota est dépassé bien avant, l'import « réussit »
   * sans rien conserver, et tout disparaît au rafraîchissement suivant. La base
   * fait désormais foi : elle pagine, filtre et totalise sans effort ce que le
   * navigateur payait en mémoire.</p>
   *
   * <p>Les lignes de la ventilation comptable les précèdent. Elles ne sont pas
   * encore versées en base — elles attendent la validation de l'écran d'import
   * — mais les retirer d'ici les rendrait invisibles, et c'est précisément dans
   * ce tableau qu'on les corrige. Leur pastille de provenance les distingue.</p>
   */
  get toutesLignes(): EmissionAchat[] {
    return [...this.lignesVentilees, ...this.lignesDeLaPage];
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