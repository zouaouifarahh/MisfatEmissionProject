import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FiltreMasseComponent } from '../../shared/ui/filtre-masse';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { marqueurEcran } from '../../core/appariement-referentiel';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';

/** Ligne d'acquisition de bien d'équipement, catégorie 2 du Scope 3. */
export interface EmissionBienEquipement {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  reference: string;
  /** Catégorie Carbone de l'équipement : c'est elle qui porte le facteur. */
  categorieCarbone: string;
  /**
   * Code article de l'ERP, tel que le registre d'immobilisations le porte.
   *
   * <p>Il identifie la pièce dans le système de gestion — « 37M360047 »,
   * « 29.55.498G » — là où la référence carbone identifie le facteur. Les deux
   * doivent figurer au tableau : l'un permet à un comptable de retrouver la
   * ligne, l'autre à un vérificateur de retrouver le facteur.</p>
   */
  codeArticle?: string;
  /**
   * Comment le facteur a été rattaché à la ligne.
   *
   * <p>Un rapprochement par référence carbone est exact ; un rapprochement par
   * libellé de catégorie est une interprétation. La distinction doit rester
   * visible, sans quoi les deux se lisent avec la même confiance.</p>
   */
  rapprochement?: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE';
  /** Modèle ou marque de l'immobilisation : identifie la ligne sans influer sur le calcul. */
  etiquette: string;
  typeDonnee: 'Physique' | 'Monetaire';
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

/** Catégorie GHG couverte : biens d'équipement (Capital Goods). */
const MOTIF_CATEGORIE = /^Category 2:/i;

const CLE_STOCKAGE = 'listeEmissionsBiensEquipement';

/** Libellé métier de la catégorie, repris tel quel par le tableau de bord. */
const LIBELLE_CATEGORIE = 'Biens d\'équipement';

@Component({
  selector: 'app-biens-equipement',
  standalone: true,
  imports: [FiltreMasseComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './biens-equipement.html',
  styleUrl: './biens-equipement.css'
})
export class BiensEquipementComponent implements OnInit {

  listeEmissions: EmissionBienEquipement[] = [];
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
  /** Catégories d'équipement documentées par le référentiel. */
  categoriesCarbone: string[] = [];
  /** Facteurs de la catégorie choisie, restreints au mode de valorisation. */
  facteursDeLaCategorie: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';

  /** Compte rendu du re-rapprochement des lignes existantes, s'il a eu lieu. */
  messageMigration = '';
  /** Renseigné quand la catégorie ne documente pas le mode demandé. */
  avertissementMode = '';
  /** Renseigné quand le stockage local a refusé le volume importé. */
  avertissementStockage = '';

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
    categorie: LIBELLE_CATEGORIE,
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
        // rapprochées à nouveau. La migration attend ce moment, faute de quoi
        // elle rejouerait l'appariement sur une liste de facteurs vide.
        this.remigrerParReferentiel();
        this.categoriesCarbone = [...new Set(facteurs.map(f => f.typeName))]
          .sort((a, b) => a.localeCompare(b, 'fr'));
        this.chargementFacteurs = false;

        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Aucun facteur de biens d\'équipement dans le référentiel carbone. '
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
   * Rattache une ligne du registre à son facteur, par ordre de certitude.
   *
   * <p>Trois degrés, du plus sûr au plus interprétatif :</p>
   * <ol>
   *   <li><strong>Référence carbone</strong> — « MS3C2ACW » : le registre
   *       désigne exactement le facteur à appliquer, il n'y a rien à deviner ;</li>
   *   <li><strong>Code article ERP</strong> — le code de gestion, lorsqu'il a
   *       été rapproché d'une référence dans le référentiel ;</li>
   *   <li><strong>Catégorie carbone</strong> — le libellé, rapproché à la casse
   *       et aux accents près. C'est une interprétation, et le tableau le dit.</li>
   * </ol>
   *
   * <p>Aucun repli générique n'est appliqué ici : une ligne qu'aucun de ces
   * trois degrés ne rattache est signalée à l'utilisateur plutôt que valorisée
   * avec un facteur qui ne la documente pas.</p>
   *
   * @returns le facteur retenu et le degré qui l'a désigné, ou `null`.
   */
  private apparier(referenceCarbone: string, codeArticle: string, categorie: string):
    { facteur: FacteurDetaille; rapprochement: 'REFERENCE' | 'CODE_ARTICLE' | 'CATEGORIE' } | null {

    // 1. Référence carbone : correspondance exacte, casse et espaces ignorés.
    if (referenceCarbone) {
      const cible = referenceCarbone.trim().toUpperCase();
      const exact = this.facteursDisponibles
        .find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
      if (exact) return { facteur: exact, rapprochement: 'REFERENCE' };
    }

    // 2. Code article ERP : le référentiel le porte sur certaines références.
    if (codeArticle) {
      const cible = codeArticle.trim().toUpperCase();
      const parArticle = this.facteursDisponibles
        .find(f => (f.referenceCode ?? '').trim().toUpperCase() === cible);
      if (parArticle) return { facteur: parArticle, rapprochement: 'CODE_ARTICLE' };
    }

    // 3. Libellé de catégorie : dernier recours, et le moins sûr.
    if (categorie) {
      const parCategorie = this.facteursDisponibles
        .find(f => this.normaliser(f.typeName) === this.normaliser(categorie));
      if (parCategorie) return { facteur: parCategorie, rapprochement: 'CATEGORIE' };
    }

    return null;
  }

  /**
   * Rejoue l'appariement sur les lignes déjà enregistrées.
   *
   * <p>Les lignes saisies avant l'introduction de {@link apparier} ont été
   * rattachées au premier facteur d'une catégorie, quand elles ne sont pas
   * restées sur un repli. Cette migration les confronte à nouveau au
   * référentiel : une ligne qui porte sa référence carbone retrouve son facteur
   * exact et sa base documentaire réelle.</p>
   *
   * <p>Elle ne touche que ce qui s'améliore : une ligne qu'aucun degré ne
   * rattache est laissée telle quelle plutôt que vidée de son facteur. Le
   * marqueur empêche que la migration se rejoue à chaque chargement.</p>
   */
  private remigrerParReferentiel(): void {
    const MARQUEUR = marqueurEcran('biens_equipement');
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

      // Rien à écrire si le facteur retenu est déjà celui qui vaut.
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
      // Message distinct de `avertissementReferentiel` : celui-ci est réécrit
      // juste après par le chargement du référentiel, et l'effacerait.
      this.messageMigration = `${corrigees} ligne(s) ont été rapprochées à nouveau du `
        + `référentiel : facteur et base documentaire mis à jour.`;
    }

    try {
      localStorage.setItem(MARQUEUR, 'fait');
    } catch (erreur) {
      console.error('[biens-équipement] Marqueur de migration non persisté', erreur);
    }

    this.cdr.detectChanges();
  }

  /** Libellé du degré de rapprochement, pour le tableau. */
  libelleRapprochement(ligne: EmissionBienEquipement): string {
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
   * <p>Le registre des immobilisations et le référentiel divergent sur la casse,
   * les accents et la ponctuation. Comparer les chaînes brutes laisserait ces
   * lignes sans facteur.</p>
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
    this.listeEmissions = this.listeEmissions.map(l => reprises.get(l) ?? l) as any;
    this.sauvegarder();
  }

  get emissionsFiltrees(): EmissionBienEquipement[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      // Filtre métier : le critère que cet écran documente.
      if (this.filtreMetier !== 'Tous' && item.categorieCarbone !== this.filtreMetier) return false;
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
    this.filtreEtablissement = 'Tous';
    this.rechercheTexte = '';
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionBienEquipement): void {
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
        categorie: LIBELLE_CATEGORIE,
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
        categorie: LIBELLE_CATEGORIE,
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
   * La catégorie d'équipement détermine le facteur applicable.
   *
   * <p>Un même équipement peut être documenté en monétaire et en physique : on ne
   * retient que les facteurs du mode courant, faute de quoi un facteur exprimé
   * par dinar investi s'appliquerait à un nombre de machines.</p>
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
        `Cet équipement n'est documenté qu'en mode ${autre}. Basculez le type de données.`;
    } else if (!memeCategorie.length && this.formModel.categorieCarbone) {
      this.avertissementMode =
        'Aucun facteur pour cet équipement dans le référentiel carbone.';
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
   * <p>L'unité vient du référentiel en mode physique (unité, kg, m²) et de la
   * société active en mode monétaire.</p>
   */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.databaseSource = '';
      this.formModel.unite = this.formModel.typeDonnee === 'Monetaire' ? this.deviseActive : 'unité';
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
      this.messageErreur = 'Usine, catégorie d\'équipement, quantité et période sont obligatoires.';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      this.erreurFormulaire = true;
      this.messageErreur = 'La date de fin précède la date de début.';
      this.cdr.detectChanges();
      return;
    }

    const ligne: EmissionBienEquipement = {
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
   * <p>Un registre d'immobilisations complet dépasse les quelques mégaoctets
   * qu'accorde le navigateur. Sans ce garde, un import échouerait en silence sur
   * une exception de quota. L'utilisateur est averti et invité à restreindre le
   * périmètre.</p>
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
        + 'filtrez le registre des immobilisations par usine ou par période avant import.';
      this.cdr.detectChanges();
    }
  }

