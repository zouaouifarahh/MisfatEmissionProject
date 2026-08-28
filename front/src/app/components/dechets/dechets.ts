import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { ENTETE_REFERENCE, ENTETE_CODE_ARTICLE } from '../../core/colonnes-identite';
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

import { lireClasseurDechets, normaliserUnite } from './dechets-excel';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { SOURCE_VENTILATION, lignesVentileesPour } from '../../shared/dispatch/adaptateurs-mesure';
import { inject } from '@angular/core';
import {
  Filiere, FILIERES, normaliserFiliere, choisirFacteurDechet,
  classerFacteursDechet, calculerEmissionDechet
} from './dechets-facteur';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Ligne de déchet, catégorie 5 du Scope 3. */
export interface EmissionDechet {
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
  etablissement: string;
  typeDechet: string;
  provenance: Provenance;
  filiere: Filiere;
  prestataire: string;
  reutilise: string;
  quantiteTotale: number | null;
  unite: string;
  /** Coût de traitement, quand la valorisation est monétaire. */
  montant: number | null;
  devise: string;
  reference: string;
  facteur: number | null;
  uniteFacteur: string;
  baseAppliquee: string;
  emissionCalculee: number;
  dateDebut: string;
  dateFin: string;
  /** Justification d'une quantité estimée. */
  noteEstimation: string;
  creeLe: string;
}

/** Catégorie GHG couverte : déchets générés en exploitation. */
const MOTIF_CATEGORIE = /^Category 5:/i;

const CLE_STOCKAGE = 'listeEmissionsDechets';

const LIBELLE_CATEGORIE = 'Déchets';

/** Unités proposées à la saisie, alignées sur les relevés d'exploitation. */
const UNITES = ['Tonne', 'kg', 'L', 'm³', 'Pc'];

