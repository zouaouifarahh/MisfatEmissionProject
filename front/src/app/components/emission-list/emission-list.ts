import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef, inject } from '@angular/core';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { ENTETE_REFERENCE, ENTETE_CODE_ARTICLE } from '../../core/colonnes-identite';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmissionService, EmissionFactor } from '../../services/emission';
import { OrganizationService } from '../../services/organization.service';
import { EntityContextService } from '../../core/entity-context.service';
import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import {
  marqueurEcran, Rapprochement, libelleRapprochement
} from '../../core/appariement-referentiel';
import { Filiale } from '../../models/organization.model';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { ConfirmationService } from '../../shared/ui/confirmation.service';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersMesure } from '../../shared/dispatch/adaptateurs-mesure';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';

// Extension locale de l'interface pour autoriser la propriété nomFacteurDetaille et referenceCode
export interface ExtendedEmissionFactor extends EmissionFactor {
  referenceCode?: string;
  nomFacteurDetaille?: string;
}

export interface Emission {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;          // Code de référence Carb (ex: MS1COC, MS1COV, MS1GZ...)
  /**
   * Compte comptable ou code article de l'ERP.
   *
   * <p>Il portait auparavant dans {@link reference} : la colonne « Référence »
   * affichait donc 602100, un numéro de compte qui ne documente aucun facteur.
   * Les deux identifiants ont désormais chacun leur colonne.</p>
   */
  codeArticle?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
  emissionSource: string;     // Source d'émission (ex: Gazole/Fioul, Gaz naturel...)
  typeDonnee: 'Physique' | 'Monetaire';
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
  descriptionHypothese?: string;
  creeLe: string;
  databaseSource?: string; 
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
}

@Component({
  selector: 'app-emission-list',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './emission-list.html',
  styleUrl: './emission-list.css'
})
export class EmissionListComponent implements OnInit {

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

  // Variables pour la modale d'ajout / édition manuelle
  modaleSaisieOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;

  // Variables pour la modale d'importation Excel
  modaleImportOuverte = false;
  fichierSelectionne: File | null = null;
  importSuccesMsg = '';
  importErreurMsg = '';

  // États pour le tri
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
  
  // Liste des sources d'émissions pour Combustion dans les établissements (Installations fixes)
   sourcesList: string[] = [
  'Gaz naturel',
  'Gazole/Fioul',
  'Fioul lourd',
  'Essence automobile',
  'Propane',
  'Butane',
  'Charbon / Lignite',
  'Biomasse / Bois'
];

  // Liste des unités physiques autorisées
  unitesPhysiquesList = ['L', 'T', 'Kg', 'kWh'];

  // Tableaux de gestion des facteurs d'émission dynamiques typés
  facteursDisponibles: ExtendedEmissionFactor[] = [];
  basesDisponibles: string[] = [];
  facteursFiltresParBase: ExtendedEmissionFactor[] = [];
  facteurSelectionne: ExtendedEmissionFactor | null = null;

