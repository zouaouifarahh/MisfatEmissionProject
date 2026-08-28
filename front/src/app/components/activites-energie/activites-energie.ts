import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
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
import { enregistrerLignes } from '../../shared/dispatch/mesures-locales';

/** Ligne d'activité liée à l'énergie, catégorie 3 du Scope 3. */
export interface EmissionEnergie {
  /** Code article de l'ERP, second degré de rapprochement. */
  codeArticle?: string;
  /** Degré qui a désigné le facteur, ou null si la ligne reste orpheline. */
  rapprochement?: Rapprochement | null;
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;
  /** Type d'énergie ou de combustible : c'est lui qui porte le facteur. */
  typeEnergie: string;
  /** Repère d'exploitation libre : « Groupe électrogène A », « Pertes transformateur ». */
  etiquette: string;
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
  creeLe: string;
  databaseSource?: string;
}

/**
 * Catégorie GHG couverte : activités liées à l'énergie (amont des combustibles,
 * pertes de transport et de distribution).
 *
 * <p>Le motif ne retient que la catégorie 3 du référentiel. Les facteurs de
 * combustion directe, classés sous « Energy », en sont exclus : ils relèvent des
 * Scopes 1 et 2 et feraient double emploi ici.</p>
 */
const MOTIF_CATEGORIE = /^Category 3:/i;

const CLE_STOCKAGE = 'listeEmissionsEnergie';

/** Libellé métier de la catégorie, repris tel quel par le tableau de bord. */
const LIBELLE_CATEGORIE = 'Activités liées à l\'énergie';