@Component({
  selector: 'app-dechets',
  standalone: true,
  imports: [FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './dechets.html',
  styleUrl: './dechets.css'
})
export class DechetsComponent implements OnInit {

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionDechet[] = [];
  filtreEtablissement = 'Tous';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  modaleSaisieOuverte = false;
  modaleImportOuverte = false;
  modaleEstimationOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;
  messageErreur = '';

  fichierSelectionne: File | null = null;
  importSuccesMsg = '';
  importErreurMsg = '';

  readonly filieres = FILIERES;
  readonly unites = UNITES;

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
  facteurSelectionne: FacteurDetaille | null = null;
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  avertissementFacteur = '';
  avertissementStockage = '';
  erreurInitialisation = '';

  // ---------- Autocomplétion du type de déchet ----------
  rechercheType = '';
  suggestionsOuvertes = false;

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    etablissement: '',
    typeDechet: '',
    provenance: 'Réel' as Provenance,
    filiere: 'Recyclage externe' as Filiere,
    prestataire: '',
    reutilise: 'Non',
    monetaire: false,
    quantiteTotale: null as number | null,
    unite: 'Tonne',
    montant: null as number | null,
    devise: 'TND',
    reference: '',
    facteur: null as number | null,
    uniteFacteur: '',
    baseAppliquee: '',
    dateDebut: '',
    dateFin: '',
    noteEstimation: ''
  };

  /** Formulaire de la modale d'estimation par ratios. */
  estimation = {
    methode: 'production' as 'production' | 'cout',
    productionAnnuelle: null as number | null,
    ratioParTonne: null as number | null,
    coutAnnuel: null as number | null,
    prixUnitaire: null as number | null,
    unite: 'Tonne'
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
    console.error('[dechets] initialisation incomplète :', message);
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
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur déchet dans le référentiel carbone. '
            + 'Importez la base depuis « Référentiel Facteurs ».';
        this.cdr.detectChanges();
      },
      error: () => {
        this.avertissementReferentiel = 'Référentiel carbone injoignable (emission-service, port 8082).';
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Types proposés à l'autocomplétion.
   *
   * <p>Le référentiel ne documente qu'un libellé générique : les types déjà
   * saisis ou importés l'enrichissent, faute de quoi la liste serait vide.</p>
   */
  get typesConnus(): string[] {
    const referentiel = this.facteursDisponibles.map(f => f.typeName);
    const saisis = this.listeEmissions.map(e => e.typeDechet);
    return [...new Set([...referentiel, ...saisis].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  get suggestionsType(): string[] {
    const terme = this.rechercheType.trim().toLowerCase();
    if (!terme) return this.typesConnus;
    return this.typesConnus.filter(t => t.toLowerCase().includes(terme));
  }

  ouvrirSuggestions(): void {
    this.suggestionsOuvertes = true;
    this.cdr.detectChanges();
  }

  fermerSuggestions(): void {
    this.suggestionsOuvertes = false;
    this.cdr.detectChanges();
  }

  /** Sélection câblée sur mousedown : le blur du champ précède le click. */
  choisirType(type: string, evenement?: MouseEvent): void {
    evenement?.preventDefault();
    this.formModel.typeDechet = type;
    this.rechercheType = type;
    this.suggestionsOuvertes = false;
    this.cdr.detectChanges();
  }

  onRechercheType(): void {
    this.suggestionsOuvertes = true;
    this.formModel.typeDechet = this.rechercheType.trim();
    this.cdr.detectChanges();
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
    if (this.formModel.monetaire) this.formModel.devise = this.deviseActive;
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
    grandeur: 'quantiteTotale', facteur: 'facteur',
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

  get emissionsFiltrees(): EmissionDechet[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.toutesLignes.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.typeDechet !== this.filtreMetier) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.typeDechet, item.prestataire, item.filiere, item.etablissement, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'quantite') {
          return ((a.quantiteTotale ?? 0) - (b.quantiteTotale ?? 0)) * sens;
        }
        if (this.sortColumn === 'type') return a.typeDechet.localeCompare(b.typeDechet) * sens;
        return 0;
      });
    }
    return liste;
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  get nombreSansFacteur(): number {
    return this.listeEmissions.filter(e => e.facteur === null).length;
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
    this.filtreStatut = 'Tous';
    this.filtreEtablissement = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.cdr.detectChanges();
  }

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionDechet): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursCompatibles = [];
    this.suggestionsOuvertes = false;

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        etablissement: emission.etablissement,
        typeDechet: emission.typeDechet,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        filiere: emission.filiere,
        prestataire: emission.prestataire,
        reutilise: emission.reutilise,
        monetaire: emission.montant !== null && emission.quantiteTotale === null,
        quantiteTotale: emission.quantiteTotale,
        unite: emission.unite || 'Tonne',
        montant: emission.montant,
        devise: emission.devise,
        reference: emission.reference,
        facteur: emission.facteur,
        uniteFacteur: emission.uniteFacteur,
        baseAppliquee: emission.baseAppliquee,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin,
        noteEstimation: emission.noteEstimation
      };
      this.rechercheType = emission.typeDechet;
      this.rechercherFacteur(emission.reference);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.reinitialiserFormulaire();
      this.rechercherFacteur();
    }

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  private reinitialiserFormulaire(): void {
    this.formModel = {
      etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
      typeDechet: '',
      provenance: 'Réel',
      filiere: 'Recyclage externe',
      prestataire: '',
      reutilise: 'Non',
      monetaire: false,
      quantiteTotale: null,
      unite: 'Tonne',
      montant: null,
      devise: this.deviseActive,
      reference: '',
      facteur: null,
      uniteFacteur: '',
      baseAppliquee: '',
      dateDebut: '',
      dateFin: '',
      noteEstimation: ''
    };
    this.rechercheType = '';
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.suggestionsOuvertes = false;
    this.cdr.detectChanges();
  }

  /**
   * Rapproche automatiquement la saisie et le référentiel.
   *
   * <p>L'unité et la filière suffisent à désigner le facteur : sa valeur et sa
   * base documentaire sont reportées sans intervention. Une unité que le
   * référentiel ne couvre pas ne donne aucun facteur, plutôt qu'un facteur
   * approché qui se tromperait d'ordre de grandeur.</p>
   */
  rechercherFacteur(referencePreferee?: string): void {
    const critere = {
      unite: this.formModel.unite,
      filiere: this.formModel.filiere,
      monetaire: this.formModel.monetaire
    };

    this.facteursCompatibles = classerFacteursDechet(this.facteursDisponibles, critere);

    const prefere = referencePreferee
      ? this.facteursCompatibles.find(f => f.referenceCode === referencePreferee)
      : undefined;

    this.appliquerFacteur(prefere ?? choisirFacteurDechet(this.facteursDisponibles, critere));
    this.cdr.detectChanges();
  }

  changerBaseCalcul(monetaire: boolean): void {
    this.formModel.monetaire = monetaire;
    if (monetaire) this.formModel.devise = this.deviseActive;
    this.rechercherFacteur();
  }

  onFacteurChoisiChange(): void {
    const retenu = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId)) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;
    this.facteurChoisiId = facteur?.id ?? null;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.uniteFacteur = '';
      this.formModel.baseAppliquee = '';
      this.avertissementFacteur = this.facteursDisponibles.length
        ? `Aucun facteur en « ${this.formModel.unite} » dans le référentiel déchets : `
          + 'la ligne sera enregistrée sans valorisation.'
        : '';
      return;
    }

    this.avertissementFacteur = '';
    this.formModel.reference = facteur.referenceCode;
    this.formModel.facteur = facteur.factorValue;
    this.formModel.uniteFacteur = facteur.unit;
    this.formModel.baseAppliquee = facteur.databaseSource;
  }

  get emissionPrevisionnelle(): number {
    const quantite = this.formModel.monetaire ? this.formModel.montant : this.formModel.quantiteTotale;
    return calculerEmissionDechet(quantite, this.formModel.facteur);
  }

  onSaisieChange(): void {
    this.cdr.detectChanges();
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.typeDechet || !m.dateDebut || !m.dateFin) {
      return this.refuser('Usine, type de déchet et période sont obligatoires.');
    }

    const quantite = m.monetaire ? m.montant : m.quantiteTotale;
    if (quantite === null || quantite <= 0) {
      return this.refuser(m.monetaire
        ? 'Le coût de traitement est obligatoire.'
        : 'La quantité totale est obligatoire.');
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin précède la date de début.');
    }

    const ligne: EmissionDechet = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      etablissement: m.etablissement,
      typeDechet: m.typeDechet.trim(),
      provenance: m.provenance,
      filiere: m.filiere,
      prestataire: m.prestataire.trim(),
      reutilise: m.reutilise,
      quantiteTotale: m.monetaire ? null : m.quantiteTotale,
      unite: m.monetaire ? '' : m.unite,
      montant: m.monetaire ? m.montant : null,
      devise: m.devise,
      reference: m.reference,
      facteur: m.facteur,
      uniteFacteur: m.uniteFacteur,
      baseAppliquee: m.baseAppliquee,
      emissionCalculee: this.emissionPrevisionnelle,
      dateDebut: m.dateDebut,
      dateFin: m.dateFin,
      noteEstimation: m.noteEstimation.trim(),
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
      // Persiste ET annonce : le tableau de bord relit ses totaux sans qu'on
      // ait à changer de filtre ou recharger la page.
      if (!enregistrerLignes(CLE_STOCKAGE, this.listeEmissions)) throw new Error('stockage refusé');
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes). `
        + 'Les lignes restent affichées mais ne seront pas conservées à la fermeture.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Modale d'estimation par ratios ----------

  ouvrirModaleEstimation(): void {
    this.modaleEstimationOuverte = true;
    this.estimation = {
      methode: 'production',
      productionAnnuelle: null,
      ratioParTonne: null,
      coutAnnuel: null,
      prixUnitaire: null,
      unite: 'Tonne'
    };
    this.cdr.detectChanges();
  }

  fermerModaleEstimation(): void {
    this.modaleEstimationOuverte = false;
    this.cdr.detectChanges();
  }

  /**
   * Quantité déduite des ratios d'exploitation.
   *
   * <p>Deux voies : un ratio de déchet par tonne produite, ou un coût annuel de
   * traitement rapporté au prix unitaire de la filière. Le ratio s'exprime en
   * kilogrammes par tonne produite ; le résultat est ramené à la tonne.</p>
   */
  get quantiteEstimee(): number | null {
    const e = this.estimation;

    if (e.methode === 'production') {
      if (!e.productionAnnuelle || !e.ratioParTonne) return null;
      return (e.productionAnnuelle * e.ratioParTonne) / 1000;
    }

    if (!e.coutAnnuel || !e.prixUnitaire) return null;
    return e.coutAnnuel / e.prixUnitaire;
  }

  /** Reporte l'estimation dans le formulaire de saisie, dûment qualifiée. */
  appliquerEstimation(): void {
    const quantite = this.quantiteEstimee;
    if (quantite === null) return;

    const e = this.estimation;
    this.reinitialiserFormulaire();

    this.formModel.provenance = 'Estimation';
    this.formModel.quantiteTotale = Number(quantite.toFixed(4));
    this.formModel.unite = e.methode === 'production' ? 'Tonne' : e.unite;
    this.formModel.noteEstimation = e.methode === 'production'
      ? `Estimé : ${e.productionAnnuelle} t produites × ${e.ratioParTonne} kg/t`
      : `Estimé : ${e.coutAnnuel} ${this.deviseActive} de traitement ÷ ${e.prixUnitaire} ${this.deviseActive}/${e.unite}`;

    this.isEdition = false;
    this.idEditionActive = null;
    this.rechercherFacteur();

    this.modaleEstimationOuverte = false;
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  // ---------- Import du relevé mensuel ----------

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
    // Le relevé des déchets se tient en matrice mensuelle : les colonnes
    // d'identité s'ajoutent en queue, pour ne pas décaler les douze mois que le
    // parseur repère par leur position relative au type de déchet.
    const enTete = [
      'Type de déchet', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
      'Reçyclage Int. / Ext.', 'Prestataire de recupération', 'Réutilisé Oui/Non',
      ENTETE_REFERENCE, ENTETE_CODE_ARTICLE
    ];
    const exemple = [
      'Déchet plastic (T)', 5.252, 3.213, 5.982, 4.853, 5.333, 4.29,
      5.27, 3.42, 6.631, 3.865, 4.328, 4.871,
      'En externe', 'Brahim BOUCHAMI', 'Non',
      'MS3C5WA', 'DEC-0031'
    ];

    const feuille = XLSX.utils.aoa_to_sheet([
      ['Données pour bilan carbone'],
      [new Date().getFullYear()],
      enTete,
      exemple
    ]);
    feuille['!cols'] = [26, ...Array(12).fill(10), 20, 26, 16].map(w => ({ wch: w }));

    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Feuil1');
    XLSX.writeFile(classeur, 'gabarit-dechets.xlsx');
  }

  /**
   * Import du relevé mensuel de déchets.
   *
   * <p>La matrice est lue par le parser dédié : ligne d'en-tête détectée, douze
   * mois sommés, métadonnées de fin de ligne rapprochées, unités déduites du
   * libellé. Une quantité issue d'une mention « Estimé… » est retenue mais
   * qualifiée comme telle.</p>
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
        const resultat = lireClasseurDechets(classeur);

        if (!resultat || !resultat.lignes.length) {
          this.importErreurMsg = 'Aucune matrice mensuelle reconnue : '
            + 'une ligne d\'en-tête portant les mois de janvier à décembre est attendue.';
          this.cdr.detectChanges();
          return;
        }

        const annee = resultat.annee ?? new Date().getFullYear();
        const usineDefaut = this.usinesDisponibles[0]?.nom ?? '';
        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';

        let sansFacteur = 0;
        let estimees = 0;

        const ajoutees: EmissionDechet[] = resultat.lignes.map((brute, index) => {
          const filiere = normaliserFiliere(brute.traitement);
          const unite = normaliserUnite(brute.unite);
          const facteur = choisirFacteurDechet(this.facteursDisponibles, { unite, filiere });

          if (!facteur) sansFacteur++;
          if (brute.estimation) estimees++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            etablissement: usineDefaut,
            typeDechet: brute.typeDechet,
            provenance: (brute.estimation ? 'Estimation' : 'Excel') as Provenance,
            filiere,
            prestataire: brute.prestataire,
            reutilise: brute.reutilise,
            quantiteTotale: brute.quantiteTotale,
            unite,
            montant: null,
            devise: this.deviseActive,
            reference: facteur?.referenceCode ?? '',
            facteur: facteur?.factorValue ?? null,
            uniteFacteur: facteur?.unit ?? '',
            baseAppliquee: facteur?.databaseSource ?? '',
            emissionCalculee: calculerEmissionDechet(brute.quantiteTotale, facteur?.factorValue ?? null),
            dateDebut: `${annee}-01-01`,
            dateFin: `${annee}-12-31`,
            noteEstimation: brute.noteEstimation,
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.sauvegarder();

        this.importSuccesMsg = `${ajoutees.length} flux importé(s) sur l'exercice ${annee} `
          + `(feuille « ${resultat.feuille} », en-tête ligne ${resultat.ligneEnTete + 1}, `
          + `${resultat.moisDetectes} mois sommés).`;

        const details: string[] = [];
        if (sansFacteur) {
          details.push(`${sansFacteur} flux sans facteur : unité non couverte par le référentiel`);
        }
        if (estimees) details.push(`${estimees} flux estimé(s), signalé(s) en pastille Estimation`);
        if (resultat.rejets.length) {
          details.push(`${resultat.rejets.length} ligne(s) écartée(s) faute de quantité`);
        }
        this.importErreurMsg = details.join(' · ');
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
      'Etablissement / Usine': e.etablissement,
      'Type de dechet': e.typeDechet,
      'Provenance': e.provenance,
      'Filiere de traitement': e.filiere,
      'Prestataire': e.prestataire,
      'Reutilise': e.reutilise,
      'Quantite totale': e.quantiteTotale,
      'Unite': e.unite,
      'Cout de traitement': e.montant,
      'Devise': e.montant !== null ? e.devise : '',
      'Facteur': e.facteur,
      'Base appliquee': e.baseAppliquee,
      'Reference': e.reference,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin,
      'Note estimation': e.noteEstimation
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Déchets');
    XLSX.writeFile(classeur, `dechets-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        libelle: 'Déchets déclarés', icone: '🗑️', accent: 'volume',
        valeur: (somme(e => (e.unite === 'kg' ? (e.quantiteTotale ?? 0) / 1000 : (e.quantiteTotale ?? 0)))).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: 'tonnes'
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
  get lignesVentilees(): EmissionDechet[] {
    const annee = new Date().getFullYear();

    return lignesVentileesPour<EmissionDechet>(this.dispatchStore, 'dechets', (ligne, rang) => ({
        id: -(rang + 1),
        scope: ligne.scope ?? 'SCOPE_3',
        categorie: 'dechets',
        etablissement: this.societeActiveLabel,
        reference: ligne.mainAccount || ligne.reference || 'VENT',
        numeroFacture: ligne.mainAccount || '',
        provenance: 'Excel',
        filiere: 'Non précisée' as any, typeDechet: ligne.nom, prestataire: '', reutilise: '',
        quantiteTotale: null, unite: 'TND', noteEstimation: ligne.motif,
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
    }) as unknown as EmissionDechet);
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionDechet[] {
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
    const MARQUEUR = marqueurEcran('dechets');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionDechet>({
      reference: 'reference',
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