  // Base de secours locale mise à jour et typée
  baseFacteursSecours: ExtendedEmissionFactor[] = [
    { id: 1, referenceCode: 'MS1GZ', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gazole/Fioul', dataType: 'PHYSIQUE', databaseSource: 'Base Carbone (Interne)', factorValue: 3.24, unit: 'L', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Gazole - Moyen national' },
    { id: 2, referenceCode: 'MS1GZ', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gazole/Fioul', dataType: 'PHYSIQUE', databaseSource: 'DEFRA', factorValue: 2.51, unit: 'L', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Diesel (Average biofuel blend)' },
    { id: 3, referenceCode: 'MS1GZ', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gazole/Fioul', dataType: 'PHYSIQUE', databaseSource: 'Ecoinvent', factorValue: 3.12, unit: 'L', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Gazole combustion stationnaire' },
    { id: 4, referenceCode: 'MS1GZ', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gazole/Fioul', dataType: 'MONETAIRE', databaseSource: 'Base Carbone (Interne)', factorValue: 1.85, unit: 'TND', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Achat de Fioul domestique (Ratio monétaire)' },
    
    { id: 5, referenceCode: 'MS1ESS', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Essence automobile', dataType: 'PHYSIQUE', databaseSource: 'Ecoinvent', factorValue: 2.28, unit: 'L', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Essence - Combustion Europe' },
    { id: 6, referenceCode: 'MS1ESS', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Essence automobile', dataType: 'PHYSIQUE', databaseSource: 'Base Carbone (Interne)', factorValue: 2.58, unit: 'L', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Essence sans plomb 95' },
    { id: 7, referenceCode: 'MS1ESS', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Essence automobile', dataType: 'MONETAIRE', databaseSource: 'Base Carbone (Interne)', factorValue: 1.45, unit: 'TND', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Carburants SP (Ratio monétaire)' },

    { id: 8, referenceCode: 'MS1GN', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gaz naturel', dataType: 'PHYSIQUE', databaseSource: 'Base Carbone (Interne)', factorValue: 0.204, unit: 'kWh', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Gaz naturel réseau (PCS)' },
    { id: 9, referenceCode: 'MS1GN', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Gaz naturel', dataType: 'MONETAIRE', databaseSource: 'Base Carbone (Interne)', factorValue: 1.12, unit: 'TND', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Achat Gaz naturel (Ratio monétaire)' },

    { id: 10, referenceCode: 'MS1FL', scope: 'SCOPE_1', category: 'Combustion dans les établissements', emissionSource: 'Fioul lourd', dataType: 'PHYSIQUE', databaseSource: 'Base Carbone (Interne)', factorValue: 3.15, unit: 'Kg', referenceYear: 2026, hasMargins: false, nomFacteurDetaille: 'Fioul lourd industriel' }
  ];

  formModel = {
    scope: 'SCOPE_1',
    categorie: 'Combustion dans les établissements', 
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
      const donneesSauvegardees = localStorage.getItem('listeEmissions');
      if (donneesSauvegardees) {
        try {
          this.listeEmissions = this.migrerVersKilogrammes(JSON.parse(donneesSauvegardees));
        } catch (e) {
          console.error('Erreur lors du chargement du localStorage:', e);
          this.listeEmissions = [];
        }
      }
    }

