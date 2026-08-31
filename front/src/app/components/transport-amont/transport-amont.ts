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

import { lireClasseur, nombreTolerant } from './transport-excel';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { SOURCE_VENTILATION, lignesVentileesPour } from '../../shared/dispatch/adaptateurs-mesure';
import { inject } from '@angular/core';
import {
  ModeTransport, MODES_TRANSPORT, choisirFacteur, classerFacteurs,
  calculerEmission, deduireMode, libelleFormule, modeCalculDe,
  poidsTotalDepuisQuantite, tonnesKilometres
} from './transport-facteur';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre, messagePerimetre
} from '../../shared/ui/perimetre-ecran';
import { MesuresServeurComponent } from '../../shared/ui/mesures-serveur';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Ligne de transport amont, catégorie 4 du Scope 3. */
export interface EmissionTransport {
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
  numeroFacture: string;
  provenance: Provenance;
  modeTransport: ModeTransport;
  transporteur: string;
  destination: string;
  client: string;
  poidsKg: number | null;
  distanceKm: number | null;
  montant: number | null;
  devise: string;
  /** Libellé du facteur retenu au référentiel. */
  typeFacteur: string;
  reference: string;
  facteur: number | null;
  uniteFacteur: string;
  /** Source documentaire du facteur : EPA 2024, DESNZ 2024, Ecoinvent… */
  baseAppliquee: string;
  emissionCalculee: number;
  dateDebut: string;
  dateFin: string;
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
}

/** Catégorie GHG couverte : transport et distribution amont. */
const MOTIF_CATEGORIE = /^Category 4:/i;

const CLE_STOCKAGE = 'listeEmissionsTransportAmont';

const LIBELLE_CATEGORIE = 'Transport en amont';

