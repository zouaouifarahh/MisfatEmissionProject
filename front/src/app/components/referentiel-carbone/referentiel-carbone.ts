import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { UNITES_PHYSIQUES, UNITES_MONETAIRES } from '../../shared/ui/unites-mesure';

export interface EmissionSource {
  id?: number;
  referenceCode: string;
  scope: string;
  category: string;
  sourceName: string;
  defaultUnit: string;
}

/**
 * Source en cours de saisie.
 *
 * <p>Elle porte un champ de plus que la source enregistrée : la nature de
 * l'unité. La base ne la stocke pas — l'unité elle-même la porte, « TND »
 * désignant un ratio monétaire aussi sûrement qu'un champ le déclarerait — et
 * l'ajouter à {@link EmissionSource} laisserait croire qu'elle est persistée.
 * Elle ne sert qu'à restreindre la liste proposée au formulaire.</p>
 */
interface SourceEnSaisie extends EmissionSource {
  typeUnite: 'PHYSIQUE' | 'MONETAIRE';
}

@Component({
  selector: 'app-referentiel-carbone',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './referentiel-carbone.html',
  styleUrls: ['./referentiel-carbone.css']
})
export class ReferentielCarboneComponent implements OnInit {

  private apiUrl = 'http://localhost:8082/api/emission-sources';

  sourcesToutes: EmissionSource[] = [];
  sourcesFiltrees: EmissionSource[] = [];

  selectedScopeTab: string = 'SCOPE_1';

  /** Filtre catégorie appliqué au tableau ; 'ALL' pour tout afficher. */
  selectedCategorie: string = 'ALL';
  recherche: string = '';

  /**
   * Catégories réellement présentes en base pour le scope actif.
   *
   * <p>La liste ne peut pas venir de {@link scopesData} : celle-ci porte des
   * libellés français figés, alors que la table contient les intitulés du
   * référentiel GHG (« Energy », « Category 2: Capital Goods »…). Un filtre
   * bâti sur les libellés figés ne remonterait jamais aucune ligne.</p>
   */
  categoriesTableau: string[] = [];
  isEditMode = false;

  // Gestion des Toasts (Alertes)
  toastMessage: string | null = null;
  toastType: 'success' | 'danger' | 'info' = 'success';
  private toastTimeout: any;

  // Gestion de la modale de confirmation de suppression
  showDeleteModal = false;
  sourceToDeleteId: number | null = null;

  // Formulaire
  nouvelleSource: SourceEnSaisie = {
    referenceCode: '',
    scope: 'SCOPE_1',
    category: '',
    sourceName: '',
    defaultUnit: 'kg',
    /**
     * Nature de l'unité : grandeur physique ou devise.
     *
     * <p>Aide de saisie, non enregistrée : la base ne connaît que l'unité, et
     * celle-ci porte déjà l'information — « TND » désigne un ratio monétaire
     * aussi sûrement qu'un champ le déclarerait. Ce sélecteur ne fait que
     * restreindre la liste proposée, pour qu'on ne cherche pas une devise parmi
     * les kilogrammes.</p>
     */
    typeUnite: 'PHYSIQUE' as 'PHYSIQUE' | 'MONETAIRE'
  };

  /**
   * Unités proposées, selon la nature retenue.
   *
   * <p>Les catégories monétaires du Scope 3 — achats, immobilisations,
   * investissements — se valorisent à la dépense : leurs sources doivent
   * pouvoir se libeller en dinars, et la liste n'offrait que des grandeurs
   * physiques. Une source d'achats était donc contrainte au kilogramme, ou
   * créée avec une unité qui ne la documente pas.</p>
   */
  unitesDuType: { valeur: string; libelle: string }[] = [];

  /**
   * Recompose la liste des unités proposées.
   *
   * <p>Champ et non accesseur : un accesseur aurait rendu un tableau neuf à
   * chaque cycle de rendu, et la boucle du gabarit l'aurait vu changer sans
   * fin — Angular s'arrête alors sur « détection de changements infinie ». La
   * liste ne dépend que de la nature retenue : elle est donc recalculée quand
   * celle-ci change, et à ce seul moment.</p>
   */
  private majUnitesProposees(): void {
    this.unitesDuType = this.nouvelleSource.typeUnite === 'MONETAIRE'
      ? UNITES_MONETAIRES.map(devise => ({
          valeur: devise, libelle: `${devise} (montant dépensé)`
        }))
      : UNITES_PHYSIQUES.flatMap(groupe =>
          groupe.unites.map(unite => ({
            valeur: unite, libelle: `${unite} — ${groupe.grandeur}`
          })));
  }