    this.chargerPerimetre();
    this.chargerReferentiel();
  }

  /** Facteurs MSSQL, chargés une fois puis filtrés localement par type de source. */
  private facteursReferentiel: FacteurDetaille[] = [];

  /** Compte rendu du re-rapprochement des lignes existantes, s'il a eu lieu. */
  messageMigration = '';

  /**
   * Rejoue l'appariement sur les lignes de combustion fixe déjà enregistrées.
   *
   * <p>Trois degrés de certitude : référence carbone exacte, code article de
   * l'ERP, puis libellé de source. Une ligne qu'aucun degré ne rattache reste
   * intacte — la migration corrige, elle ne dévalorise pas.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('combustion_etab');
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(MARQUEUR) === 'fait') return;
    if (!this.facteursReferentiel.length || !this.listeEmissions.length) return;

    let corrigees = 0;

    this.listeEmissions = this.listeEmissions.map((ligne: any) => {
      const reference = String(ligne.reference ?? '').trim().toUpperCase();
      const codeArticle = String(ligne.codeArticle ?? '').trim().toUpperCase();
      const source = String(ligne.emissionSource ?? '').trim().toLowerCase();

      const retenu =
        (reference && this.facteursReferentiel
          .find(f => (f.referenceCode ?? '').trim().toUpperCase() === reference))
        || (codeArticle && this.facteursReferentiel
          .find(f => (f.referenceCode ?? '').trim().toUpperCase() === codeArticle))
        || (source && this.facteursReferentiel
          .find(f => (f.typeName ?? '').trim().toLowerCase() === source));

      if (!retenu) return ligne;

      const rapprochement =
        reference && (retenu.referenceCode ?? '').trim().toUpperCase() === reference ? 'REFERENCE'
          : codeArticle && (retenu.referenceCode ?? '').trim().toUpperCase() === codeArticle
            ? 'CODE_ARTICLE' : 'CATEGORIE';

      const memeFacteur = Math.abs((Number(ligne.facteur) || 0) - retenu.factorValue) < 1e-9;
      const memeBase = (ligne.databaseSource ?? '') === (retenu.databaseSource ?? '');
      if (memeFacteur && memeBase && ligne.rapprochement === rapprochement) return ligne;

      corrigees++;
      return {
        ...ligne,
        reference: retenu.referenceCode ?? ligne.reference,
        facteur: retenu.factorValue,
        databaseSource: retenu.databaseSource,
        rapprochement,
        emissionCalculee: parseFloat(((Number(ligne.quantite) || 0) * retenu.factorValue).toFixed(4))
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
      console.error('[combustion-établissements] Marqueur de migration non persisté', erreur);
    }
  }

  private chargerReferentiel(): void {
    this.referentialService.getFactorsByCategory(/.*/).subscribe({
      next: facteurs => {
        this.facteursReferentiel = facteurs;

        // Le référentiel est là : les lignes déjà saisies sont rapprochées
        // à nouveau, une seule fois.
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

  /**
   * Exporte les lignes visibles, filtres appliqués.
   *
   * <p>XLSX est chargé à la demande, comme le reste du composant : la
   * librairie pèse lourd et n'est utile qu'au clic.</p>
   */
  async exporterExcel(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const XLSX = await import('xlsx');

    const donnees = this.emissionsFiltrees.map(e => ({
      'Etablissement': e.etablissement,
      'Reference': e.reference,
      'Source de combustion': e.emissionSource,
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
    XLSX.utils.book_append_sheet(classeur, feuille, 'Combustion usines');
    XLSX.writeFile(classeur, `combustion-usines-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  sauvegarderDansLocalStorage() {
    if (isPlatformBrowser(this.platformId)) {
      // Persiste ET annonce : le tableau de bord relit ses totaux sans qu'on
      // ait à changer de filtre ou recharger la page.
      enregistrerLignes('listeEmissions', this.listeEmissions);
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

  get emissionsFiltrees(): Emission[] {
    let list = this.toutesLignes.filter(item => {
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
          const dateA = new Date(a.dateDebut).getTime() || 0;
          const dateB = new Date(b.dateDebut).getTime() || 0;
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

  // Auto-génération automatique du code de référence Carb si non renseigné manuellement
  // Auto-génération du code de référence Carb
genererCodeReference() {
  // En mode édition, on ne touche pas à la référence existante
  if (this.isEdition && this.formModel.reference) return;

  // Si l'établissement OU la source d'émission n'est pas sélectionné, la référence reste VIDE
  if (!this.formModel.etablissement || !this.formModel.emissionSource) {
    this.formModel.reference = '';
    return;
  }

  // Détermination du préfixe selon l'établissement
  let prefixEtab = 'MS1';
  if (this.formModel.etablissement.includes('2')) prefixEtab = 'MS2';
  if (this.formModel.etablissement.includes('3')) prefixEtab = 'MS3';

  // Détermination du suffixe selon la source choisie
  let codeSource = '';
  const src = (this.formModel.emissionSource || '').toLowerCase();
  
  if (src.includes('gazole') || src.includes('fioul')) codeSource = 'GZ';
  else if (src.includes('essence')) codeSource = 'ESS';
  else if (src.includes('gaz naturel')) codeSource = 'GN';
  else if (src.includes('fioul lourd')) codeSource = 'FL';
  else if (src.includes('propane')) codeSource = 'PRP';
  else if (src.includes('butane')) codeSource = 'BUT';
  else if (src.includes('charbon')) codeSource = 'CHB';
  else if (src.includes('biomasse') || src.includes('bois')) codeSource = 'BIO';
  else codeSource = 'GEN';

  // Attribution finale (ex: MS1GN)
  this.formModel.reference = `${prefixEtab}${codeSource}`;
}
  onEtablissementChange() {
    this.genererCodeReference();
    this.cdr.detectChanges();
  }

  ouvrirModaleImport() {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importSuccesMsg = '';
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport() {
    this.modaleImportOuverte = false;
    this.cdr.detectChanges();
  }

  async telechargerModeleExcel() {
    if (isPlatformBrowser(this.platformId)) {
      const XLSX = await import('xlsx');
      const structure = [
        // « Référence Carb » ne figurait dans aucun alias reconnu : l'intitulé
        // vient désormais du fournisseur commun, celui que les parseurs lisent.
        ['Établissement', ENTETE_REFERENCE, ENTETE_CODE_ARTICLE, 'Source d\'Émission',
         'Montant', 'Quantité', 'Unité', 'De', 'à', 'Hypothèse'],
        ['Misfat 1', 'MS1GN', 'COMB-0003', 'Gaz naturel', '', '12500', 'kWh',
         '01/01/2026', '31/01/2026', 'Réelle'],
        ['Misfat 2', 'MS2GZ', 'COMB-0011', 'Gazole/Fioul', '3500', '', 'TND',
         '01/01/2026', '15/01/2026', 'Estimation']
      ];
      const feuille = XLSX.utils.aoa_to_sheet(structure);
      const classeur = XLSX.utils.book_new();
      
      XLSX.utils.book_append_sheet(classeur, feuille, 'Template Importation');
      XLSX.writeFile(classeur, 'emissions_etablissements_template.xlsx');
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.fichierSelectionne = input.files[0];
      this.importErreurMsg = '';
      this.cdr.detectChanges();
    }
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.fichierSelectionne = event.dataTransfer.files[0];
      this.importErreurMsg = '';
      this.cdr.detectChanges();
    }
  }

  async traiterFichierExcel() {
    if (!this.fichierSelectionne || !isPlatformBrowser(this.platformId)) return;

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const buffer = e.target?.result;
        if (!buffer) return;

        const classeur = XLSX.read(buffer, { type: 'array' });
        const nomFeuille = classeur.SheetNames[0];
        const lignes: any[] = XLSX.utils.sheet_to_json(classeur.Sheets[nomFeuille]);

        if (lignes.length === 0) {
          this.importErreurMsg = "Le fichier importé est vide ou incorrect.";
          this.cdr.detectChanges();
          return;
        }

        let totalAjoute = 0;
        const now = Date.now();

        lignes.forEach((ligne, index) => {
          const etablissement = ligne['Établissement'] || 'Inconnu';
          const source = ligne['Source d\'Émission'] || ligne['Carburant'] || '';
          const ref = ligne['Référence Carb'] || ligne['Référence'] || '';
          const montant = ligne['Montant'] ? Number(ligne['Montant']) : null;
          const quantite = ligne['Quantité'] ? Number(ligne['Quantité']) : null;
          const unite = ligne['Unité'] || 'L';
          const deDate = ligne['De'] || '';
          const aDate = ligne['à'] || '';
          const hypothese = (ligne['Hypothèse'] === 'Estimation') ? 'Estimation' : 'Réelle';

          const typeDonnee = (montant && !quantite) ? 'Monetaire' : 'Physique';
          const valeurConsommee = typeDonnee === 'Monetaire' ? (montant || 0) : (quantite || 0);

          let facteurChoisi = 1.88; 
          let sourceDefaut = 'Base Carbone (Interne)';
          let codeRefDefaut = 'MS1GN';

          if (source.toLowerCase().includes('gazole') || source.toLowerCase().includes('fioul')) {
            facteurChoisi = 2.51;
            sourceDefaut = 'DEFRA';
            codeRefDefaut = 'MS1GZ';
          } else if (source.toLowerCase().includes('essence')) {
            facteurChoisi = 2.28;
            sourceDefaut = 'Ecoinvent';
            codeRefDefaut = 'MS1ESS';
          } else if (source.toLowerCase().includes('gaz naturel')) {
            facteurChoisi = 0.204;
            sourceDefaut = 'Base Carbone (Interne)';
            codeRefDefaut = 'MS1GN';
          }

          // Le facteur du référentiel est en kgCO₂e par unité : le produit est déjà
          // en kilogrammes, unité que le tableau de bord additionne.
          const calculEmission = parseFloat((valeurConsommee * facteurChoisi).toFixed(4));

          const convertirDate = (str: any) => {
            if (!str) return '';
            const strVal = str.toString();
            const p = strVal.split('/');
            return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : strVal;
          };

          const nouvelleEmission: Emission = {
            id: now + index + Math.floor(Math.random() * 1000),
            scope: 'SCOPE_1',
            categorie: 'Combustion dans les établissements',
            etablissement: etablissement,
            reference: ref || codeRefDefaut,
            emissionSource: source,
            typeDonnee: typeDonnee,
            quantite: valeurConsommee,
            facteur: facteurChoisi,
            unite: unite,
            dateDebut: convertirDate(deDate),
            dateFin: convertirDate(aDate),
            emissionCalculee: calculEmission,
            hypothese: hypothese,
            creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy') || '',
            databaseSource: sourceDefaut
          };

          this.listeEmissions.unshift(nouvelleEmission);
          totalAjoute++;
        });

        this.sauvegarderDansLocalStorage();
        this.importSuccesMsg = `Importation réussie ! ${totalAjoute} lignes calculées et enregistrées.`;
        this.fichierSelectionne = null;
        this.cdr.detectChanges();

        setTimeout(() => {
          this.fermerModaleImport();
        }, 1500);

      } catch (err) {
        console.error(err);
        this.importErreurMsg = "Impossible de lire ce fichier Excel. Assurez-vous d'utiliser notre modèle.";
        this.cdr.detectChanges();
      }
    };

    reader.readAsArrayBuffer(this.fichierSelectionne);
  }

  ouvrirModale(emission?: Emission) {
    this.facteursDisponibles = [];
    this.basesDisponibles = [];
    this.facteursFiltresParBase = [];
    this.facteurSelectionne = null;
    this.erreurFormulaire = false;

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope || 'SCOPE_1',
        categorie: emission.categorie || 'Combustion dans les établissements',
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
      
      this.onEmissionSourceChange(true);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_1',
        categorie: 'Combustion dans les établissements',
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

  onEmissionSourceChange(isInitialLoad: boolean = false) {
  // 1. Si aucune source d'émission n'est sélectionnée (ex: l'utilisateur remet le menu sur la valeur vide)
  if (!this.formModel.emissionSource) {
    this.facteursDisponibles = [];
    this.basesDisponibles = [];
    this.facteursFiltresParBase = [];
    this.facteurSelectionne = null;
    this.formModel.facteur = null;
    this.formModel.reference = ''; // <-- Vider la référence
    this.genererCodeReference();   // <-- S'assurer que le champ reste bien vide
    this.cdr.detectChanges();
    return;
  }

    // Auto-génère le code de référence Carb lors de la sélection de la source
    this.genererCodeReference();

    // 3. Mise à jour de l'unité par défaut si chargement non initial (Mode Physique)
  if (!isInitialLoad) {
    if (this.formModel.typeDonnee === 'Physique') {
      const src = this.formModel.emissionSource.toLowerCase();
      if (src.includes('gaz naturel')) {
        this.formModel.unite = 'kWh';
      } else if (src.includes('fioul lourd') || src.includes('propane') || src.includes('butane') || src.includes('charbon')) {
        this.formModel.unite = 'Kg';
      } else {
        this.formModel.unite = 'L';
      }
    } else {
      this.formModel.unite = this.deviseActive;
    }
  }

    // 4. Recherche des facteurs d'émission (API Backend ou secours local)
  const typeSQL = this.formModel.typeDonnee === 'Physique' ? 'PHYSIQUE' : 'MONETAIRE';
  
  // Résolution sur l'index MSSQL, indexé par type de source.
  //
  // La recherche par catégorie ne pouvait pas aboutir : l'écran raisonne en
  // libellés français quand la base stocke les intitulés GHG anglais. Elle
  // renvoyait donc une liste vide, et la colonne « Base appliquée » affichait
  // les sources de secours au lieu de celles de MSSQL.
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
    this.extraireBasesDeDonneesDistinctes();
    this.mettreAJourFacteurSelectionne();
    this.cdr.detectChanges();
  } else {
    this.chargerFacteursSecours(this.formModel.emissionSource, typeSQL);
    this.extraireBasesDeDonneesDistinctes();
    this.mettreAJourFacteurSelectionne();
    this.cdr.detectChanges();
  }
}

  chargerFacteursSecours(source: string, typeSQL: string) {
    this.facteursDisponibles = this.baseFacteursSecours.filter(f => 
      f.emissionSource.toLowerCase() === source.toLowerCase() &&
      f.dataType.toUpperCase() === typeSQL.toUpperCase()
    );
  }

  extraireBasesDeDonneesDistinctes() {
    const bases = this.facteursDisponibles.map(f => f.databaseSource);
    this.basesDisponibles = Array.from(new Set(bases));
  }

  onBaseChange() {
    if (!this.formModel.databaseSource) {
      this.facteursFiltresParBase = [];
      this.facteurSelectionne = null;
      this.formModel.facteur = null;
      this.cdr.detectChanges();
      return;
    }

    this.facteursFiltresParBase = this.facteursDisponibles.filter(
      f => f.databaseSource === this.formModel.databaseSource
    );

    if (this.facteursFiltresParBase.length > 0) {
      this.choisirFacteur(this.facteursFiltresParBase[0]);
    } else {
      this.facteurSelectionne = null;
      this.formModel.facteur = null;
    }
    this.cdr.detectChanges();
  }

  mettreAJourFacteurSelectionne() {
    if (this.isEdition && this.formModel.databaseSource) {
      this.facteursFiltresParBase = this.facteursDisponibles.filter(
        f => f.databaseSource === this.formModel.databaseSource
      );
      
      const trouve = this.facteursFiltresParBase.find(f => f.factorValue === this.formModel.facteur) 
                     || this.facteursFiltresParBase[0];
                   
      if (trouve) {
        this.choisirFacteur(trouve);
      }
    } else if (this.basesDisponibles.length > 0) {
      this.formModel.databaseSource = this.basesDisponibles[0];
      this.onBaseChange();
    }
  }

  /**
   * Ramène les lignes déjà enregistrées en kilogrammes.
   *
   * <p>Les deux chemins d'écriture divisaient par mille et stockaient donc des
   * tonnes, sous une colonne libellée « kgCO₂e » et dans une clé que le tableau
   * de bord somme en kilogrammes. Les lignes sont converties une fois, un
   * marqueur empêchant que la conversion se rejoue.</p>
   *
   * <p>La valeur est recalculée depuis la quantité et le facteur plutôt que
   * multipliée par mille : une ligne dont l'un des deux manque reste intacte.</p>
   */
  private migrerVersKilogrammes(lignes: any[]): any[] {
    const CLE_MIGRATION = 'misfat_combustion_etab_kg_v1';
    if (localStorage.getItem(CLE_MIGRATION) === 'fait') return lignes;

    const migrees = lignes.map(ligne => {
      const quantite = Number(ligne?.quantite);
      const facteur = Number(ligne?.facteur);
      if (!Number.isFinite(quantite) || !Number.isFinite(facteur)) return ligne;

      return { ...ligne, emissionCalculee: parseFloat((quantite * facteur).toFixed(4)) };
    });

    try {
      // La migration change les émissions déjà enregistrées : les vues qui les
      // agrègent doivent repartir des valeurs migrées.
      enregistrerLignes('listeEmissions', migrees);
      localStorage.setItem(CLE_MIGRATION, 'fait');
    } catch (erreur) {
      console.error('[combustion-établissements] Migration en kilogrammes non persistée', erreur);
    }

    return migrees;
  }

  obtenirCalculApercu(factorValue: number): string {
    if (!this.formModel.quantite || this.formModel.quantite <= 0) {
      return '0.0000';
    }
    // L'aperçu montre la valeur qui sera enregistrée : l'afficher en tonnes
    // pendant qu'on stocke des kilogrammes ferait vérifier un autre chiffre.
    const totalKg = this.formModel.quantite * factorValue;
    return totalKg.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  choisirFacteur(facteur: ExtendedEmissionFactor | null) {
    this.facteurSelectionne = facteur;
    if (facteur) {
      this.formModel.facteur = facteur.factorValue;
      this.formModel.databaseSource = facteur.databaseSource || '';
      if (facteur.referenceCode) {
        this.formModel.reference = facteur.referenceCode;
      }
    } else {
      this.formModel.facteur = null;
    }
    this.cdr.detectChanges();
  }

  changerTypeDonnee(valeur: 'Physique' | 'Monetaire') {
    this.formModel.typeDonnee = valeur;
    this.formModel.unite = valeur === 'Physique' ? 'L' : this.deviseActive;
    this.facteursDisponibles = [];
    this.basesDisponibles = [];
    this.facteursFiltresParBase = [];
    this.facteurSelectionne = null;
    this.formModel.facteur = null;
    this.formModel.databaseSource = '';
    this.onEmissionSourceChange();
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
    // Quantité × facteur donne des kgCO₂e, cohérents avec l'en-tête du
    // tableau et avec la somme du tableau de bord.
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
        libelle: 'Volume consommé', icone: '🔥', accent: 'volume',
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
      this.dispatchStore, 'combustion-etablissements', (ligne, rang) => adapterVersMesure(ligne, rang, 'Combustion dans les usines', this.usineVentilation) as Emission, this.usineVentilation
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

  /** Intitulé du degré de rapprochement, pour l'infobulle du tableau. */
  libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
    return libelleRapprochement(rapprochement);
  }

}