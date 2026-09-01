import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef, inject } from '@angular/core';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmissionService, EmissionFactor } from '../../services/emission';
import { OrganizationService } from '../../services/organization.service';
import { EntityContextService } from '../../core/entity-context.service';
import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { marqueurEcran } from '../../core/appariement-referentiel';
import { Filiale } from '../../models/organization.model';
import * as XLSX from 'xlsx';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { ConfirmationService } from '../../shared/ui/confirmation.service';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersMesure } from '../../shared/dispatch/adaptateurs-mesure';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import {
  SourceDisponible, sourcesDuReferentiel, sourcesHorsReferentiel
} from '../../shared/ui/sources-emission';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre
} from '../../shared/ui/perimetre-ecran';
import { MesuresServeurComponent } from '../../shared/ui/mesures-serveur';

export interface ExtendedEmissionFactor extends EmissionFactor {
  referenceCode?: string;       // Ex: MS1COC, MS1COV, MS2ENDI
  nomFacteurDetaille?: string;
}

export interface Emission {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;           // Code de référence Carb (ex: MS1COC, MS1COV)
  /** Code article de l'ERP, lorsqu'il figure au fichier importé. */
  codeArticle?: string;
  /** Degré de certitude du rattachement au facteur. */
  rapprochement?: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE';
  emissionSource: string;      // Source d'émission
  typeDonnee: 'Physique' | 'Monetaire';
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
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

@Component({
  selector: 'app-combustion-vehicules',
  standalone: true,
  imports: [MesuresServeurComponent, FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './combustion-vehicules.html',
  styleUrl: './combustion-vehicules.css'
})
export class CombustionVehiculesComponent implements OnInit {

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
  private readonly confirmation = inject(ConfirmationService);

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';
  listeEmissions: Emission[] = [];
  filtreEtablissement: string = 'Tous';
  rechercheTexte: string = '';

  // Modale de saisie/édition
  modaleSaisieOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;

  // Modale d'importation Excel
  modaleImportOuverte = false;
  fichierSelectionne: File | null = null;
  importSuccesMsg = '';
  importErreurMsg = '';

  // Tri
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  /**
   * Usines proposées, restreintes à la société active de l'en-tête.
   *
   * <p>Alimentée par organization-service : une liste figée ne pouvait pas
   * suivre les sociétés créées depuis l'écran de gestion, ni distinguer les
   * usines tunisiennes des marocaines.</p>
   */
  etablissementsList: string[] = [];

  /** Devise de la société active, imposée aux saisies monétaires. */
  deviseActive = 'TND';
  societeActiveLabel = 'Groupe MISFAT';
  private filiales: Filiale[] = [];
  private societeActiveId: number | null = null;
  
  /**
   * Catégorie de l'écran, telle que le référentiel la nomme.
   *
   * <p>La base porte les deux nomenclatures pour ce poste : le libellé français
   * « Combustion des véhicules » et les intitulés anglais hérités de l'import
   * — « Company owned cars », « Company owned vehicles ». Ne retenir que l'une
   * des deux laisserait la moitié des facteurs hors du menu.</p>
   */
  private static readonly MOTIF_CATEGORIE =
    /combustion.*(vehicul|mobile)|mobile combustion|company owned (car|vehicle)/i;

  /**
   * Sources écrites dans le code, conservées en secours.
   *
   * <p>Elles ne filtrent plus la réponse du référentiel : l'écran interrogeait
   * la base puis <em>intersectait</em> sa réponse avec cette liste, si bien que
   * toute source nouvelle — celle qu'on venait de créer — était éliminée par la
   * liste qu'elle devait enrichir.</p>
   */
  private static readonly SOURCES_DE_SECOURS: string[] = [
    'Diesel medium and heavy duty truck',
    'Average diesel car',
    'Diesel'
  ];

  /** Sources documentées par le référentiel pour cette catégorie. */
  sourcesReferentiel: SourceDisponible[] = [];

  /** Sources qu'aucun facteur de la base ne documente : secours et lignes déjà saisies. */
  sourcesAutres: string[] = CombustionVehiculesComponent.SOURCES_DE_SECOURS.slice();

  /** Toutes les sources proposées, pour les filtres de tableau. */
  get sourcesEmissionList(): string[] {
    return [...this.sourcesReferentiel.map(source => source.nom), ...this.sourcesAutres];
  }

  unitesPhysiquesList = ['L', 'Km'];

  // Bases et facteurs dynamiques
  basesDisponibles: string[] = ['EPA 2024', 'UK_DEFRA', 'DESNZ 2024', 'MISFAT_INTERNE'];
  facteursDisponibles: ExtendedEmissionFactor[] = [];
  facteursFiltresParBase: ExtendedEmissionFactor[] = [];
  facteurSelectionne: ExtendedEmissionFactor | null = null;

  // Facteurs de secours alignés avec votre feuille Excel Données CO2
  baseFacteursSecours: ExtendedEmissionFactor[] = [
    { 
      id: 1, 
      referenceCode: 'MS1COC', 
      scope: 'SCOPE_1', 
      category: 'Company owned cars', 
      emissionSource: 'Diesel medium and heavy duty truck', 
      dataType: 'PHYSIQUE', 
      databaseSource: 'EPA 2024', 
      factorValue: 3.321, 
      unit: 'L', 
      referenceYear: 2024, 
      hasMargins: false, 
      nomFacteurDetaille: 'Diesel medium and heavy duty truck (Poids lourds / Camions)' 
    },
    { 
      id: 2, 
      referenceCode: 'MS1COV', 
      scope: 'SCOPE_1', 
      category: 'Company owned vehicles', 
      emissionSource: 'Average diesel car', 
      dataType: 'PHYSIQUE', 
      databaseSource: 'EPA 2024', 
      factorValue: 0.297, 
      unit: 'Km', 
      referenceYear: 2024, 
      hasMargins: false, 
      nomFacteurDetaille: 'Average diesel car (Voitures diesel moyennes)' 
    },
    { 
      id: 3, 
      referenceCode: 'MS2ENDI', 
      scope: 'SCOPE_1', 
      category: 'Energy', 
      emissionSource: 'Diesel', 
      dataType: 'PHYSIQUE', 
      databaseSource: 'IPCC 2019', 
      factorValue: 3.294, 
      unit: 'L', 
      referenceYear: 2019, 
      hasMargins: false, 
      nomFacteurDetaille: 'Diesel (Consommation carburant liquide)' 
    }
  ];

  formModel = {
    scope: 'SCOPE_1',
    categorie: 'Combustion des véhicules', 
    etablissement: '',
    reference: '',         
    emissionSource: '',    
    typeDonnee: 'Physique' as 'Physique' | 'Monetaire',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: 'L',
    dateDebut: '',
    dateFin: '',
    hypothese: 'Réelle' as 'Estimation' | 'Réelle',
    descriptionHypothese: '',
    databaseSource: ''
  };

  constructor(
    private datePipe: DatePipe,
    private emissionService: EmissionService,
    private organizationService: OrganizationService,
    private entityService: EntityContextService,
    private referentialService: ReferentialService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const donneesSauvegardees = localStorage.getItem('listeEmissionsVehicules');
      if (donneesSauvegardees) {
        this.listeEmissions = this.migrerVersKilogrammes(JSON.parse(donneesSauvegardees));
      }
    }

    // Les sources ne sont plus demandées séparément : elles se relèvent du
    // référentiel une fois qu'il est chargé, comme les facteurs eux-mêmes.
    this.chargerPerimetre();
    this.chargerReferentiel();
  }

  /**
   * Ramène les lignes déjà enregistrées en kilogrammes.
   *
   * <p>Jusqu'ici les deux chemins d'écriture — saisie et import — divisaient par
   * mille et stockaient donc des tonnes, sous une colonne libellée « kgCO₂e ».
   * Toutes les lignes du stockage sont dans cet état ; elles sont converties une
   * fois, et un marqueur empêche que la conversion se rejoue.</p>
   *
   * <p>La conversion est recalculée depuis la quantité et le facteur plutôt que
   * multipliée par mille : une ligne dont l'un des deux manque n'est pas touchée,
   * là où une multiplication aveugle aurait amplifié une donnée douteuse.</p>
   */
  private migrerVersKilogrammes(lignes: Emission[]): Emission[] {
    const CLE_MIGRATION = 'misfat_combustion_kg_v1';
    if (localStorage.getItem(CLE_MIGRATION) === 'fait') return lignes;

    const migrees = lignes.map(ligne => {
      const quantite = Number(ligne.quantite);
      const facteur = Number(ligne.facteur);
      if (!Number.isFinite(quantite) || !Number.isFinite(facteur)) return ligne;

      return { ...ligne, emissionCalculee: parseFloat((quantite * facteur).toFixed(4)) };
    });

    try {
      // La migration change les émissions déjà enregistrées : les vues qui les
      // agrègent doivent repartir des valeurs migrées.
      enregistrerLignes('listeEmissionsVehicules', migrees);
      localStorage.setItem(CLE_MIGRATION, 'fait');
    } catch (erreur) {
      console.error('[combustion] Migration en kilogrammes non persistée', erreur);
    }

    return migrees;
  }

  /** Facteurs MSSQL, chargés une fois puis filtrés localement par type de source. */
  private facteursReferentiel: FacteurDetaille[] = [];

  private chargerReferentiel(): void {
    this.referentialService.getFactorsByCategory(/.*/).subscribe({
      next: facteurs => {
        this.facteursReferentiel = facteurs;

        // Le menu des sources se relève de la base plutôt que du code.
        this.relegerLesSources();

        // Le référentiel complet est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau. `facteursDisponibles` ne conviendrait pas — il
        // est filtré sur la source choisie au formulaire, pas sur la base.
        this.remigrerParReferentiel();
        this.cdr.detectChanges();
      },
      error: () => console.warn('Référentiel carbone injoignable : bascule sur les facteurs de secours.')
    });
  }

  /** Remet la recherche et le filtre d'usine à leur état initial. */
  reinitialiserFiltres(): void {
    this.filtreProvenance = 'Toutes';
    this.filtreStatut = 'Tous';
    this.filtreEtablissement = 'Tous';
    this.rechercheTexte = '';
    this.cdr.detectChanges();
  }

  /** Exporte les lignes visibles, filtres appliqués. */
  exporterExcel(): void {
    const donnees = this.emissionsFiltrees.map(e => ({
      'Usine': e.etablissement,
      'Reference': e.reference,
      'Type / Source': e.emissionSource,
      'Base appliquee': e.databaseSource ?? '',
      'Type de donnees': e.typeDonnee,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Facteur': e.facteur,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin,
      'Hypothese': e.hypothese
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Combustion vehicules');
    XLSX.writeFile(classeur, `combustion-vehicules-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Total des émissions affichées, pour la ligne de pied de tableau. */
  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  /** Usines et devise suivent la société sélectionnée dans l'en-tête. */
  private chargerPerimetre(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = filiales;
        this.majPerimetre();
      },
      error: () => this.cdr.detectChanges()
    });

    this.entityService.filter$.subscribe(filtre => {
      this.societeActiveId = filtre.entityId;
      this.exerciceActif = filtre.year ?? null;
      this.majPerimetre();
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
    this.etablissementsList = (societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? [])).map(u => u.nom);

    // Une usine hors périmètre ne doit pas rester sélectionnée.
    if (this.filtreEtablissement !== 'Tous' && !this.etablissementsList.includes(this.filtreEtablissement)) {
      this.filtreEtablissement = 'Tous';
    }
    if (this.formModel.etablissement && !this.etablissementsList.includes(this.formModel.etablissement)) {
      this.formModel.etablissement = '';
    }
    if (this.formModel.typeDonnee === 'Monetaire') {
      this.formModel.unite = this.deviseActive;
    }
    this.cdr.detectChanges();
  }

  /**
   * Recompose les deux groupes de sources proposées à la saisie.
   *
   * <p>Le référentiel fait foi. L'appel qui vivait ici interrogeait bien la
   * base, mais n'en gardait que ce qui figurait déjà dans la liste écrite :
   * une source créée au référentiel ne pouvait donc jamais apparaître, et rien
   * à l'écran ne disait pourquoi.</p>
   *
   * <p>Les sources déjà employées par des lignes enregistrées rejoignent le
   * second groupe : sans elles, rouvrir une ancienne ligne la trouverait sans
   * source, le menu ne proposant plus la sienne.</p>
   */
  private relegerLesSources(): void {
    this.sourcesReferentiel = sourcesDuReferentiel(
      this.facteursReferentiel,
      nom => CombustionVehiculesComponent.MOTIF_CATEGORIE.test(nom)
        || CombustionVehiculesComponent.MOTIF_CATEGORIE.test(
          nom.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    );

    this.sourcesAutres = sourcesHorsReferentiel(
      CombustionVehiculesComponent.SOURCES_DE_SECOURS,
      this.listeEmissions.map(ligne => String(ligne.emissionSource ?? '')),
      this.sourcesReferentiel
    );
  }

  /**
   * Rattache une ligne de combustion à son facteur, par ordre de certitude.
   *
   * <p>Trois degrés : référence carbone exacte, code article de l'ERP, puis
   * libellé de source. Le référentiel de la base est interrogé en premier ; la
   * table de secours n'est consultée qu'ensuite, et jamais un facteur arbitraire
   * n'est inventé — une ligne sans correspondance est écartée et comptée.</p>
   *
   * @returns le facteur retenu et le degré qui l'a désigné, ou `null`.
   */
  private apparier(referenceCarbone: string, codeArticle: string, source: string):
    { facteur: ExtendedEmissionFactor;
      rapprochement: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE' } | null {

    // Le référentiel chargé depuis la base prime sur la table de secours.
    const gisements = [this.facteursDisponibles, this.baseFacteursSecours];

    for (const gisement of gisements) {
      if (referenceCarbone) {
        const cible = referenceCarbone.trim().toUpperCase();
        const exact = gisement.find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
        if (exact) return { facteur: exact, rapprochement: 'REFERENCE' };
      }

      if (codeArticle) {
        const cible = codeArticle.trim().toUpperCase();
        const parArticle = gisement.find(f =>
          (f.referenceCode ?? '').trim().toUpperCase() === cible);
        if (parArticle) return { facteur: parArticle, rapprochement: 'CODE_ARTICLE' };
      }

      if (source) {
        const cible = source.trim().toLowerCase();
        const parSource = gisement.find(f =>
          (f.emissionSource ?? '').trim().toLowerCase() === cible);
        if (parSource) return { facteur: parSource, rapprochement: 'CATEGORIE' };
      }
    }

    return null;
  }

  /**
   * Rejoue l'appariement sur les lignes de combustion déjà enregistrées.
   *
   * <p>Le rapprochement se fait sur le référentiel MSSQL complet, dans l'ordre
   * de certitude habituel : référence carbone, code article, puis libellé de
   * source. Une ligne qu'aucun degré ne rattache reste intacte — la migration
   * corrige, elle ne dévalorise pas.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('combustion');
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(MARQUEUR) === 'fait') return;
    if (!this.facteursReferentiel.length || !this.listeEmissions.length) return;

    let corrigees = 0;

    this.listeEmissions = this.listeEmissions.map(ligne => {
      const reference = (ligne.reference ?? '').trim().toUpperCase();
      const codeArticle = (ligne.codeArticle ?? '').trim().toUpperCase();
      const source = (ligne.emissionSource ?? '').trim().toLowerCase();

      const retenu =
        (reference && this.facteursReferentiel
          .find(f => (f.referenceCode ?? '').trim().toUpperCase() === reference))
        || (codeArticle && this.facteursReferentiel
          .find(f => (f.referenceCode ?? '').trim().toUpperCase() === codeArticle))
        || (source && this.facteursReferentiel
          .find(f => (f.typeName ?? '').trim().toLowerCase() === source));

      if (!retenu) return ligne;

      const rapprochement: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE' =
        reference && (retenu.referenceCode ?? '').trim().toUpperCase() === reference ? 'REFERENCE'
          : codeArticle && (retenu.referenceCode ?? '').trim().toUpperCase() === codeArticle
            ? 'CODE_ARTICLE' : 'CATEGORIE';

      const memeFacteur = Math.abs((ligne.facteur ?? 0) - retenu.factorValue) < 1e-9;
      const memeBase = (ligne.databaseSource ?? '') === (retenu.databaseSource ?? '');
      if (memeFacteur && memeBase && ligne.rapprochement === rapprochement) return ligne;

      corrigees++;
      return {
        ...ligne,
        reference: retenu.referenceCode ?? ligne.reference,
        facteur: retenu.factorValue,
        databaseSource: retenu.databaseSource,
        rapprochement,
        emissionCalculee: parseFloat(((ligne.quantite ?? 0) * retenu.factorValue).toFixed(4))
      };
    });

    if (corrigees) {
      this.sauvegarderDansLocalStorage();
      this.messageMigration = `${corrigees} ligne(s) ont été rapprochées à nouveau du `
        + `référentiel : facteur et base documentaire mis à jour.`;
    }

    try {
      localStorage.setItem(MARQUEUR, 'fait');
    } catch (erreur) {
      console.error('[combustion] Marqueur de migration non persisté', erreur);
    }
  }

  /** Compte rendu du re-rapprochement des lignes existantes, s'il a eu lieu. */
  messageMigration = '';

  /** Libellé du degré de rapprochement, pour le tableau. */
  libelleRapprochement(ligne: Emission): string {
    switch (ligne.rapprochement) {
      case 'REFERENCE': return 'Référence carbone';
      case 'CODE_ARTICLE': return 'Code article ERP';
      case 'CATEGORIE': return 'Libellé de source';
      default: return 'Saisie manuelle';
    }
  }

  sauvegarderDansLocalStorage() {
    if (isPlatformBrowser(this.platformId)) {
      // Persiste ET annonce : le tableau de bord relit ses totaux sans qu'on
      // ait à changer de filtre ou recharger la page.
      enregistrerLignes('listeEmissionsVehicules', this.listeEmissions);
    }
  }

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
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarderDansLocalStorage();

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
      this.societeActiveId, this.etablissementsList, this.filiales.length);
  }

  /** Tri du perimetre : ce qui est retenu, et ce qui est ecarte. */
  private get triPerimetre() {
    return trierParPerimetre(this.toutesLignes, this.exerciceActif, this.perimetreActif);
  }

  /** Lignes du perimetre consulte : societe ET exercice. */
  get lignesDuPerimetre() { return this.triPerimetre.retenues; }

  get emissionsFiltrees(): Emission[] {
    let list = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.emissionSource !== this.filtreMetier) return false;
      if (!provenanceRetenue(item, this.filtreProvenance)) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      const correspondEtab = this.filtreEtablissement === 'Tous' || item.etablissement === this.filtreEtablissement;
      const termeRecherche = this.rechercheTexte.trim().toLowerCase();
      
      const correspondRecherche = !termeRecherche || 
        (item.emissionSource && item.emissionSource.toLowerCase().includes(termeRecherche)) ||
        (item.etablissement && item.etablissement.toLowerCase().includes(termeRecherche)) ||
        (item.reference && item.reference.toLowerCase().includes(termeRecherche));

      return correspondEtab && correspondRecherche;
    });

    if (this.sortColumn) {
      list.sort((a, b) => {
        if (this.sortColumn === 'emissions') {
          return this.sortDirection === 'asc' ? a.emissionCalculee - b.emissionCalculee : b.emissionCalculee - a.emissionCalculee;
        }
        if (this.sortColumn === 'periode') {
          const dateA = new Date(a.dateDebut).getTime();
          const dateB = new Date(b.dateDebut).getTime();
          return this.sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }
        if (this.sortColumn === 'reference') {
          const refA = a.reference || '';
          const refB = b.reference || '';
          return this.sortDirection === 'asc' ? refA.localeCompare(refB) : refB.localeCompare(refA);
        }
        return 0;
      });
    }

    return list;
  }

  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc'; 
    }
    this.cdr.detectChanges();
  }

  ouvrirModale(emission?: Emission) {
    this.facteursDisponibles = [];
    this.facteursFiltresParBase = [];
    this.facteurSelectionne = null;
    this.erreurFormulaire = false;

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope || 'SCOPE_1',
        categorie: 'Combustion des véhicules',
        etablissement: emission.etablissement || '',
        reference: emission.reference || '',
        emissionSource: emission.emissionSource || '',
        typeDonnee: emission.typeDonnee || 'Physique',
        quantite: emission.quantite !== undefined ? emission.quantite : null,
        facteur: emission.facteur !== undefined ? emission.facteur : null,
        unite: emission.unite || 'L',
        dateDebut: emission.dateDebut || '',
        dateFin: emission.dateFin || '',
        hypothese: emission.hypothese || 'Réelle',
        descriptionHypothese: emission.descriptionHypothese || '',
        databaseSource: emission.databaseSource || ''
      };
      
      this.onSourceChange();
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_1',
        categorie: 'Combustion des véhicules',
        etablissement: '',
        reference: '',
        emissionSource: '',
        typeDonnee: 'Physique',
        quantite: null,
        facteur: null,
        unite: 'L',
        dateDebut: '',
        dateFin: '',
        hypothese: 'Réelle',
        descriptionHypothese: '',
        databaseSource: ''
      };
    }
    
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale() {
    this.modaleSaisieOuverte = false;
    this.erreurFormulaire = false;
    this.cdr.detectChanges();
  }

  changerTypeDonnee(type: 'Physique' | 'Monetaire') {
    this.formModel.typeDonnee = type;
    if (type === 'Monetaire') {
      this.formModel.unite = this.deviseActive;
    } else {
      this.appliquerUniteAutoParSource();
    }
    this.onSourceChange();
  }

  // Auto-affectation automatique de l'unité selon la source sélectionnée
  private appliquerUniteAutoParSource() {
    if (this.formModel.typeDonnee === 'Monetaire') {
      this.formModel.unite = this.deviseActive;
      return;
    }

    const mappingUnites: { [key: string]: string } = {
      'Diesel medium and heavy duty truck': 'L',
      'Average diesel car': 'Km',
      'Diesel': 'L'
    };

    if (this.formModel.emissionSource && mappingUnites[this.formModel.emissionSource]) {
      this.formModel.unite = mappingUnites[this.formModel.emissionSource];
    }
  }

  onSourceChange() {
    if (!this.formModel.emissionSource) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.facteursDisponibles = [];
      this.facteursFiltresParBase = [];
      this.facteurSelectionne = null;
      this.cdr.detectChanges();
      return;
    }

    // Force l'unité correcte
    this.appliquerUniteAutoParSource();

    const typeSQL = this.formModel.typeDonnee === 'Physique' ? 'PHYSIQUE' : 'MONETAIRE';

    // Résolution sur l'index MSSQL, indexé par type de source.
    //
    // La recherche par catégorie ne pouvait pas aboutir : l'écran raisonne en
    // libellés français (« Combustion des véhicules ») quand la base stocke les
    // intitulés GHG anglais (« Company owned vehicles »). Elle renvoyait donc
    // systématiquement une liste vide, et la colonne « Base appliquée »
    // affichait les sources de secours au lieu de celles de MSSQL.
    const depuisBase = this.facteursReferentiel.filter(f =>
      f.typeName.toLowerCase() === this.formModel.emissionSource.toLowerCase()
      && f.dataType.toUpperCase() === typeSQL);

    if (depuisBase.length > 0) {
      this.facteursDisponibles = depuisBase.map(f => ({
        id: f.id,
        referenceCode: f.referenceCode,
        scope: f.scopeCode ?? 'SCOPE_1',
        category: f.categoryName,
        emissionSource: f.typeName,
        dataType: f.dataType,
        databaseSource: f.databaseSource,
        factorValue: f.factorValue,
        unit: f.unit,
        referenceYear: f.referenceYear ?? new Date().getFullYear(),
        hasMargins: false,
        nomFacteurDetaille: `${f.typeName} — ${f.databaseSource}`
      }));
    } else {
      this.chargerFacteursSecours(this.formModel.emissionSource, typeSQL);
    }

    this.basesDisponibles = [...new Set(this.facteursDisponibles.map(f => f.databaseSource))]
      .filter((b): b is string => !!b)
      .sort();

    this.mettreAJourReferenceEtFacteurs();
  }

  private mettreAJourReferenceEtFacteurs() {
    this.onBaseChange();
    this.autoSelectionnerFacteurParDefaut();
    this.cdr.detectChanges();
  }

  chargerFacteursSecours(source: string, typeSQL: string) {
    this.facteursDisponibles = this.baseFacteursSecours.filter(f => 
      f.emissionSource.toLowerCase() === source.toLowerCase() &&
      f.dataType.toUpperCase() === typeSQL.toUpperCase()
    );
  }

  onBaseChange() {
    if (this.formModel.databaseSource) {
      this.facteursFiltresParBase = this.facteursDisponibles.filter(
        f => f.databaseSource === this.formModel.databaseSource
      );
    } else {
      this.facteursFiltresParBase = [...this.facteursDisponibles];
    }

    if (this.facteursFiltresParBase.length > 0) {
      this.choisirFacteur(this.facteursFiltresParBase[0]);
    } else {
      this.choisirFacteur(null);
    }
    this.cdr.detectChanges();
  }

  autoSelectionnerFacteurParDefaut() {
    if (this.formModel.databaseSource) {
      const trouve = this.facteursDisponibles.find(f => f.databaseSource === this.formModel.databaseSource);
      if (trouve) {
        this.choisirFacteur(trouve);
        return;
      }
    }
    const premierFacteur = this.facteursDisponibles[0] || null;
    this.choisirFacteur(premierFacteur);
  }

  choisirFacteur(facteur: ExtendedEmissionFactor | null) {
    this.facteurSelectionne = facteur;
    
    if (facteur) {
      this.formModel.facteur = facteur.factorValue;
      this.formModel.databaseSource = facteur.databaseSource || '';
      
      if (this.formModel.typeDonnee === 'Physique' && facteur.unit) {
        this.formModel.unite = facteur.unit;
      }

      if (facteur.referenceCode) {
        this.formModel.reference = facteur.referenceCode;
      }
    } else {
      this.formModel.facteur = null;
    }
    
    this.cdr.detectChanges();
  }

  /**
   * Aperçu de l'émission de la saisie en cours, en kgCO₂e.
   *
   * <p>L'aperçu montre la valeur qui sera réellement enregistrée : l'afficher
   * en tonnes pendant qu'on stocke des kilogrammes laissait l'utilisateur
   * vérifier un chiffre différent de celui qui entrait au bilan.</p>
   */
  obtenirCalculApercu(factorValue: number | null): string {
    if (!this.formModel.quantite || this.formModel.quantite <= 0 || !factorValue) {
      return '0.0000';
    }
    const totalKg = this.formModel.quantite * factorValue;
    return totalKg.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  enregistrerEmission() {
    if (
      !this.formModel.etablissement || 
      !this.formModel.emissionSource || 
      !this.formModel.quantite || 
      !this.formModel.facteur ||
      !this.formModel.dateDebut ||
      !this.formModel.dateFin
    ) {
      this.erreurFormulaire = true;
      const modalBody = document.querySelector('.modal-body');
      if (modalBody) {
        modalBody.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.cdr.detectChanges();
      return;
    }

    this.erreurFormulaire = false;

    const qte = this.formModel.quantite || 0;
    const fact = this.formModel.facteur || 0;

    // Le facteur du référentiel est en kgCO₂e par unité : le produit est donc
    // déjà en kilogrammes. Diviser par mille ici stockait des tonnes sous une
    // colonne libellée « kgCO₂e », et le tableau de bord — qui somme des
    // kilogrammes — sous-comptait cette catégorie d'un facteur mille.
    const calcul = parseFloat((qte * fact).toFixed(4));

    if (this.isEdition && this.idEditionActive !== null) {
      this.listeEmissions = this.listeEmissions.map(item => {
        if (item.id === this.idEditionActive) {
          return {
            ...item,
            etablissement: this.formModel.etablissement,
            reference: this.formModel.reference,
            emissionSource: this.formModel.emissionSource,
            typeDonnee: this.formModel.typeDonnee,
            quantite: qte,
            facteur: fact,
            unite: this.formModel.unite,
            dateDebut: this.formModel.dateDebut,
            dateFin: this.formModel.dateFin,
            emissionCalculee: calcul,
            hypothese: this.formModel.hypothese,
            descriptionHypothese: this.formModel.descriptionHypothese,
            databaseSource: this.formModel.databaseSource
          };
        }
        return item;
      });
    } else {
      const nouvelleEmission: Emission = {
        id: Date.now(),
        scope: this.formModel.scope,
        categorie: this.formModel.categorie,
        etablissement: this.formModel.etablissement,
        reference: this.formModel.reference,
        emissionSource: this.formModel.emissionSource,
        typeDonnee: this.formModel.typeDonnee,
        quantite: qte,
        facteur: fact,
        unite: this.formModel.unite,
        dateDebut: this.formModel.dateDebut,
        dateFin: this.formModel.dateFin,
        emissionCalculee: calcul,
        hypothese: this.formModel.hypothese,
        descriptionHypothese: this.formModel.descriptionHypothese,
        societeId: this.societeActiveId,
        creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy') || '',
        databaseSource: this.formModel.databaseSource
      };
      this.listeEmissions.unshift(nouvelleEmission);
    }

    this.sauvegarderDansLocalStorage();
    this.fermerModale();
  }

  async supprimerEmission(id: number): Promise<void> {
    const confirme = await this.confirmation.demander({
      titre: 'Confirmation de suppression',
      message: 'Voulez-vous vraiment supprimer cette ligne ? Cette action est irréversible '
        + 'et retirera les calculs associés.',
      consequences: ['Les émissions de cette ligne sortent du total de la catégorie.']
    });

    if (confirme) {
      this.listeEmissions = this.listeEmissions.filter(item => item.id !== id);
      this.sauvegarderDansLocalStorage();
      this.cdr.detectChanges();
    }
  }

  selectionnerHypothese(valeur: 'Estimation' | 'Réelle') {
    this.formModel.hypothese = valeur;
    this.cdr.detectChanges();
  }

  // --- MODALE IMPORT EXCEL ---
  ouvrirModaleImport() {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importSuccesMsg = '';
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport() {
    this.modaleImportOuverte = false;
    this.fichierSelectionne = null;
    this.importSuccesMsg = '';
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  telechargerModeleExcel() {
    const dataExemple = [
      {
        'Référence Carbone': 'MS1COC',
        'Code Article ERP': 'VEH-0042',
        'Type': 'Diesel medium and heavy duty truck',
        'Établissement': 'Misfat 1',
        'Type Donnee': 'Physique',
        'Quantité': 850,
        'Unité': 'L',
        'Base de données': 'EPA 2024',
        'Date Début': '2026-01-01',
        'Date Fin': '2026-01-31',
        'Hypothèse': 'Réelle',
        'Description': 'Flotte camions lourds - Janvier'
      },
      {
        'Référence Carb': 'MS1COV',
        'Type': 'Average diesel car',
        'Établissement': 'Misfat 2',
        'Type Donnee': 'Physique',
        'Quantité': 1400,
        'Unité': 'Km',
        'Base de données': 'EPA 2024',
        'Date Début': '2026-01-01',
        'Date Fin': '2026-01-31',
        'Hypothèse': 'Estimation',
        'Description': 'Véhicules légers commerciaux'
      }
    ];

    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(dataExemple);

    worksheet['!cols'] = [
      { wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 15 },
      { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
      { wch: 14 }, { wch: 15 }, { wch: 35 }
    ];

    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Flotte_Vehicules');
    XLSX.writeFile(workbook, 'Modele_Import_Combustion_Vehicules.xlsx');
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.fichierSelectionne = event.dataTransfer.files[0];
      this.cdr.detectChanges();
    }
  }

  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.fichierSelectionne = target.files[0];
      this.cdr.detectChanges();
    }
  }

  traiterFichierExcel() {
    if (!this.fichierSelectionne) {
      this.importErreurMsg = 'Veuillez sélectionner un fichier Excel.';
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (rows.length === 0) {
          this.importErreurMsg = 'Le fichier Excel est vide.';
          this.cdr.detectChanges();
          return;
        }

        let nbImportes = 0;
        let sansFacteur = 0;

        rows.forEach(ligne => {
          const source = ligne['Type'] || ligne['Carburant / Source'] || '';
          const ref = ligne['Référence Carbone'] || ligne['Référence Carb']
            || ligne['Référence'] || '';
          const codeArticle = String(
            ligne['Code Article ERP'] ?? ligne['Code Article'] ?? ligne['Code article'] ?? ''
          ).trim();
          const qte = Number(ligne['Quantité']) || 0;

          // Rapprochement à trois degrés, sur le référentiel de la base d'abord.
          const apparie = this.apparier(String(ref).trim(), codeArticle, String(source).trim());

          // Une ligne sans facteur n'est plus valorisée à 1 : un facteur inventé
          // produit un chiffre qui a l'air d'un résultat. Elle est écartée et
          // comptée, pour que l'utilisateur sache ce qui manque.
          if (!apparie) { sansFacteur++; return; }

          const facteurTrouve = apparie.facteur;
          const factVal = facteurTrouve.factorValue;
          // Quantité × facteur donne des kgCO₂e : le facteur du référentiel est
          // exprimé au kilogramme par unité (litre, kWh, dinar).
          const calcul = parseFloat((qte * factVal).toFixed(4));

          if (source && qte > 0) {
            const nouvelle: Emission = {
              id: Date.now() + Math.random(),
              scope: 'SCOPE_1',
              categorie: 'Combustion des véhicules',
              etablissement: ligne['Établissement'] || 'Misfat 1',
              reference: facteurTrouve.referenceCode || String(ref).trim(),
              codeArticle: codeArticle || undefined,
              rapprochement: apparie.rapprochement,
              emissionSource: source,
              typeDonnee: ligne['Type Donnee'] === 'Monetaire' ? 'Monetaire' : 'Physique',
              quantite: qte,
              facteur: factVal,
              unite: ligne['Unité'] || facteurTrouve?.unit || 'L',
              dateDebut: ligne['Date Début'] || '2026-01-01',
              dateFin: ligne['Date Fin'] || '2026-01-31',
              emissionCalculee: calcul,
              hypothese: ligne['Hypothèse'] === 'Estimation' ? 'Estimation' : 'Réelle',
              descriptionHypothese: ligne['Description'] || '',
              societeId: this.societeActiveId,
              creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy') || '',
              databaseSource: ligne['Base de données'] || 'EPA 2024'
            };
            this.listeEmissions.unshift(nouvelle);
            nbImportes++;
          }
        });

        this.sauvegarderDansLocalStorage();
        // Les lignes écartées sont annoncées : une importation silencieusement
        // partielle laisserait croire que tout le fichier est au bilan.
        this.importSuccesMsg = sansFacteur
          ? `${nbImportes} ligne(s) importée(s). ${sansFacteur} ligne(s) écartée(s) : `
            + `aucune référence carbone, aucun code article ni aucune source ne correspond `
            + `au référentiel.`
          : `${nbImportes} ligne(s) importée(s) avec succès !`;
        this.importErreurMsg = '';
        setTimeout(() => this.fermerModaleImport(), 1500);

      } catch (err) {
        this.importErreurMsg = 'Erreur lors de la lecture du fichier Excel.';
      }
      this.cdr.detectChanges();
    };

    fileReader.readAsBinaryString(this.fichierSelectionne);
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
        libelle: 'Carburant consommé', icone: '⛽', accent: 'volume',
        valeur: (somme(e => e.quantite)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: uniteDominante(this.listeEmissions.map(e => e.unite), 'L')
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
  }


  /**
   * Lignes reçues de la ventilation d'un classeur comptable.
   *
   * <p>Elles s'affichent dans la grille au même titre que les saisies, mais
   * portent un identifiant négatif : la sauvegarde de l'écran ne les écrit
   * jamais dans son stockage, faute de quoi chaque import les dupliquerait.</p>
   */
  get lignesVentilees(): Emission[] {
    return lignesVentileesPour<Emission>(
      this.dispatchStore, 'combustion-vehicules', (ligne, rang) => adapterVersMesure(ligne, rang, 'Combustion des véhicules', this.usineVentilation) as Emission, this.usineVentilation
    );
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): Emission[] {
    return [...this.lignesVentilees, ...this.listeEmissions];
  }


  /**
   * Usine portée par les lignes ventilées.
   *
   * <p>L'usine du périmètre actif, à défaut la société : la colonne « Usine »
   * doit rester lisible, un libellé technique n'y apprendrait rien.</p>
   */
  get usineVentilation(): string {
    return this.etablissementsList[0] || this.societeActiveLabel || '';
  }

}