  /**
   * Accorde l'unité à la nature retenue.
   *
   * <p>Basculer en monétaire sans changer l'unité laisserait « kg » sur une
   * source qui se compte en dinars.</p>
   */
  onTypeUniteChange(): void {
    this.majUnitesProposees();

    if (!this.unitesDuType.some(u => u.valeur === this.nouvelleSource.defaultUnit)) {
      this.nouvelleSource.defaultUnit = this.unitesDuType[0]?.valeur ?? '';
    }
  }

  /** La nature d'une unité déjà enregistrée, déduite d'elle-même. */
  private typeDeLUnite(unite: string | null | undefined): 'PHYSIQUE' | 'MONETAIRE' {
    return UNITES_MONETAIRES.includes(String(unite ?? '').trim().toUpperCase())
      ? 'MONETAIRE'
      : 'PHYSIQUE';
  }

  scopesData = [
    {
      id: 'SCOPE_1',
      name: '🌱 Scope 1 · Direct',
      categories: [
        { id: 'combustion-etablissements', nom: 'Combustion dans les établissements', icone: '🏭' },
        { id: 'combustion-vehicules', nom: 'Combustion des véhicules', icone: '🚗' },
        { id: 'emissions-refrigerants', nom: 'Émissions de réfrigérants', icone: '❄️' }
      ]
    },
    {
      id: 'SCOPE_2',
      name: '⚡ Scope 2 · Indirect Énergie',
      categories: [
        { id: 'electricite-achetee', nom: 'Électricité achetée', icone: '💡' }
      ]
    },
    {
      id: 'SCOPE_3',
      name: '📦 Scope 3 · Chaîne de valeur',
      categories: [
        { id: 'biens-services', nom: 'Biens et services achetés', icone: '📦' },
        { id: 'biens-equipement', nom: 'Biens d\'équipement', icone: '🏗️' },
        { id: 'energie', nom: 'Activités liées à l\'énergie', icone: '⛽' },
        { id: 'transport-amont', nom: 'Transport en amont', icone: '🚚' },
        { id: 'dechets', nom: 'Déchets', icone: '🗑️' },
        { id: 'voyages-affaires', nom: 'Voyages d\'affaires', icone: '✈️' },
        { id: 'deplacements-employes', nom: 'Déplacements des employés', icone: '🚌' },
        { id: 'actifs-loues-amont', nom: 'Actifs loués en amont', icone: '🏢' },
        { id: 'transport-aval', nom: 'Transport en aval', icone: '🚛' },
        { id: 'transformation-produits', nom: 'Transformation des produits', icone: '🏭' },
        { id: 'utilisation-produits', nom: 'Utilisation des produits', icone: '🛒' },
        { id: 'fin-de-vie', nom: 'Fin de vie des produits', icone: '♻️' },
        { id: 'actifs-loues-aval', nom: 'Actifs loués en aval', icone: '🏢' },
        { id: 'franchises', nom: 'Franchises', icone: '🤝' },
        { id: 'investissements', nom: 'Investissements', icone: '💰' }
      ]
    }
  ];

  categoriesDisponibles: { id: string; nom: string; icone?: string }[] = [];

