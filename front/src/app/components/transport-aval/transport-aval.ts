import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { colonnesIdentite } from '../../core/colonnes-identite';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import {
  Rapprochement, adaptateurStandard, remigrerLignes, libelleRapprochement,
  migrationFaite, marquerMigration, messagePourMigration, marqueurEcran
} from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';

import { lireClasseurAval } from './aval-excel';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { SOURCE_VENTILATION, lignesVentileesPour } from '../../shared/dispatch/adaptateurs-mesure';
import { inject } from '@angular/core';
import {
  ModeFret, MODES_FRET, TypeSaisie, OrigineFacteur,
  retenirFacteurFret, classerFacteursFret, tonnesKilometres, enTonnes,
  calculerEmissionFret, classeBadgeFret, emojiFret,
  ETABLISSEMENT_DEFAUT, DEVISE_DEFAUT
} from './aval-facteur';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Expédition aval, catégorie 9 du Scope 3. */
export interface EmissionAval {
  /**
   * Code article de l'ERP, second degré de rapprochement.
   *
   * <p>Le référentiel et l'ERP partagent parfois la même codification : le
   * code désigne alors le facteur aussi sûrement que la référence.</p>
   */
  codeArticle?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
  id: number;
  scope: string;
  categorie: string;
  idExpedition: string;
  etablissement: string;
  destination: string;
  mode: ModeFret | null;
  modeTexte: string;
  provenance: Provenance;
  typeSaisie: TypeSaisie;
  poidsTonnes: number | null;
  distanceKm: number | null;
  tonneKm: number | null;
  montant: number | null;
  devise: string;
  /** Grandeur portant le calcul : t.km ou montant selon l'approche. */
  quantite: number | null;
  uniteQuantite: string;
  facteur: number | null;
  uniteFacteur: string;
  libelleFacteur: string;
  referenceFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  creeLe: string;
}

/** Catégorie GHG couverte : transport et distribution en aval. */
const MOTIF_CATEGORIE = /^Category 9:/i;

const CLE_STOCKAGE = 'listeEmissionsTransportAval';

const LIBELLE_CATEGORIE = 'Transport en aval';

const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-transport-aval',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './transport-aval.html',
  styleUrl: './transport-aval.css'
})
export class TransportAvalComponent implements OnInit {

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionAval[] = [];
  filtreEtablissement = 'Tous';
  filtreMode = 'Tous';
  filtreProvenance = 'Toutes';
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
  /** Notification de succès affichée après un import. */
  toastMessage = '';
  /** Notification d'avertissement : application d'un facteur de repli. */
  toastSecondaire = '';

  readonly modesFret = MODES_FRET;
  readonly classeBadgeFret = classeBadgeFret;
  readonly emojiFret = emojiFret;

  // ---------- Référentiel carbone ----------
  facteursDisponibles: FacteurDetaille[] = [];

  /**
   * Compte rendu de la migration d'appariement.
   *
   * <p>Distinct de l'avertissement sur le référentiel, que le chargement
   * réécrit juste après : les deux messages se seraient effacés l'un
   * l'autre.</p>
   */
  messageMigration = '';
  facteursCompatibles: FacteurDetaille[] = [];
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  erreurInitialisation = '';
  /** Renseigné quand le stockage local a refusé le volume importé. */
  avertissementStockage = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = DEVISE_DEFAUT;

