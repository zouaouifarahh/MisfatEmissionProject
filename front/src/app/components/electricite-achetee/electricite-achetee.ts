import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { lireReferenceCarbone, lireCodeArticle } from '../../core/colonnes-identite';
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
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersMesure } from '../../shared/dispatch/adaptateurs-mesure';
import { emissionKg, quantiteVersUniteFacteur } from '../../core/unites-carbone';
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';
import { PerimetreOrganisation } from '../../core/perimetre';
import {
  perimetreOrganisation, trierParPerimetre
} from '../../shared/ui/perimetre-ecran';
import { MesuresServeurComponent } from '../../shared/ui/mesures-serveur';

/** Ligne de consommation d'électricité achetée. */
export interface EmissionElectricite {
  /** Code article de l'ERP, second degré de rapprochement. */
  codeArticle?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;
  emissionSource: string;
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
  /** Base documentaire du facteur retenu, telle que stockée en MSSQL. */
  databaseSource?: string;
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
}

/** Catégorie GHG du Scope 2 côté référentiel carbone. */
const MOTIF_CATEGORIE = /energy|electric/i;

/**
 * Postes retenus par cet écran.
 *
 * <p>La catégorie « Energy » regroupe en base l'électricité et les combustibles
 * (diesel, GPL, gaz naturel). Ces derniers relèvent de la combustion, traitée
 * par les écrans du Scope 1 : les mêler ici ferait compter deux fois la même
 * consommation.</p>
 */
const MOTIF_TYPE = /electric/i;

const CLE_STOCKAGE = 'listeEmissionsElectricite';