  // ---------- Import du registre des immobilisations ----------

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
    // Colonnes reprises du registre des immobilisations, dans leurs intitulés d'origine.
    const exemple: Record<string, string | number> = {
      'Usine': this.usinesDisponibles[0]?.nom ?? 'MISFAT 1',
      'Modele / Marque': 'Presse hydraulique SCHULER PH-250',
      // Colonnes lues par l'importeur : la référence désigne le facteur, le
      // code article identifie la pièce dans l'ERP.
      'Référence Carbone': 'MS3C2ACW',
      'Code Article ERP': 'EQ-00312',
      'Catégorie Carbone': this.categoriesCarbone[0] ?? 'Industrial Machinery Manufacturing',
      'Quantité': 1,
      'Valeur d\'acquisition en TND': 185000,
      'Unité': 'unité',
      'Devise': 'TND',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple]);
    feuille['!cols'] = [20, 34, 44, 12, 24, 10, 10, 14, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Immobilisations');
    XLSX.writeFile(classeur, 'gabarit-biens-equipement.xlsx');
  }

  /**
   * Lecture du registre des immobilisations.
   *
   * <p>Le facteur est résolu depuis la Catégorie Carbone, jamais lu du fichier.
   * Le mode de valorisation suit ce que documente le référentiel : une catégorie
   * dont le facteur est exprimé par dinar est valorisée sur la valeur
   * d'acquisition, celle exprimée par unité sur la quantité acquise.</p>
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
        // Les exports comptables placent parfois leurs en-têtes en deuxième ligne.
        const feuille = classeur.Sheets['Sheet1'] ?? classeur.Sheets[classeur.SheetNames[0]];
        let lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        if (lignes.length && !this.contientColonne(lignes[0], 'Catégorie Carbone')) {
          lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null, range: 1 });
        }

        const ajoutees: EmissionBienEquipement[] = [];
        const sansFacteur = new Set<string>();
        let ignorees = 0;

        lignes.forEach((ligne, index) => {
          const valeur = (cle: string) => {
            const trouve = Object.keys(ligne).find(k => this.normaliser(k) === this.normaliser(cle));
            return trouve ? ligne[trouve] : null;
          };

          const categorie = String(valeur('Catégorie Carbone') ?? '').trim();
          const etiquette = String(valeur('Modele / Marque') ?? valeur('Designation') ?? '').trim();
          const codeArticle = String(
            valeur('Code Article ERP') ?? valeur('Code Article') ?? valeur('Code article') ?? ''
          ).trim();
          const referenceLue = String(
            valeur('Référence Carbone') ?? valeur('Reference Carbone') ?? valeur('Référence') ?? ''
          ).trim();

          // Le rapprochement suit trois degrés de certitude décroissante. Une
          // ligne qui porte sa référence carbone n'a pas à être devinée depuis
          // son libellé : la référence prime sur tout le reste.
          const apparie = this.apparier(referenceLue, codeArticle, categorie);
          if (!apparie) {
            sansFacteur.add(referenceLue || categorie || codeArticle || '(ligne sans repère)');
            return;
          }

          const { facteur, rapprochement } = apparie;
          const monetaire = facteur.dataType.toUpperCase() === 'MONETAIRE';

          const valeurAcquisition = Number(valeur('Valeur d\'acquisition en TND'));
          const quantiteAcquise = Number(valeur('Quantité'));
          const quantite = monetaire ? valeurAcquisition : quantiteAcquise;
          if (!Number.isFinite(quantite)) { ignorees++; return; }

          ajoutees.push({
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
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
        if (ignorees) details.push(`${ignorees} ligne(s) sans catégorie ou sans valeur exploitable`);
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
      'Equipement / Categorie': e.categorieCarbone,
      'Etiquette (modele / marque)': e.etiquette,
      'Type de donnees': e.typeDonnee,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Facteur utilise': e.facteur,
      'Emissions (kgCO2e)': e.emissionCalculee,
      'Base appliquee': e.databaseSource ?? '',
      'Date debut': e.dateDebut,
      'Date fin': e.dateFin,
      'Hypothese': e.hypothese
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Immobilisations');
    XLSX.writeFile(classeur, `biens-equipement-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