@Component({
  selector: 'app-transport-amont',
  standalone: true,
  imports: [MesuresServeurComponent, FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './transport-amont.html',
  styleUrl: './transport-amont.css'
})
export class TransportAmontComponent implements OnInit {

  /** Statut du facteur retenu : référentiel MS SQL ou repli ADEME. */
  filtreStatut = 'Tous';

  listeEmissions: EmissionTransport[] = [];
  filtreEtablissement = 'Tous';
  filtreProvenance = 'Toutes';
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

  readonly modesTransport = MODES_TRANSPORT;

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
  /** Facteurs compatibles avec le mode et la base de calcul retenus. */
  facteursCompatibles: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  facteurChoisiId: number | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';
  avertissementFacteur = '';
  avertissementStockage = '';
  erreurInitialisation = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    etablissement: '',
    numeroFacture: '',
    provenance: 'Réel' as Provenance,
    modeTransport: MODES_TRANSPORT[0] as ModeTransport,
    transporteur: '',
    destination: '',
    client: '',
    /** `true` pour valoriser au montant facturé plutôt qu'au poids-distance. */
    monetaire: false,
    /**
     * Nombre d'unités expédiées.
     *
     * <p>Un expéditeur de filtres compte les pièces plutôt que de peser ses
     * palettes : le poids total s'en déduit par le poids moyen de la
     * référence.</p>
     */
    quantite: null as number | null,
    /** Poids moyen d'une unité, en kilogrammes. */
    poidsMoyenKg: null as number | null,
    poidsKg: null as number | null,
    distanceKm: null as number | null,
    montant: null as number | null,
    devise: 'TND',
    typeFacteur: '',
    reference: '',
    facteur: null as number | null,
    uniteFacteur: '',
    baseAppliquee: '',
    dateDebut: '',
    dateFin: ''
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
   * son rendu : l'écran entier disparaîtrait au lieu de la seule donnée
   * manquante. L'échec est donc rapporté dans l'interface, jamais propagé.</p>
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
          this.exerciceActif = filtre?.year ?? null;
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
    console.error('[transport-amont] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.chargementFacteurs = true;
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        // Un corps d'erreur renvoyé avec un code 200 ferait échouer les
        // traitements en aval et emporterait le rendu du tableau de bord.
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        this.chargementFacteurs = false;

        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur de transport amont dans le référentiel carbone. '
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

  /**
   * Ce que le perimetre a mis de cote, dit sous le tableau.
   *
   * <p>Un tableau qui retrecit sans explication se lit comme une perte.</p>
   */
  get messagePerimetre(): string {
    return messagePerimetre(this.triPerimetre, this.societeActiveLabel, this.exerciceActif);
  }

  get emissionsFiltrees(): EmissionTransport[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.modeTransport !== this.filtreMetier) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) {
        return false;
      }
      if (!terme) return true;
      return [item.numeroFacture, item.modeTransport, item.transporteur, item.destination,
              item.client, item.etablissement, item.reference, item.typeFacteur, item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'poids') return ((a.poidsKg ?? 0) - (b.poidsKg ?? 0)) * sens;
        if (this.sortColumn === 'distance') return ((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) * sens;
        if (this.sortColumn === 'montant') return ((a.montant ?? 0) - (b.montant ?? 0)) * sens;
        if (this.sortColumn === 'facture') return a.numeroFacture.localeCompare(b.numeroFacture) * sens;
        return 0;
      });
    }
    return liste;
  }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + e.emissionCalculee, 0);
  }

  get totalPoids(): number {
    return this.emissionsFiltrees.reduce((somme, e) => somme + (e.poidsKg ?? 0), 0);
  }

  /** Lignes importées restées sans facteur : elles pèsent zéro à tort. */
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

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionTransport): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursCompatibles = [];

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        etablissement: emission.etablissement,
        numeroFacture: emission.numeroFacture,
        // Une ligne importée redevient une saisie assumée dès qu'on la modifie.
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        modeTransport: emission.modeTransport,
        transporteur: emission.transporteur,
        destination: emission.destination,
        client: emission.client,
        monetaire: (emission.uniteFacteur ?? '').toUpperCase() === (emission.devise ?? '').toUpperCase()
                   && emission.montant !== null,
        // Quantité et poids moyen ne sont pas conservés sur la ligne : le poids
        // total, lui, l'est. Rouvrir une ligne repart donc du poids, ce qui la
        // laisse modifiable sans reconstituer un détail qu'on n'a pas gardé.
        quantite: null,
        poidsMoyenKg: null,
        poidsKg: emission.poidsKg,
        distanceKm: emission.distanceKm,
        montant: emission.montant,
        devise: emission.devise,
        typeFacteur: emission.typeFacteur,
        reference: emission.reference,
        facteur: emission.facteur,
        uniteFacteur: emission.uniteFacteur,
        baseAppliquee: emission.baseAppliquee,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin
      };
      this.rechercherFacteur(emission.reference);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        numeroFacture: '',
        provenance: 'Réel',
        modeTransport: MODES_TRANSPORT[0],
        transporteur: '',
        destination: '',
        client: '',
        monetaire: false,
        quantite: null,
        poidsMoyenKg: null,
        poidsKg: null,
        distanceKm: null,
        montant: null,
        devise: this.deviseActive,
        typeFacteur: '',
        reference: '',
        facteur: null,
        uniteFacteur: '',
        baseAppliquee: '',
        dateDebut: '',
        dateFin: ''
      };
      this.rechercherFacteur();
    }

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  /**
   * Rapproche automatiquement la saisie et le référentiel.
   *
   * <p>Le mode de transport et la base de calcul suffisent à désigner le
   * facteur : sa valeur, son unité et sa base documentaire sont reportées sans
   * intervention. L'utilisateur ne peut qu'arbitrer entre bases concurrentes,
   * jamais retenir un facteur étranger au mode décrit.</p>
   */
  rechercherFacteur(referencePreferee?: string): void {
    const critere = {
      mode: this.formModel.modeTransport,
      monetaire: this.formModel.monetaire,
      devise: this.formModel.devise
    };

    this.facteursCompatibles = classerFacteurs(this.facteursDisponibles, critere);

    const prefere = referencePreferee
      ? this.facteursCompatibles.find(f => f.referenceCode === referencePreferee)
      : undefined;

    this.appliquerFacteur(prefere ?? choisirFacteur(this.facteursDisponibles, critere));
    this.cdr.detectChanges();
  }

  onModeChange(): void {
    if (this.formModel.monetaire) this.formModel.devise = this.deviseActive;
    this.rechercherFacteur();
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

  /** Reporte le facteur retenu : référence, valeur, unité et base appliquée. */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;
    this.facteurChoisiId = facteur?.id ?? null;

    if (!facteur) {
      this.formModel.typeFacteur = '';
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.uniteFacteur = '';
      this.formModel.baseAppliquee = '';
      this.avertissementFacteur = this.facteursDisponibles.length
        ? `Aucun facteur ${this.formModel.monetaire ? 'monétaire' : 'physique'} `
          + `pour « ${this.formModel.modeTransport} » dans le référentiel carbone.`
        : '';
      return;
    }

    this.avertissementFacteur = '';
    this.formModel.typeFacteur = facteur.typeName;
    this.formModel.reference = facteur.referenceCode;
    this.formModel.facteur = facteur.factorValue;
    this.formModel.uniteFacteur = facteur.unit;
    this.formModel.baseAppliquee = facteur.databaseSource;
    if (this.formModel.monetaire) {
      this.formModel.devise = facteur.currency?.trim().toUpperCase() || this.deviseActive;
    }
  }

  /** Formule appliquée, affichée pour lever toute ambiguïté sur le calcul. */
  get formuleAppliquee(): string {
    if (!this.formModel.facteur) return '';
    return libelleFormule(modeCalculDe(
      this.formModel.uniteFacteur,
      this.formModel.monetaire ? 'MONETAIRE' : 'PHYSIQUE'
    ));
  }

  get emissionPrevisionnelle(): number {
    return calculerEmission({
      facteur: this.formModel.facteur,
      uniteFacteur: this.formModel.uniteFacteur,
      dataType: this.formModel.monetaire ? 'MONETAIRE' : 'PHYSIQUE',
      poidsKg: this.formModel.poidsKg,
      distanceKm: this.formModel.distanceKm,
      montant: this.formModel.montant
    });
  }

  /**
   * Le total prévisionnel suit la frappe.
   *
   * <p>Quand la quantité et le poids moyen sont renseignés, le poids total en
   * découle : c'est la façon dont un expéditeur de filtres connaît son
   * chargement. La saisie directe du poids reste possible pour les expéditions
   * qu'on pèse — elle n'est écrasée que si les deux autres champs la
   * déterminent.</p>
   */
  onSaisieChange(): void {
    const deduit = poidsTotalDepuisQuantite(this.formModel.quantite, this.formModel.poidsMoyenKg);
    if (deduit !== null) this.formModel.poidsKg = deduit;
    this.cdr.detectChanges();
  }

  /**
   * Tonnes-kilomètres de la ligne en cours, affichées sous la saisie.
   *
   * <p>Montrer la grandeur intermédiaire évite d'avoir à croire le total sur
   * parole : c'est elle que le facteur multiplie.</p>
   */
  get tonnesKmPrevisionnelles(): number | null {
    return tonnesKilometres(
      this.formModel.distanceKm, this.formModel.quantite, this.formModel.poidsMoyenKg);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.modeTransport || !m.dateDebut || !m.dateFin) {
      return this.refuser('Usine, mode de transport et période sont obligatoires.');
    }
    if (m.facteur === null) {
      return this.refuser('Aucun facteur applicable : ajustez le mode ou la base de calcul.');
    }

    const calcul = modeCalculDe(m.uniteFacteur, m.monetaire ? 'MONETAIRE' : 'PHYSIQUE');

    if (calcul === 'MONETAIRE') {
      if (m.montant === null || m.montant <= 0) return this.refuser('Le montant est obligatoire.');
    } else {
      if (calcul !== 'KM' && (m.poidsKg === null || m.poidsKg <= 0)) {
        return this.refuser('Le poids est obligatoire pour ce facteur.');
      }
      if (calcul !== 'MASSE' && (m.distanceKm === null || m.distanceKm <= 0)) {
        return this.refuser('La distance est obligatoire pour ce facteur.');
      }
    }

    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      return this.refuser('La date de fin précède la date de début.');
    }

    const ligne: EmissionTransport = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      etablissement: m.etablissement,
      numeroFacture: m.numeroFacture.trim(),
      provenance: m.provenance,
      modeTransport: m.modeTransport,
      transporteur: m.transporteur.trim(),
      destination: m.destination.trim(),
      client: m.client.trim(),
      poidsKg: calcul === 'MONETAIRE' ? m.poidsKg : m.poidsKg,
      distanceKm: calcul === 'MONETAIRE' ? m.distanceKm : m.distanceKm,
      montant: m.montant,
      devise: m.devise,
      typeFacteur: m.typeFacteur,
      reference: m.reference,
      facteur: m.facteur,
      uniteFacteur: m.uniteFacteur,
      baseAppliquee: m.baseAppliquee,
      emissionCalculee: this.emissionPrevisionnelle,
      dateDebut: m.dateDebut,
      dateFin: m.dateFin,
      societeId: this.societeActiveId,
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

  /**
   * Persiste la saisie dans le stockage local.
   *
   * <p>Le suivi export compte plus de trois mille lignes par exercice, au-delà
   * de ce qu'accorde le navigateur. Sans ce garde, l'écriture échouerait en
   * silence et la page se figerait sur une exception de quota.</p>
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
        + 'filtrez le suivi export par usine ou par période avant import.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Import du suivi export ----------

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
    const exemple: Record<string, string | number> = {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C4UT', 'TRA-0509'),
      'Facture': 'FE25000001',
      'Clients': 'FILTRATION GROUP GMBH',
      'PAYS': 'ALLEMAGNE',
      'Transporteur': 'HBH',
      'Poids': 6684,
      'Montant de la facture': 31838.88,
      'Distance terrestre': 49,
      'distance maritime': 4459.616,
      'Date de départ': '2025-01-02',
      'Date de Liv': '2025-01-08',
      'Usine': this.usinesDisponibles[0]?.nom ?? 'MISFAT 1'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [16, 28, 16, 16, 12, 20, 18, 18, 14, 14, 16].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'EXP');
    XLSX.writeFile(classeur, 'gabarit-transport-amont.xlsx');
  }

  /**
   * Import du suivi export.
   *
   * <p>Le classeur est lu par le parser tolérant : ligne d'en-tête détectée,
   * colonnes rapprochées par synonymes, valeurs nettoyées. Chaque ligne est
   * ensuite rapprochée du référentiel selon son mode déduit, puis valorisée par
   * la formule qu'impose l'unité du facteur retenu.</p>
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
        const resultat = lireClasseur(classeur);

        if (!resultat || !resultat.lignes.length) {
          this.importErreurMsg = 'Aucune feuille de transport reconnue : '
            + 'colonnes Facture, Transporteur, Pays, Poids ou Montant introuvables.';
          this.cdr.detectChanges();
          return;
        }

        const usineDefaut = this.usinesDisponibles[0]?.nom ?? '';
        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';

        let sansFacteur = 0;
        let multimodal = 0;

        const ajoutees: EmissionTransport[] = resultat.lignes.map((brute, index) => {
          const { mode, distanceKm, legIgnore } = deduireMode(
            brute.distanceTerrestreKm, brute.distanceMaritimeKm
          );
          if (legIgnore) multimodal++;

          // Sans poids ni distance, seule une valorisation au montant reste
          // possible ; le référentiel ne la documente pas pour tous les modes.
          const monetaire = distanceKm === null || brute.poidsKg === null;
          const facteur = choisirFacteur(this.facteursDisponibles, {
            mode, monetaire, devise: this.deviseActive
          });
          if (!facteur) sansFacteur++;

          return {
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            etablissement: brute.usine || usineDefaut,
            numeroFacture: brute.numeroFacture,
            provenance: 'Excel' as Provenance,
            modeTransport: mode,
            transporteur: brute.transporteur,
            destination: brute.destination,
            client: brute.client,
            poidsKg: brute.poidsKg,
            distanceKm,
            montant: brute.montant,
            devise: this.deviseActive,
            typeFacteur: facteur?.typeName ?? '',
            reference: facteur?.referenceCode ?? '',
            facteur: facteur?.factorValue ?? null,
            uniteFacteur: facteur?.unit ?? '',
            baseAppliquee: facteur?.databaseSource ?? '',
            emissionCalculee: facteur
              ? calculerEmission({
                  facteur: facteur.factorValue, uniteFacteur: facteur.unit,
                  dataType: facteur.dataType, poidsKg: brute.poidsKg,
                  distanceKm, montant: brute.montant
                })
              : 0,
            dateDebut: brute.dateDebut,
            dateFin: brute.dateFin,
            societeId: this.societeActiveId,
            creeLe: horodatage
          };
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.sauvegarder();

        this.importSuccesMsg = `${ajoutees.length} ligne(s) importée(s) depuis la feuille `
          + `« ${resultat.feuille} » (en-tête ligne ${resultat.ligneEnTete + 1}).`;

        const details: string[] = [];
        if (sansFacteur) {
          details.push(`${sansFacteur} ligne(s) sans facteur applicable : émission à 0, à compléter`);
        }
        if (multimodal) {
          details.push(`${multimodal} acheminement(s) multimodaux valorisés sur le trajet dominant`);
        }
        if (resultat.rejets.length) {
          details.push(`${resultat.rejets.length} ligne(s) écartée(s) faute de donnée exploitable`);
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
      'Usine': e.etablissement,
      'N° Facture / Réf': e.numeroFacture,
      'Provenance': e.provenance,
      'Mode': e.modeTransport,
      'Transporteur': e.transporteur,
      'Destination / Pays': e.destination,
      'Client': e.client,
      'Poids (kg)': e.poidsKg,
      'Distance (km)': e.distanceKm,
      'Montant': e.montant,
      'Devise': e.devise,
      'Facteur': e.facteur,
      'Unite facteur': e.uniteFacteur,
      'Base appliquee': e.baseAppliquee,
      'Reference': e.reference,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Transport amont');
    XLSX.writeFile(classeur, `transport-amont-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Exposé au template pour nettoyer une saisie collée depuis Excel. */
  nettoyerNombre(valeur: unknown): number | null {
    return nombreTolerant(valeur);
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
        libelle: 'Poids transporté', icone: '🚚', accent: 'volume',
        valeur: (somme(e => (e.poidsKg ?? 0) / 1000)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
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
  get lignesVentilees(): EmissionTransport[] {
    const annee = new Date().getFullYear();

    return lignesVentileesPour<EmissionTransport>(this.dispatchStore, 'transport-amont', (ligne, rang) => ({
        id: -(rang + 1),
        scope: ligne.scope ?? 'SCOPE_3',
        categorie: 'transport-amont',
        etablissement: this.societeActiveLabel,
        reference: ligne.mainAccount || ligne.reference || 'VENT',
        numeroFacture: ligne.mainAccount || '',
        provenance: 'Excel',
        modeTransport: 'Non précisé' as any, transporteur: '', destination: '', client: '',
        poidsKg: null, distanceKm: null, typeFacteur: ligne.libelleFacteur,
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
        societeId: this.societeActiveId,
        creeLe: '',
        sourceData: SOURCE_VENTILATION
    }) as unknown as EmissionTransport);
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionTransport[] {
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
    const MARQUEUR = marqueurEcran('transport_amont');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionTransport>({
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

  // La reprise de l'échelle massique est jouée au démarrage de l'application
  // — voir core/migrations-demarrage. Elle vivait ici, donc ne se jouait que
  // si l'utilisateur ouvrait cet écran : qui consulte le bilan sans saisir
  // voyait un total faux indéfiniment.

  /** Intitulé du degré de rapprochement, pour l'infobulle du tableau. */
  libelleRapprochement(rapprochement: Rapprochement | null | undefined): string {
    return libelleRapprochement(rapprochement);
  }

}