@Component({
  selector: 'app-electricite-achetee',
  standalone: true,
  imports: [MesuresServeurComponent, FiltreMasseComponent, KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './electricite-achetee.html',
  styleUrl: './electricite-achetee.css'
})
export class ElectriciteAcheteeComponent implements OnInit {

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

  listeEmissions: EmissionElectricite[] = [];
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

  /** Compte rendu de la migration d'appariement, distinct de l'avertissement. */
  messageMigration = '';
  /** Sources d'émission électriques distinctes. */
  sourcesDisponibles: string[] = [];
  /** Facteurs de la source choisie : plusieurs bases peuvent coexister. */
  facteursDeLaSource: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';

  /** Unités physiques admises pour l'électricité. */
  readonly unitesPhysiques = ['kWh', 'MWh'];

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    scope: 'SCOPE_2',
    categorie: 'Électricité achetée',
    etablissement: '',
    reference: '',
    emissionSource: '',
    typeDonnee: 'Physique' as 'Physique' | 'Monetaire',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: 'kWh',
    dateDebut: '',
    dateFin: '',
    hypothese: 'Réelle' as 'Estimation' | 'Réelle',
    descriptionHypothese: '',
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
      this.exerciceActif = filtre.year ?? null;
      this.majPerimetre();
    });
  }

  // ---------- Référentiel ----------

  private chargerFacteurs(): void {
    this.chargementFacteurs = true;
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = facteurs.filter(f =>
          f.scopeCode === 'SCOPE_2' && MOTIF_TYPE.test(f.typeName));

        // Le référentiel est là : les lignes déjà saisies peuvent être
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();

        this.sourcesDisponibles = [...new Set(this.facteursDisponibles.map(f => f.typeName))]
          .sort((a, b) => a.localeCompare(b));
        this.chargementFacteurs = false;

        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur électrique dans le référentiel carbone. '
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

  // ---------- Périmètre : sociétés et usines ----------

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = filiales;
        this.majPerimetre();
      },
      error: () => this.cdr.detectChanges()
    });
  }

  /** Aligne usines et devise sur la société sélectionnée dans l'en-tête. */
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

  get emissionsFiltrees(): EmissionElectricite[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.lignesDuPerimetre.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.emissionSource !== this.filtreMetier) return false;
      if (!provenanceRetenue(item, this.filtreProvenance)) return false;
      if (!statutRetenu(item, this.filtreStatut)) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (!terme) return true;
      return [item.emissionSource, item.etablissement, item.reference, item.databaseSource]
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

  // ---------- Modale de saisie ----------

  ouvrirModale(emission?: EmissionElectricite): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursDeLaSource = [];

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope,
        categorie: 'Électricité achetée',
        etablissement: emission.etablissement,
        reference: emission.reference,
        emissionSource: emission.emissionSource,
        typeDonnee: emission.typeDonnee,
        quantite: emission.quantite,
        facteur: emission.facteur,
        unite: emission.unite,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin,
        hypothese: emission.hypothese,
        descriptionHypothese: emission.descriptionHypothese ?? '',
        databaseSource: emission.databaseSource ?? ''
      };
      this.onSourceChange(emission.databaseSource);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_2',
        categorie: 'Électricité achetée',
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        reference: '',
        emissionSource: '',
        typeDonnee: 'Physique',
        quantite: null,
        facteur: null,
        unite: 'kWh',
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

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.cdr.detectChanges();
  }

  /**
   * Une source choisie : on rassemble ses facteurs, toutes bases confondues.
   *
   * @param sourcePreferee base à resélectionner en édition
   */
  onSourceChange(sourcePreferee?: string): void {
    const source = this.formModel.emissionSource;
    this.facteursDeLaSource = this.facteursDisponibles.filter(f => f.typeName === source);

    // `??` ne suffit pas : une chaîne vide n'est ni null ni undefined.
    const prefere = sourcePreferee
      ? this.facteursDeLaSource.find(f => f.databaseSource === sourcePreferee)
      : undefined;
    const retenu: FacteurDetaille | null = prefere ?? this.facteursDeLaSource[0] ?? null;

    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /** L'utilisateur tranche entre plusieurs bases pour une même source. */
  onBaseChange(): void {
    const retenu = this.facteursDeLaSource.find(f => f.databaseSource === this.formModel.databaseSource) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /**
   * Reporte le facteur retenu dans le formulaire.
   *
   * <p>L'unité suit le mode : en physique elle vient du référentiel (kWh), en
   * monétaire c'est la devise de la société active.</p>
   */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.databaseSource = '';
      this.formModel.unite = this.formModel.typeDonnee === 'Monetaire' ? this.deviseActive : 'kWh';
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
    this.formModel.unite = type === 'Monetaire'
      ? this.deviseActive
      : (this.facteurSelectionne?.unit ?? 'kWh');
    this.cdr.detectChanges();
  }

  /**
   * Émission de la saisie en cours, en kgCO₂e.
   *
   * <p>La conversion s'appuie sur l'unité que le facteur porte lui-même
   * ({@code FacteurDetaille.unit}), et non sur une unité présumée. Le calcul
   * tenait auparavant le référentiel pour toujours exprimé au kWh : un facteur
   * au MWh, associé à une saisie au MWh, subissait alors un « × 1 000 » que rien
   * ne justifiait — et l'empreinte ressortait mille fois trop lourde.</p>
   *
   * <p>En restitution monétaire, l'unité du facteur est une devise : la
   * conversion physique ne s'applique pas, et le change relève du serveur.</p>
   */
  get emissionPrevisionnelle(): number {
    const quantite = this.formModel.quantite ?? 0;
    const facteur = this.formModel.facteur ?? 0;

    if (this.formModel.typeDonnee === 'Monetaire') return quantite * facteur;

    // Une unité incompatible ne donne aucun chiffre : afficher un résultat que
    // la conversion refuse laisserait croire la saisie valide.
    if (this.erreurUnite) return 0;

    return emissionKg(quantite, this.formModel.unite, facteur, this.facteurSelectionne?.unit);
  }

  /**
   * Diagnostic de conversion entre l'unité saisie et celle du facteur.
   *
   * <p>Le contrôle est fait sur une quantité neutre, sans lever : ce libellé est
   * lu par le gabarit, et une exception dans un accesseur romprait la détection
   * de changement. La conversion réelle, elle, échoue franchement — c'est ce qui
   * doit empêcher l'enregistrement.</p>
   *
   * @returns le motif du refus, ou {@code null} quand les unités concordent.
   */
  get erreurUnite(): string | null {
    if (this.formModel.typeDonnee === 'Monetaire') return null;

    try {
      quantiteVersUniteFacteur(1, this.formModel.unite, this.facteurSelectionne?.unit);
      return null;
    } catch (erreur) {
      return (erreur as Error).message;
    }
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.emissionSource || m.quantite === null || m.facteur === null
        || !m.dateDebut || !m.dateFin) {
      this.erreurFormulaire = true;
      this.messageErreur = 'Usine, source, quantité et période sont obligatoires.';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      this.erreurFormulaire = true;
      this.messageErreur = 'La date de fin précède la date de début.';
      this.cdr.detectChanges();
      return;
    }
    // Enregistrer une ligne dont l'unité ne se convertit pas dans celle du
    // facteur reviendrait à inscrire au bilan un chiffre sans signification.
    const erreurUnite = this.erreurUnite;
    if (erreurUnite) {
      this.erreurFormulaire = true;
      this.messageErreur = `Unité incompatible avec le facteur retenu. ${erreurUnite}`;
      this.cdr.detectChanges();
      return;
    }

    const ligne: EmissionElectricite = {
      id: this.idEditionActive ?? Date.now(),
      scope: m.scope,
      categorie: m.categorie,
      etablissement: m.etablissement,
      reference: m.reference,
      emissionSource: m.emissionSource,
      typeDonnee: m.typeDonnee,
      quantite: m.quantite,
      facteur: m.facteur,
      unite: m.unite,
      dateDebut: m.dateDebut,
      dateFin: m.dateFin,
      emissionCalculee: this.emissionPrevisionnelle,
      hypothese: m.hypothese,
      descriptionHypothese: m.descriptionHypothese,
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

  private sauvegarder(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (!enregistrerLignes(CLE_STOCKAGE, this.listeEmissions)) throw new Error('stockage refuse');
    }
  }

  // ---------- Import / export Excel ----------

  private static readonly COLONNES_GABARIT = [
    'Usine', 'Source d emission', 'Reference', 'Base appliquee',
    'Type de donnees', 'Quantite', 'Unite', 'Date debut', 'Date fin', 'Hypothese'
  ] as const;

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
      ...colonnesIdentite('MS2ENEC', 'ELE-0001'),
      'Usine': this.usinesDisponibles[0]?.nom ?? 'MISFAT 1',
      'Source d emission': this.sourcesDisponibles[0] ?? 'Electricity consumption',
      'Reference': this.facteursDisponibles[0]?.referenceCode ?? 'MS2ENEC',
      'Base appliquee': this.facteursDisponibles[0]?.databaseSource ?? 'derived from UN 2024 and IPCC 2019',
      'Type de donnees': 'Physique',
      'Quantite': 125000,
      'Unite': 'kWh',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31',
      'Hypothese': 'Réelle'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple], {
      header: [...ElectriciteAcheteeComponent.COLONNES_GABARIT]
    });
    feuille['!cols'] = [22, 34, 14, 30, 16, 12, 10, 14, 14, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Electricite');
    XLSX.writeFile(classeur, 'gabarit-electricite-achetee.xlsx');
  }

  /**
   * Lecture du classeur déposé.
   *
   * <p>Le facteur n'est jamais lu du fichier : il est résolu depuis le
   * référentiel carbone d'après la source et la base indiquée.</p>
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
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        const ajoutees: EmissionElectricite[] = [];
        const erreurs: string[] = [];

        lignes.forEach((ligne, index) => {
          const valeur = (cle: string) => {
            const trouve = Object.keys(ligne).find(k => this.normaliser(k) === this.normaliser(cle));
            return trouve ? ligne[trouve] : null;
          };

          // Colonnes d'identité, aux intitulés que le modèle produit.
          const refClasseur = lireReferenceCarbone(ligne);
          const codeArticle = lireCodeArticle(ligne);

          const usine = String(valeur('Usine') ?? '').trim();
          const source = String(valeur('Source d emission') ?? '').trim();
          const base = String(valeur('Base appliquee') ?? '').trim();
          const quantite = Number(valeur('Quantite'));
          const typeDonnee = String(valeur('Type de donnees') ?? 'Physique').trim();
          const uniteLue = String(valeur('Unite') ?? 'kWh').trim();

          if (!usine || !source || !Number.isFinite(quantite)) {
            erreurs.push(`ligne ${index + 2} : usine, source ou quantité manquant`);
            return;
          }

          const candidats = this.facteursDisponibles.filter(f => f.typeName === source);

          // La référence du classeur désigne un facteur ; la source et la base
          // ne font qu'orienter. La première prime donc.
          const parReference = refClasseur
            ? this.facteursDisponibles.find(
                f => (f.referenceCode ?? '').trim().toUpperCase() === refClasseur.toUpperCase())
            : undefined;
          const facteur = parReference
            ?? (base && candidats.find(f => f.databaseSource === base))
            ?? candidats[0];
          if (!facteur) {
            erreurs.push(`ligne ${index + 2} : source « ${source} » absente du référentiel`);
            return;
          }

          const monetaire = /monet/i.test(typeDonnee);
          const unite = monetaire ? this.deviseActive : uniteLue;

          // L'unité du facteur fait foi : une colonne du classeur libellée au
          // MWh face à un facteur au MWh ne se convertit pas.
          const emission = monetaire
            ? quantite * facteur.factorValue
            : emissionKg(quantite, unite, facteur.factorValue, facteur.unit);

          ajoutees.push({
            id: Date.now() + index,
            codeArticle,
            scope: 'SCOPE_2',
            categorie: 'Électricité achetée',
            etablissement: usine,
            reference: facteur.referenceCode,
            emissionSource: source,
            typeDonnee: monetaire ? 'Monetaire' : 'Physique',
            quantite,
            facteur: facteur.factorValue,
            unite,
            dateDebut: this.texteDate(valeur('Date debut')),
            dateFin: this.texteDate(valeur('Date fin')),
            emissionCalculee: emission,
            hypothese: /estim/i.test(String(valeur('Hypothese') ?? '')) ? 'Estimation' : 'Réelle',
            societeId: this.societeActiveId,
            creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '',
            databaseSource: facteur.databaseSource
          });
        });

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.sauvegarder();

        this.importSuccesMsg = `${ajoutees.length} ligne(s) importée(s) sur ${lignes.length}.`;
        this.importErreurMsg = erreurs.length ? erreurs.slice(0, 5).join(' · ') : '';
        this.cdr.detectChanges();
      } catch {
        this.importErreurMsg = 'Fichier illisible : vérifiez qu\'il s\'agit bien d\'un classeur .xlsx.';
        this.cdr.detectChanges();
      }
    };
    lecteur.readAsArrayBuffer(this.fichierSelectionne);
  }

  private normaliser(valeur: string): string {
    return valeur
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
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
      'Source d emission': e.emissionSource,
      'Reference': e.reference,
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
    XLSX.utils.book_append_sheet(classeur, feuille, 'Electricite');
    XLSX.writeFile(classeur, `electricite-achetee-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        libelle: 'Électricité achetée', icone: '💡', accent: 'volume',
        valeur: (somme(e => e.quantite)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: uniteDominante(this.listeEmissions.map(e => e.unite), 'kWh')
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
  get lignesVentilees(): EmissionElectricite[] {
    return lignesVentileesPour<EmissionElectricite>(
      this.dispatchStore, 'electricite-achetee', (ligne, rang) => adapterVersMesure(ligne, rang, 'Électricité achetée', this.usineVentilation) as EmissionElectricite, this.usineVentilation
    );
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionElectricite[] {
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


  /**
   * Rejoue l'appariement sur les lignes déjà enregistrées.
   *
   * <p>Cet écran ne porte ni base documentaire ni unité de facteur : la
   * migration corrige la référence et le facteur, et laisse le reste tel quel
   * plutôt que d'inventer des champs que la ligne n'a pas.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('electricite_achetee');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionElectricite>({
        reference: 'reference',
        codeArticle: 'codeArticle',
        categorie: 'categorie',
        facteur: 'facteur',
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