  formModel = {
    idExpedition: '',
    etablissement: ETABLISSEMENT_DEFAUT,
    destination: '',
    mode: 'Routier' as ModeFret,
    provenance: 'Réel' as Provenance,
    /** `true` pour valoriser la facture plutôt que le poids et la distance. */
    monetaire: false,
    poidsTonnes: null as number | null,
    distanceKm: null as number | null,
    montant: null as number | null,
    devise: DEVISE_DEFAUT
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
   * Initialisation défensive.
   *
   * <p>Une exception levée ici remonterait au tableau de bord et interromprait
   * son rendu : l'échec est rapporté dans l'interface, jamais propagé.</p>
   */
  ngOnInit(): void {
    try {
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
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[transport-aval] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        // Un référentiel partiel n'empêche pas la saisie : les replis ADEME
        // prennent le relais, en le signalant.
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 9 : les facteurs de '
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

  // ---------- Périmètre ----------

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = Array.isArray(filiales) ? filiales : [];
        this.majPerimetre();
      },
      error: () => {
        this.filiales = [];
        this.majPerimetre();
      }
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || DEVISE_DEFAUT;

    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    if (this.filtreEtablissement !== 'Tous'
        && !this.usinesDisponibles.some(u => u.nom === this.filtreEtablissement)) {
      this.filtreEtablissement = 'Tous';
    }
    if (this.formModel.monetaire) this.formModel.devise = this.deviseActive;
    this.cdr.detectChanges();
  }

  // ---------- Tableau et pagination ----------

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
    grandeur: 'distanceKm', facteur: 'facteur',
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

  get emissionsFiltrees(): EmissionAval[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.toutesLignes.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.mode !== this.filtreMetier) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (this.filtreMode !== 'Tous' && item.mode !== this.filtreMode) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.idExpedition, item.destination, item.etablissement,
              item.mode ?? '', item.modeTexte, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') return ((a.quantite ?? 0) - (b.quantite ?? 0)) * sens;
        if (this.sortColumn === 'expedition') return a.idExpedition.localeCompare(b.idExpedition) * sens;
        if (this.sortColumn === 'destination') return a.destination.localeCompare(b.destination) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionAval[] {
    const liste = this.emissionsFiltrees;
    const page = Math.min(this.pageCourante, Math.max(1, Math.ceil(liste.length / this.taillePage)));
    const debut = (page - 1) * this.taillePage;
    return liste.slice(debut, debut + this.taillePage);
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

  onFiltreChange(): void {
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  get totalTonneKm(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + (e.tonneKm ?? 0), 0);
  }

  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'ADEME').length;
  }

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
    this.filtreStatut = 'Tous';
    this.filtreEtablissement = 'Tous';
    this.filtreMode = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionAval): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        idExpedition: emission.idExpedition,
        etablissement: emission.etablissement,
        destination: emission.destination,
        mode: emission.mode ?? 'Routier',
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        monetaire: emission.typeSaisie === 'Monétaire',
        poidsTonnes: emission.poidsTonnes,
        distanceKm: emission.distanceKm,
        montant: emission.montant,
        devise: emission.devise
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        idExpedition: '',
        etablissement: this.usinesDisponibles.length === 1
          ? this.usinesDisponibles[0].nom
          : ETABLISSEMENT_DEFAUT,
        destination: '',
        mode: 'Routier',
        provenance: 'Réel',
        monetaire: false,
        poidsTonnes: null,
        distanceKm: null,
        montant: null,
        devise: this.deviseActive
      };
    }

    this.majFacteursCompatibles();
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursFret(this.facteursDisponibles, {
      mode: this.formModel.mode,
      monetaire: this.formModel.monetaire,
      devise: this.formModel.devise
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
  }

  /** La bascule commande le jeu de facteurs comme la grandeur valorisée. */
  changerBaseCalcul(monetaire: boolean): void {
    this.formModel.monetaire = monetaire;
    if (monetaire) this.formModel.devise = this.deviseActive;
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onModeChange(): void {
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onFacteurChoisiChange(): void {
    this.cdr.detectChanges();
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  /** Facteur qui sera appliqué à la saisie en cours. */
  get facteurCourant() {
    const choisi = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId));
    if (choisi) {
      return {
        origine: 'MS SQL BDD' as OrigineFacteur,
        valeur: choisi.factorValue,
        unite: choisi.unit,
        libelle: choisi.typeName,
        reference: choisi.referenceCode,
        baseAppliquee: choisi.databaseSource,
        id: choisi.id
      };
    }
    return retenirFacteurFret(this.facteursDisponibles, {
      mode: this.formModel.mode,
      monetaire: this.formModel.monetaire,
      devise: this.formModel.devise
    });
  }

  /** Tonnes-kilomètres de la saisie en cours. */
  get tonneKmPrevisionnel(): number | null {
    return tonnesKilometres(this.formModel.poidsTonnes, this.formModel.distanceKm);
  }

  /** Grandeur portant le calcul, selon l'approche retenue. */
  get quantitePrevisionnelle(): number | null {
    return this.formModel.monetaire ? this.formModel.montant : this.tonneKmPrevisionnel;
  }

  get uniteQuantiteCourante(): string {
    return this.formModel.monetaire ? this.formModel.devise : 't.km';
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionFret(this.quantitePrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.destination.trim()) {
      return this.refuser('La destination ou le client est obligatoire.');
    }

    if (m.monetaire) {
      if (m.montant === null || m.montant <= 0) {
        return this.refuser('Le montant de la prestation est obligatoire.');
      }
    } else {
      if (m.poidsTonnes === null || m.poidsTonnes <= 0) {
        return this.refuser('Le poids en tonnes est obligatoire.');
      }
      if (m.distanceKm === null || m.distanceKm <= 0) {
        return this.refuser('La distance est obligatoire.');
      }
    }

    const facteur = this.facteurCourant;
    const quantite = this.quantitePrevisionnelle;

    const ligne: EmissionAval = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      idExpedition: m.idExpedition.trim()
        || `EXP-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      etablissement: m.etablissement || ETABLISSEMENT_DEFAUT,
      destination: m.destination.trim(),
      mode: m.mode,
      modeTexte: m.mode,
      provenance: m.provenance,
      typeSaisie: m.monetaire ? 'Monétaire' : 'Tonne.km',
      poidsTonnes: m.monetaire ? null : m.poidsTonnes,
      distanceKm: m.monetaire ? null : m.distanceKm,
      tonneKm: m.monetaire ? null : this.tonneKmPrevisionnel,
      montant: m.monetaire ? m.montant : null,
      devise: m.devise,
      quantite,
      uniteQuantite: this.uniteQuantiteCourante,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      referenceFacteur: facteur.reference,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionFret(quantite, facteur.valeur),
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
      if (!enregistrerLignes(CLE_STOCKAGE, this.listeEmissions)) throw new Error('stockage refuse');
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} expéditions). `
        + 'Les lignes restent affichées mais ne seront pas conservées à la fermeture.';
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

  fermerModaleImport(): void {
    this.modaleImportOuverte = false;
    this.cdr.detectChanges();
  }

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
    const usine = this.usinesDisponibles[0]?.nom ?? ETABLISSEMENT_DEFAUT;

    const exemples = [
      {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C9SH', 'TRV-0311'),
        'ID Expédition': 'EXP-0001', 'Établissement': usine,
        'Destination': 'FILTRATION GROUP GMBH', 'Mode Transport': 'Routier',
        'Type Saisie': 'Tonne.km', 'Poids (kg)': 12500, 'Distance (km)': 400,
        'Montant': '', 'Devise': ''
      },
      {
        'ID Expédition': 'EXP-0002', 'Établissement': usine,
        'Destination': 'Shanghai', 'Mode Transport': 'Maritime',
        'Type Saisie': 'Tonne.km', 'Poids (kg)': 20000, 'Distance (km)': 9000,
        'Montant': '', 'Devise': ''
      },
      {
        'ID Expédition': 'EXP-0003', 'Établissement': usine,
        'Destination': 'Casablanca', 'Mode Transport': 'Maritime',
        'Type Saisie': 'Monétaire', 'Poids (kg)': '', 'Distance (km)': '',
        'Montant': 15000, 'Devise': this.deviseActive
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [16, 18, 28, 18, 14, 14, 16, 14, 10].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Expéditions aval');
    XLSX.writeFile(classeur, 'gabarit-transport-aval.xlsx');
  }

  /**
   * Import de la matrice des expéditions aval.
   *
   * <p>Les tonnes-kilomètres sont lues du fichier ou calculées du poids et de
   * la distance, et chaque expédition est rapprochée du référentiel MS SQL avec
   * repli ADEME quand le mode n'y figure pas.</p>
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
        const resultat = lireClasseurAval(classeur);

        if (!resultat) {
          this.importErreurMsg = 'Aucune feuille d\'expéditions reconnue : les colonnes '
            + 'Destination, Mode Transport et une grandeur valorisable sont attendues.';
          this.cdr.detectChanges();
          return;
        }
        if (resultat.colonnesManquantes.length) {
          this.importErreurMsg = resultat.avertissement;
          this.cdr.detectChanges();
          return;
        }
        if (!resultat.lignes.length) {
          this.importErreurMsg = `Feuille « ${resultat.feuille} » sans expédition exploitable.`;
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let replis = 0;
        let modesInconnus = 0;

        const ajoutees: EmissionAval[] = resultat.lignes.map((brute, index) => {
          if (!brute.mode) modesInconnus++;

          const monetaire = brute.typeSaisie === 'Monétaire';
          const facteur = brute.mode
            ? retenirFacteurFret(this.facteursDisponibles, {
                mode: brute.mode, monetaire, devise: brute.devise
              })
            : { origine: 'Aucun' as OrigineFacteur, valeur: null, unite: '', libelle: '',
                reference: '', baseAppliquee: '', id: null };

          if (facteur.origine === 'ADEME') replis++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            idExpedition: brute.idExpedition,
            etablissement: brute.etablissement,
            destination: brute.destination,
            mode: brute.mode,
            modeTexte: brute.modeTexte,
            provenance: 'Excel' as Provenance,
            typeSaisie: brute.typeSaisie,
            poidsTonnes: brute.poidsTonnes,
            distanceKm: brute.distanceKm,
            tonneKm: brute.tonneKm,
            montant: brute.montant,
            devise: brute.devise,
            quantite: brute.quantite,
            uniteQuantite: monetaire ? brute.devise : 't.km',
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            referenceFacteur: facteur.reference,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionFret(brute.quantite, facteur.valeur),
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} expéditions effectuée avec succès !`;
        // Un repli n'est pas une donnée documentée : le dire au moment où il
        // est appliqué, et non seulement dans un bandeau qu'on peut manquer.
        this.toastSecondaire = replis
          ? `${replis} expédition(s) valorisée(s) par un facteur de repli ADEME, `
            + 'faute de facteur correspondant au référentiel MS SQL.'
          : '';

        const details: string[] = [];
        if (modesInconnus) details.push(`${modesInconnus} mode(s) de transport non reconnu(s)`);
        if (resultat.rejets.length) details.push(`${resultat.rejets.length} ligne(s) écartée(s)`);
        this.importErreurMsg = details.join(' · ');

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
      'ID Expedition': e.idExpedition,
      'Etablissement': e.etablissement,
      'Destination / Client': e.destination,
      'Mode transport': e.mode ?? e.modeTexte,
      'Type saisie': e.typeSaisie,
      'Poids (tonnes)': e.poidsTonnes,
      'Distance (km)': e.distanceKm,
      'Tonne.km': e.tonneKm,
      'Montant': e.montant,
      'Devise': e.montant !== null ? e.devise : '',
      'Provenance': e.provenance,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Transport aval');
    XLSX.writeFile(classeur, `transport-aval-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Exposé au template pour convertir un poids saisi en kilogrammes. */
  convertirEnTonnes(poidsKg: number | null): number | null {
    return enTonnes(poidsKg, 'kg');
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
        libelle: 'Activité transport', icone: '🚛', accent: 'volume',
        valeur: (somme(e => e.tonneKm ?? 0)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: 't.km'
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


  private readonly dispatchStore = inject(DispatchStore);

  /**
   * Lignes reçues de la ventilation d'un classeur comptable.
   *
   * <p>Une ligne de balance ne porte ni mode, ni filière, ni prestataire : ces
   * champs prennent la valeur « Non précisé », qui se lit dans la grille comme
   * une qualification restant à faire. Le montant, le facteur et les émissions,
   * eux, sont exacts. Identifiant négatif : la sauvegarde de l'écran ne les
   * écrit jamais dans son stockage.</p>
   */
  get lignesVentilees(): EmissionAval[] {
    const annee = new Date().getFullYear();

    return lignesVentileesPour<EmissionAval>(this.dispatchStore, 'transport-aval', (ligne, rang) => ({
        id: -(rang + 1),
        scope: ligne.scope ?? 'SCOPE_3',
        categorie: 'transport-aval',
        etablissement: this.societeActiveLabel,
        reference: ligne.mainAccount || ligne.reference || 'VENT',
        numeroFacture: ligne.mainAccount || '',
        provenance: 'Excel',
        modeFret: 'Non précisé' as any, poidsTonnes: null, distanceKm: null, tonneKm: null,
        quantite: ligne.quantite, uniteQuantite: 'TND', client: '', destination: '',
        montant: ligne.quantite,
        devise: ligne.uniteFacteur || 'TND',
        facteur: ligne.facteur,
        uniteFacteur: ligne.uniteFacteur || 'TND',
        libelleFacteur: ligne.libelleFacteur,
        baseAppliquee: ligne.baseAppliquee,
        origineFacteur: ligne.origineFacteur,
        emissionCalculee: ligne.emissionKg,
        dateDebut: annee + '-01-01',
        dateFin: annee + '-12-31',
        creeLe: '',
        sourceData: SOURCE_VENTILATION
    }) as unknown as EmissionAval);
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionAval[] {
    return [...this.lignesVentilees, ...this.listeEmissions];
  }


  /**
   * Rejoue l'appariement sur les lignes déjà enregistrées.
   *
   * <p>Les lignes antérieures à l'appariement à trois degrés ont été rattachées
   * au premier facteur venu de leur catégorie. Cette migration les confronte à
   * nouveau au référentiel : celle qui porte sa référence carbone retrouve son
   * facteur exact et sa base documentaire réelle.</p>
   *
   * <p>Elle ne s'exécute qu'une fois, et rien n'est écrasé qui ne s'améliore.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('transport_aval');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionAval>({
      reference: 'referenceFacteur',
      codeArticle: 'codeArticle',
      categorie: 'categorie',
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