  scopeLabels: { [key: string]: string } = {
    SCOPE_1: 'Scope 1 · Direct',
    SCOPE_2: 'Scope 2 · Indirect Énergie',
    SCOPE_3: 'Scope 3 · Chaîne de valeur'
  };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.majUnitesProposees();
    this.syncFormWithActiveTab();
    this.chargerSources();
  }

  changerOngletScope(scope: string): void {
    this.selectedScopeTab = scope;
    this.majCategoriesTableau();
    this.filtrerTableau();
    if (!this.isEditMode) {
      this.syncFormWithActiveTab();
    }
    this.cdr.detectChanges();
  }

  private syncFormWithActiveTab(): void {
    this.nouvelleSource.scope = this.selectedScopeTab;
    const currentScopeObj = this.scopesData.find(s => s.id === this.selectedScopeTab);
    this.categoriesDisponibles = currentScopeObj ? currentScopeObj.categories : [];

    if (this.categoriesDisponibles.length > 0) {
      this.nouvelleSource.category = this.categoriesDisponibles[0].nom;
    } else {
      this.nouvelleSource.category = '';
    }
  }

  /** Casse, accents et espaces multiples neutralisés, pour rapprocher des graphies. */
  private normaliser(valeur: string | null | undefined): string {
    return (valeur ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Alias anglais des catégories de Scope 1 et 2 rencontrés dans le classeur
   * source, rapportés à l'identifiant de {@link scopesData}.
   *
   * <p>Le Scope 3 n'y figure pas : ses libellés portent leur numéro de catégorie
   * GHG, exploité directement par {@link categorieCanonique}.</p>
   */
  private readonly aliasCategories: { [cle: string]: string } = {
    'company owned cars': 'combustion-vehicules',
    'company owned vehicles': 'combustion-vehicules',
    'combustion des vehicules': 'combustion-vehicules',
    'mobile combustion': 'combustion-vehicules',
    'stationary combustion': 'combustion-etablissements',
    'combustion dans les etablissements': 'combustion-etablissements',
    'refrigerant gas loss and other fugitive emissions': 'emissions-refrigerants',
    'fugitive emissions': 'emissions-refrigerants',
    'purchased electricity': 'electricite-achetee',
    'electricite achetee': 'electricite-achetee'
  };

  /**
   * Catégorie de référence d'une source, sous son libellé métier.
   *
   * <p>La même catégorie arrive sous plusieurs graphies : le formulaire
   * enregistre le libellé français de {@link scopesData}
   * (« Investissements »), tandis que l'import reprend l'intitulé GHG du
   * classeur (« Category 15: Investments »). Filtrer sur les chaînes brutes
   * revenait donc à proposer plusieurs entrées pour une même catégorie, chacune
   * ne ramenant qu'une partie des lignes.</p>
   *
   * <p>Le rapprochement s'appuie sur le numéro de catégorie GHG lorsqu'il est
   * présent — seul repère univoque entre les deux nomenclatures — puis sur les
   * libellés connus. Un intitulé non reconnu est conservé tel quel : mieux vaut
   * une catégorie isolée qu'un rattachement arbitraire à une autre.</p>
   */
  private categorieCanonique(scope: string, brute: string | null | undefined): string {
    const libelle = (brute ?? '').trim();
    if (!libelle) return '';

    const cle = this.normaliser(libelle);

    // « Category 15: Investments » → 15ᵉ catégorie de la nomenclature Scope 3.
    const numeroGhg = /^category\s*(\d{1,2})\b/.exec(cle);
    if (numeroGhg) {
      const scope3 = this.scopesData.find(s => s.id === 'SCOPE_3');
      const categorie = scope3?.categories[Number(numeroGhg[1]) - 1];
      if (categorie) return categorie.nom;
    }

    const parAlias = this.aliasCategories[cle];
    if (parAlias) {
      const trouvee = this.scopesData
        .flatMap(s => s.categories)
        .find(c => c.id === parAlias);
      if (trouvee) return trouvee.nom;
    }

    // Libellé déjà conforme au référentiel interne, à la casse près.
    const connue = this.scopesData
      .flatMap(s => s.categories)
      .find(c => this.normaliser(c.nom) === cle || c.id === cle);

    return connue ? connue.nom : libelle;
  }

  /** Clé de comparaison stricte entre deux catégories. */
  private cleCategorie(scope: string, brute: string | null | undefined): string {
    return this.normaliser(this.categorieCanonique(scope, brute));
  }

  /**
   * Applique le filtrage strict scope → catégorie → recherche.
   *
   * <p>Une ligne n'est retenue que si elle appartient au scope de l'onglet actif
   * ET à la catégorie choisie : sélectionner « Scope 3 » puis « Investissements »
   * n'affiche que les sources de cette catégorie, à l'exclusion de toute autre.</p>
   */
  filtrerTableau(): void {
    const terme = this.recherche.trim().toLowerCase();
    const toutesCategories = this.selectedCategorie === 'ALL';
    const categorieCible = this.cleCategorie(this.selectedScopeTab, this.selectedCategorie);

    this.sourcesFiltrees = this.sourcesToutes.filter(s => {
      if (s.scope !== this.selectedScopeTab) return false;
      if (!toutesCategories && this.cleCategorie(s.scope, s.category) !== categorieCible) return false;
      if (!terme) return true;
      return [s.referenceCode, s.sourceName, s.category, s.defaultUnit]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });
  }

  /**
   * Recalcule les catégories proposées à partir des sources du scope actif.
   *
   * <p>Seules les catégories réellement présentes sont proposées, sous leur
   * libellé métier : le filtre ne peut donc pas aboutir à une sélection vide,
   * et les graphies équivalentes sont regroupées en une seule entrée.</p>
   */
  private majCategoriesTableau(): void {
    const parCle = new Map<string, string>();

    // La nomenclature du scope ouvre la liste, dans son ordre — de la catégorie
    // 1 à la 15. Le filtre ne proposait que les catégories déjà pourvues :
    // rechercher « Investissements » était impossible tant qu'aucune source n'y
    // figurait, alors que c'est précisément ce qu'on veut vérifier avant d'en
    // créer une. Un filtre qui ne rend rien est une réponse, pas une panne.
    const nomenclature = this.scopesData.find(s => s.id === this.selectedScopeTab);
    for (const categorie of nomenclature?.categories ?? []) {
      parCle.set(this.normaliser(categorie.nom), categorie.nom);
    }

    // Les catégories que la base porte sans que la nomenclature les prévoie
    // sont ajoutées ensuite : aucune source ne doit rester hors de portée du
    // filtre.
    for (const source of this.sourcesToutes) {
      if (source.scope !== this.selectedScopeTab || !source.category) continue;

      const libelle = this.categorieCanonique(source.scope, source.category);
      if (libelle) parCle.set(this.normaliser(libelle), libelle);
    }

    this.categoriesTableau = [...parCle.values()];

    // La catégorie retenue peut ne plus exister dans le scope choisi.
    const cible = this.cleCategorie(this.selectedScopeTab, this.selectedCategorie);
    const cibleToujoursPresente = this.categoriesTableau
      .some(c => this.normaliser(c) === cible);

    if (this.selectedCategorie !== 'ALL' && !cibleToujoursPresente) {
      this.selectedCategorie = 'ALL';
    }
  }

  onCategorieChange(): void {
    this.filtrerTableau();
    this.cdr.detectChanges();
  }

  onRechercheChange(): void {
    this.filtrerTableau();
    this.cdr.detectChanges();
  }

  reinitialiserFiltres(): void {
    this.selectedCategorie = 'ALL';
    this.recherche = '';
    this.filtrerTableau();
    this.cdr.detectChanges();
  }

  /** Libellé affiché dans le tableau, aligné sur celui proposé par le filtre. */
  getCategorieName(scope: string, catValue: string): string {
    return this.categorieCanonique(scope, catValue) || '—';
  }

  getScopeLabel(scope: string): string {
    return this.scopeLabels[scope] || scope;
  }

  getScopeBadgeClass(scope: string): string {
    if (scope === 'SCOPE_1') return 'scope-badge-1';
    if (scope === 'SCOPE_2') return 'scope-badge-2';
    return 'scope-badge-3';
  }

  chargerSources(): void {
    this.http.get<EmissionSource[]>(this.apiUrl).subscribe({
      next: (res) => {
        this.sourcesToutes = Array.isArray(res) ? res : [];
        this.majCategoriesTableau();
        this.filtrerTableau();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur chargement:', err);
        this.showToast('Impossible de charger le référentiel.', 'danger');
      }
    });
  }

  enregistrerSource(): void {
    const refCode = (this.nouvelleSource.referenceCode || '').trim();
    const sName = (this.nouvelleSource.sourceName || '').trim();

    if (!refCode || !sName) {
      this.showToast('Merci de remplir le code référence et le nom de la source.', 'danger');
      return;
    }

    const payload: EmissionSource = {
      referenceCode: refCode,
      scope: this.selectedScopeTab,
      category: this.nouvelleSource.category,
      sourceName: sName,
      defaultUnit: this.nouvelleSource.defaultUnit || 'kg'
    };

    if (this.isEditMode && this.nouvelleSource.id) {
      payload.id = this.nouvelleSource.id;

      this.http.put<EmissionSource>(`${this.apiUrl}/${this.nouvelleSource.id}`, payload).subscribe({
        next: () => {
          this.showToast('Source modifiée avec succès !', 'success');
          this.reinitialiserFormulaire();
          this.chargerSources();
        },
        error: (err) => {
          console.error('Erreur modification:', err);
          this.showToast('Échec de la modification sur le serveur.', 'danger');
        }
      });
    } else {
      this.http.post<EmissionSource>(this.apiUrl, payload).subscribe({
        next: () => {
          this.showToast('Source ajoutée avec succès !', 'success');
          this.reinitialiserFormulaire();
          this.chargerSources();
        },
        error: (err) => {
          console.error('Erreur ajout:', err);
          this.showToast('Échec de l\'ajout. Le Code Réf existe peut-être déjà.', 'danger');
        }
      });
    }
  }

  editerSource(source: EmissionSource): void {
    this.isEditMode = true;
    this.selectedScopeTab = source.scope;

    const currentScopeObj = this.scopesData.find(s => s.id === source.scope);
    this.categoriesDisponibles = currentScopeObj ? currentScopeObj.categories : [];

    // La catégorie stockée peut porter l'intitulé GHG du classeur, absent de la
    // liste du formulaire : on la ramène au libellé métier pour que le <select>
    // s'ouvre sur la bonne valeur au lieu de paraître vide.
    const canonique = this.categorieCanonique(source.scope, source.category);
    const proposee = this.categoriesDisponibles.some(c => c.nom === canonique)
      ? canonique
      : (this.categoriesDisponibles[0]?.nom ?? '');

    // La nature de l'unité se déduit de l'unité elle-même : la base ne la
    // stocke pas, et « TND » désigne un ratio monétaire aussi sûrement qu'un
    // champ le déclarerait. Sans cela, rouvrir une source en dinars aurait
    // affiché la liste des grandeurs physiques, et son unité aurait paru vide.
    this.nouvelleSource = {
      ...source,
      category: proposee,
      typeUnite: this.typeDeLUnite(source.defaultUnit)
    };
    this.majUnitesProposees();
    this.majCategoriesTableau();
    this.filtrerTableau();
    this.cdr.detectChanges();
  }

  annulerEdition(): void {
    this.reinitialiserFormulaire();
  }

  // --- NOUVELLE GESTION DE SUPPRESSION AVEC MODALE PRO---
  demanderSuppression(id?: number): void {
    if (!id) return;
    this.sourceToDeleteId = id;
    this.showDeleteModal = true;
    this.cdr.detectChanges();
  }

  annulerSuppression(): void {
    this.showDeleteModal = false;
    this.sourceToDeleteId = null;
    this.cdr.detectChanges();
  }

  confirmerSuppression(): void {
    if (!this.sourceToDeleteId) return;

    const id = this.sourceToDeleteId;
    this.annulerSuppression();

    this.http.delete(`${this.apiUrl}/${id}`).subscribe({
      next: () => {
        this.showToast('Source supprimée avec succès.', 'info');
        this.chargerSources();
      },
      error: (err) => {
        console.error('Erreur suppression:', err);
        this.showToast('Échec de la suppression.', 'danger');
      }
    });
  }

  private reinitialiserFormulaire(): void {
    this.isEditMode = false;
    this.nouvelleSource = {
      referenceCode: '',
      scope: this.selectedScopeTab,
      category: '',
      sourceName: '',
      defaultUnit: 'kg',
      typeUnite: 'PHYSIQUE'
    };
    this.majUnitesProposees();
    this.syncFormWithActiveTab();
    this.cdr.detectChanges();
  }

  showToast(message: string, type: 'success' | 'danger' | 'info'): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastMessage = message;
    this.toastType = type;
    this.cdr.detectChanges();

    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.detectChanges();
    }, 3500);
  }
}