@Component({
  selector: 'app-activites-energie',
  standalone: true,
  imports: [FiltreMasseComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './activites-energie.html',
  styleUrl: './activites-energie.css'
})
export class ActivitesEnergieComponent implements OnInit {

  listeEmissions: EmissionEnergie[] = [];
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
  /** Types d'énergie documentés, alimentant l'autocomplétion. */
  typesEnergie: string[] = [];
  /** Facteurs du type d'énergie retenu, une entrée par base documentaire. */
  facteursDuType: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';
  avertissementStockage = '';

  // ---------- Autocomplétion du type d'énergie ----------
  rechercheEnergie = '';
  suggestionsOuvertes = false;

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';

  formModel = {
    scope: 'SCOPE_3',
    categorie: LIBELLE_CATEGORIE,
    etablissement: '',
    reference: '',
    typeEnergie: '',
    etiquette: '',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: '',
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
        // rapprochées à nouveau de leur facteur officiel.
        this.remigrerParReferentiel();
        this.typesEnergie = [...new Set(facteurs.map(f => f.typeName))]
          .sort((a, b) => a.localeCompare(b, 'fr'));
        this.chargementFacteurs = false;

        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur de catégorie 3 dans le référentiel carbone. '
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
   * Forme comparable d'un libellé.
   *
   * <p>Les relevés d'exploitation et le référentiel divergent sur la casse, les
   * accents et la ponctuation. Comparer les chaînes brutes laisserait ces lignes
   * sans facteur.</p>
   */
  private normaliser(valeur: string): string {
    return (valeur ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // ---------- Autocomplétion ----------

  /** Types proposés à la frappe ; la liste entière tant que rien n'est saisi. */
  get suggestionsEnergie(): string[] {
    const terme = this.normaliser(this.rechercheEnergie);
    if (!terme) return this.typesEnergie;
    return this.typesEnergie.filter(t => this.normaliser(t).includes(terme));
  }

  ouvrirSuggestions(): void {
    this.suggestionsOuvertes = true;
    this.cdr.detectChanges();
  }

  /**
   * Ferme le panneau lorsque le champ perd réellement le focus.
   *
   * <p>La sélection d'une suggestion n'emprunte pas ce chemin : elle est câblée
   * sur {@code mousedown}, qui neutralise le {@code blur}. Aucune fermeture
   * différée n'est donc nécessaire.</p>
   */
  fermerSuggestions(): void {
    this.suggestionsOuvertes = false;
    this.cdr.detectChanges();
  }

  /**
   * Frappe au clavier dans le champ.
   *
   * <p>Une saisie qui tombe exactement sur un type documenté vaut sélection : le
   * facteur est résolu sans attendre un clic. Toute autre frappe invalide le
   * facteur, faute de quoi un libellé retouché conserverait le facteur du type
   * précédemment retenu.</p>
   */
  onRechercheEnergie(): void {
    this.suggestionsOuvertes = true;

    const exact = this.typesEnergie.find(t => this.normaliser(t) === this.normaliser(this.rechercheEnergie));
    if (exact) {
      this.formModel.typeEnergie = exact;
      this.onTypeEnergieChange();
      return;
    }

    this.formModel.typeEnergie = '';
    this.facteursDuType = [];
    this.appliquerFacteur(null);
    this.cdr.detectChanges();
  }

  /**
   * Retient une suggestion et reporte aussitôt le facteur complet.
   *
   * <p>Câblée sur {@code mousedown} et non sur {@code click} : le {@code blur}
   * du champ précède le {@code click} et fermerait le panneau avant que la
   * sélection ne soit enregistrée. {@code preventDefault()} empêche en outre le
   * champ de perdre le focus, de sorte que la fermeture reste pilotée ici.</p>
   */
  choisirEnergie(type: string, evenement?: MouseEvent): void {
    evenement?.preventDefault();

    this.formModel.typeEnergie = type;
    this.rechercheEnergie = type;
    this.suggestionsOuvertes = false;
    this.onTypeEnergieChange();
  }

  /** Le total prévisionnel suit la frappe : quantité × facteur. */
  onQuantiteChange(): void {
    this.cdr.detectChanges();
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
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarder();
  }

  get emissionsFiltrees(): EmissionEnergie[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.typeEnergie !== this.filtreMetier) return false;
      if (this.filtreEtablissement !== 'Tous' && item.etablissement !== this.filtreEtablissement) {
        return false;
      }
      if (!terme) return true;
      return [item.typeEnergie, item.etiquette, item.etablissement, item.reference, item.databaseSource]
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
    this.filtreEtablissement = 'Tous';
    this.rechercheTexte = '';
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionEnergie): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursDuType = [];
    this.suggestionsOuvertes = false;

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope,
        categorie: LIBELLE_CATEGORIE,
        etablissement: emission.etablissement,
        reference: emission.reference,
        typeEnergie: emission.typeEnergie,
        etiquette: emission.etiquette,
        quantite: emission.quantite,
        facteur: emission.facteur,
        unite: emission.unite,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin,
        hypothese: emission.hypothese,
        databaseSource: emission.databaseSource ?? ''
      };
      this.rechercheEnergie = emission.typeEnergie;
      this.onTypeEnergieChange(emission.databaseSource);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_3',
        categorie: LIBELLE_CATEGORIE,
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        reference: '',
        typeEnergie: '',
        etiquette: '',
        quantite: null,
        facteur: null,
        unite: '',
        dateDebut: '',
        dateFin: '',
        hypothese: 'Réelle',
        databaseSource: ''
      };
      this.rechercheEnergie = '';
    }

    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void {
    this.modaleSaisieOuverte = false;
    this.suggestionsOuvertes = false;
    this.cdr.detectChanges();
  }

  /**
   * Le type d'énergie détermine le facteur applicable.
   *
   * <p>Un même combustible peut être documenté par plusieurs bases : la première
   * est retenue par défaut, l'utilisateur pouvant lui préférer une autre.</p>
   */
  onTypeEnergieChange(sourcePreferee?: string): void {
    const cible = this.normaliser(this.formModel.typeEnergie);
    this.facteursDuType = this.facteursDisponibles.filter(f => this.normaliser(f.typeName) === cible);

    const prefere = sourcePreferee
      ? this.facteursDuType.find(f => f.databaseSource === sourcePreferee)
      : undefined;
    const retenu: FacteurDetaille | null = prefere ?? this.facteursDuType[0] ?? null;

    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  onBaseChange(): void {
    const retenu = this.facteursDuType.find(f => f.databaseSource === this.formModel.databaseSource) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /** Reporte le facteur retenu : référence, valeur, unité et base documentaire. */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.databaseSource = '';
      this.formModel.unite = '';
      return;
    }

    this.formModel.reference = facteur.referenceCode;
    this.formModel.facteur = facteur.factorValue;
    this.formModel.databaseSource = facteur.databaseSource;
    this.formModel.unite = facteur.unit;
  }

  get emissionPrevisionnelle(): number {
    return (this.formModel.quantite ?? 0) * (this.formModel.facteur ?? 0);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.typeEnergie || m.quantite === null || m.facteur === null
        || !m.dateDebut || !m.dateFin) {
      this.erreurFormulaire = true;
      this.messageErreur = this.rechercheEnergie && !m.typeEnergie
        ? 'Type d\'énergie inconnu du référentiel : choisissez une proposition de la liste.'
        : 'Usine, type d\'énergie, quantité et période sont obligatoires.';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      this.erreurFormulaire = true;
      this.messageErreur = 'La date de fin précède la date de début.';
      this.cdr.detectChanges();
      return;
    }

    const ligne: EmissionEnergie = {
      id: this.idEditionActive ?? Date.now(),
      scope: m.scope,
      categorie: m.categorie,
      etablissement: m.etablissement,
      reference: m.reference,
      typeEnergie: m.typeEnergie,
      etiquette: m.etiquette.trim(),
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
   * <p>Un relevé énergétique mensuel par usine reste modeste, mais l'import d'un
   * historique complet peut dépasser le quota du navigateur. Sans ce garde,
   * l'écriture échouerait en silence.</p>
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
        + 'filtrez les relevés par usine ou par période avant import.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Import des relevés énergétiques ----------

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
    const typeExemple = this.typesEnergie[0]
      ?? 'Electricity grid, T&D losses, upstream emissions';

    const exemple: Record<string, string | number> = {
      // Colonnes d'identité, aux intitulés que les parseurs reconnaissent.
      ...colonnesIdentite('MS3C3FE', 'ENE-0007'),
      'Usine': this.usinesDisponibles[0]?.nom ?? 'MISFAT 1',
      'Type energie': typeExemple,
      'Etiquette': 'Pertes transformateur poste HT',
      'Quantité': 125000,
      'Unité': 'KWh',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [20, 46, 30, 14, 10, 14, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Energie');
    XLSX.writeFile(classeur, 'gabarit-activites-energie.xlsx');
  }

  /**
   * Lecture d'un relevé énergétique.
   *
   * <p>Le facteur et son unité sont résolus depuis le type d'énergie, jamais lus
   * du fichier : une unité saisie à la main ne peut pas contredire celle du
   * référentiel.</p>
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
        const feuille = classeur.Sheets['Sheet1'] ?? classeur.Sheets[classeur.SheetNames[0]];
        let lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        if (lignes.length && !this.contientColonne(lignes[0], 'Type energie')) {
          lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null, range: 1 });
        }

        const ajoutees: EmissionEnergie[] = [];
        const sansFacteur = new Set<string>();
        let ignorees = 0;

        lignes.forEach((ligne, index) => {
          const valeur = (cle: string) => {
            const trouve = Object.keys(ligne).find(k => this.normaliser(k) === this.normaliser(cle));
            return trouve ? ligne[trouve] : null;
          };

          // Colonnes d'identité, aux intitulés que le modèle produit.
          const refClasseur = lireReferenceCarbone(ligne);
          const codeArticle = lireCodeArticle(ligne);

          const type = String(valeur('Type energie') ?? '').trim();
          const etiquette = String(valeur('Etiquette') ?? '').trim();
          if (!type) { ignorees++; return; }

          const candidats = this.facteursDisponibles
            .filter(f => this.normaliser(f.typeName) === this.normaliser(type));
          if (!candidats.length) { sansFacteur.add(type); return; }

          // La référence du classeur désigne un facteur ; le libellé ne fait
          // qu'orienter vers une famille. La première prime donc.
          const parReference = refClasseur
            ? this.facteursDisponibles.find(
                f => (f.referenceCode ?? '').trim().toUpperCase() === refClasseur.toUpperCase())
            : undefined;
          const facteur = parReference ?? candidats[0];
          const quantite = Number(valeur('Quantité'));
          if (!Number.isFinite(quantite)) { ignorees++; return; }

          ajoutees.push({
            id: Date.now() + index,
            codeArticle,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            etablissement: String(valeur('Usine') ?? this.usinesDisponibles[0]?.nom ?? '').trim(),
            reference: facteur.referenceCode,
            typeEnergie: facteur.typeName,
            etiquette,
            quantite,
            facteur: facteur.factorValue,
            unite: facteur.unit,
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
          details.push(`${sansFacteur.size} type(s) sans facteur : ${[...sansFacteur].slice(0, 4).join(', ')}`);
        }
        if (ignorees) details.push(`${ignorees} ligne(s) sans type d'énergie ou sans quantité exploitable`);
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
      'Type energie': e.typeEnergie,
      'Etiquette': e.etiquette,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Facteur': e.facteur,
      'Base appliquee': e.databaseSource ?? '',
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin,
      'Hypothese': e.hypothese
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Energie');
    XLSX.writeFile(classeur, `activites-energie-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Rejoue l'appariement sur les lignes déjà enregistrées.
   *
   * <p>Cet écran ne porte ni base documentaire ni unité de facteur : la
   * migration corrige la référence et le facteur, et laisse le reste tel quel
   * plutôt que d'inventer des champs que la ligne n'a pas.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('activites_energie');
    if (migrationFaite(MARQUEUR)) return;
    if (!this.facteursDisponibles.length || !this.listeEmissions.length) return;

    const { lignes, corrigees } = remigrerLignes(
      this.listeEmissions,
      this.facteursDisponibles,
      adaptateurStandard<EmissionEnergie>({
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