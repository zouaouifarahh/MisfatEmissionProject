import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface EmissionFactor {
  id?: number;
  category: string;
  sourceName: string;
  databaseName: 'DEFRA' | 'ECOINVENT' | 'IPCC';
  type: 'PHYSIQUE' | 'MONETAIRE';
  value: number;
  unit: string;
}

@Component({
  selector: 'app-emission-measure',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './emission-measure.html',
  styleUrls: ['./emission-measure.css']
})
export class EmissionMeasureComponent implements OnInit, OnChanges {

  @Input() scopeCategory?: string;

  selectedScope: number = 1;
  selectedCategory: string = 'combustion-etablissements';

  toastMessage: string | null = null;
  toastType: 'success' | 'danger' | 'info' = 'success';

  editingFactorId: number | null = null;

  scopes = [
    { id: 1, name: 'Scope 1' },
    { id: 2, name: 'Scope 2' },
    { id: 3, name: 'Scope 3' }
  ];

  categoriesByScope: { [key: number]: { id: string; name: string; icon: string }[] } = {
    1: [
      { id: 'combustion-etablissements', name: 'Combustion dans les établissements', icon: '🏭' },
      { id: 'combustion-vehicules', name: 'Combustion des véhicules', icon: '🚗' },
      { id: 'emissions-refrigerants', name: 'Émissions de réfrigérants', icon: '❄️' }
    ],
    2: [
      { id: 'electricite', name: 'Électricité achetée', icon: '⚡' }
    ],
    3: [
      { id: 'biens-services', name: 'Biens et services achetés', icon: '📦' },
      { id: 'biens-equipement', name: 'Biens d\'équipement', icon: '🏗️' },
      { id: 'activites-energie', name: 'Activités liées à l\'énergie', icon: '⛽' },
      { id: 'transport-amont', name: 'Transport en amont', icon: '🚚' },
      { id: 'dechets', name: 'Déchets', icon: '🗑️' },
      { id: 'voyages-affaires', name: 'Voyages d\'affaires', icon: '✈️' },
      { id: 'deplacements-employes', name: 'Déplacements des employés', icon: '🚌' },
      { id: 'actifs-loues-amont', name: 'Actifs loués en amont', icon: '🏢' },
      { id: 'transport-aval', name: 'Transport en aval', icon: '🚛' },
      { id: 'transformation-produits', name: 'Transformation des produits', icon: '🏭' },
      { id: 'utilisation-produits', name: 'Utilisation des produits', icon: '🛒' },
      { id: 'fin-de-vie', name: 'Fin de vie des produits', icon: '♻️' },
      { id: 'actifs-loues-aval', name: 'Actifs loués en aval', icon: '🏢' },
      { id: 'franchises', name: 'Franchises', icon: '🤝' },
      { id: 'investissements', name: 'Investissements', icon: '💰' }
    ]
  };

  sourcesByCategory: { [key: string]: string[] } = {
    'combustion-etablissements': [
      'Pétrole brut', 'Essence automobile', 'Essence aviation', 'Essence pour jet',
      'Kérosène pour jet', 'Autre kérosène', 'Gazole/Fioul', 'Fioul lourd',
      'Gaz de pétrole liquéfié', 'Naphte', 'Gaz naturel', 'Lubrifiants',
      'Bitume', 'Coke de pétrole', 'Biogaz / Biométhane', 'Charbon / Houille',
      'Lignite', 'Bois d\'œuvre / Granulés (Pellets)', 'Déchets ménagers / industriels'
    ],
    'combustion-vehicules': [
      'Essence automobile', 'Gazole/Fioul', 'Voiture à diesel moyenne',
      'Diesel Medium end heavy duty truck', 'Voiture à essence moyenne',
      'Flotte Diesel', 'Flotte Essence', 'Flotte Hybride', 'Flotte Électrique'
    ],
    'emissions-refrigerants': [
      'HFC-134a', 'R-401A', 'R-402A', 'R-402B', 'R-404A', 'HFC-236fa',
      'R-507 ou R-507A', 'R-407A', 'R-508A', 'R-508B', 'R-22', 'R-407C',
      'R-407B', 'R-410A', 'R-32', 'R-407D'
    ],
    'electricite': [
      'Bioénergie', 'Charbon', 'Gaz', 'Hydroélectricité', 'Nucléaire',
      'Autres énergies fossiles', 'Autres énergies renouvelables',
      'Énergie solaire', 'Énergie éolienne', 'Mix du réseau national d\'électricité'
    ],
    'biens-services': [
      'Matières Premières (Métaux)', 'Plastiques et Polymères',
      'Fournitures Administrative', 'Services Informatiques / Cloud'
    ],
    'biens-equipement': ['Machines Industrielles', 'Matériel Informatique', 'Équipements de Bureau'],
    'activites-energie': ['Pertes de Réseau Électrique', 'Raffinage du Carburant'],
    'transport-amont': ['Transport Routier (Poids Lourds)', 'Transport Maritime (Conteneur)', 'Fret Aérien'],
    'dechets': ['Déchets Banals (DIB)', 'Recyclage Papier/Carton', 'Déchets Dangereux'],
    'voyages-affaires': ['Vol Court Courrier', 'Vol Moyen/Long Courrier', 'Train High-Speed', 'Hôtel (Nuitée)'],
    'deplacements-employes': ['Voiture Personnelle (Essence)', 'Voiture Personnelle (Diesel)', 'Transport en commun / Bus'],
    'actifs-loues-amont': ['Bureaux Loués', 'Entrepôts Loués'],
    'transport-aval': ['Livraison Clients (Camionnette)', 'Livraison Clients (Poids Lourd)'],
    'transformation-produits': ['Sous-traitance de Fabrication'],
    'utilisation-produits': ['Consommation Électrique en Utilisation'],
    'fin-de-vie': ['Incinération Produits', 'Mise en Décharge Produits'],
    'actifs-loues-aval': ['Locaux Donnés en Location'],
    'franchises': ['Consommation des Franchises'],
    'investissements': ['Financement de Projets', 'Participations Financières']
  };

  physicalUnits: string[] = ['L', 'kg', 'kWh', 'T', 'm³'];
  monetaryUnits: string[] = ['TND', 'EUR', 'USD'];

  newSource: string = '';
  newDatabase: 'DEFRA' | 'ECOINVENT' | 'IPCC' = 'DEFRA';
  newType: 'PHYSIQUE' | 'MONETAIRE' = 'PHYSIQUE';
  newValue: number | null = null;
  newUnit: string = 'L';

  factorsList: EmissionFactor[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object // 👈 Injection requise pour SSR
  ) {}

  ngOnInit(): void {
    this.loadFactorsFromStorage();
    this.initDefaultSelection();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scopeCategory']) {
      this.syncCategoryWithInput();
      this.cdr.detectChanges();
    }
  }

  private isValidCategoryId(catId: string): boolean {
    return Object.values(this.categoriesByScope).some(cats => cats.some(c => c.id === catId));
  }

  private ensureValidCategoryForCurrentScope(): void {
    if (!this.categoriesByScope[this.selectedScope]) {
      this.selectedScope = 1;
    }
    const cats = this.categoriesByScope[this.selectedScope];
    const stillValid = cats.some(c => c.id === this.selectedCategory);
    if (!stillValid) {
      this.selectedCategory = cats.length > 0 ? cats[0].id : '';
    }
  }

  private initDefaultSelection(): void {
    if (this.scopeCategory && this.isValidCategoryId(this.scopeCategory)) {
      this.syncCategoryWithInput();
    } else {
      this.selectedScope = 1;
      this.selectedCategory = 'combustion-etablissements';
    }
    this.ensureValidCategoryForCurrentScope();
    this.updateDefaultSourceAndUnit();
    this.cdr.detectChanges();
  }

  // 🛡️ SÉCURISATION SSR
  private loadFactorsFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('emission_factors_data');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.factorsList = Array.isArray(parsed) ? parsed : [];
        } catch {
          this.factorsList = [];
        }
      }
    }

    if (!this.factorsList || this.factorsList.length === 0) {
      this.factorsList = [
        { id: 1, category: 'combustion-etablissements', sourceName: 'Gazole/Fioul', databaseName: 'DEFRA', type: 'PHYSIQUE', value: 2.51, unit: 'L' },
        { id: 2, category: 'combustion-etablissements', sourceName: 'Gazole/Fioul', databaseName: 'DEFRA', type: 'PHYSIQUE', value: 1.2, unit: 'L' },
        { id: 3, category: 'electricite', sourceName: 'Électricité Réseau STEG (Moyenne Tension)', databaseName: 'IPCC', type: 'PHYSIQUE', value: 0.48, unit: 'kWh' }
      ];
      this.saveFactorsToStorage();
    }
  }

  // 🛡️ SÉCURISATION SSR
  private saveFactorsToStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('emission_factors_data', JSON.stringify(this.factorsList));
    }
  }

  private syncCategoryWithInput(): void {
    if (this.scopeCategory && this.isValidCategoryId(this.scopeCategory)) {
      this.selectedCategory = this.scopeCategory;
      for (const [scopeId, cats] of Object.entries(this.categoriesByScope)) {
        if (cats.some(c => c.id === this.scopeCategory)) {
          this.selectedScope = Number(scopeId);
          break;
        }
      }
    } else {
      this.ensureValidCategoryForCurrentScope();
    }
    this.updateDefaultSourceAndUnit();
  }

  selectScope(scopeId: number): void {
    this.selectedScope = scopeId;
    const cats = this.categoriesByScope[scopeId];
    if (cats && cats.length > 0) {
      this.selectCategory(cats[0].id);
    }
  }

  selectCategory(catId: string): void {
    this.selectedCategory = catId;
    this.updateDefaultSourceAndUnit();
  }

  onTypeChange(): void {
    this.newUnit = this.newType === 'PHYSIQUE' ? this.physicalUnits[0] : this.monetaryUnits[0];
  }

  private updateDefaultSourceAndUnit(): void {
    const availableSources = this.sourcesByCategory[this.selectedCategory];
    this.newSource = availableSources && availableSources.length > 0 ? availableSources[0] : '';
    this.newUnit = this.newType === 'PHYSIQUE' ? this.physicalUnits[0] : this.monetaryUnits[0];
  }

  get currentAvailableSources(): string[] {
    return this.sourcesByCategory[this.selectedCategory] || [];
  }

  get filteredFactors(): EmissionFactor[] {
    return this.factorsList.filter(f => f.category === this.selectedCategory);
  }

  get currentCategoryLabel(): string {
    const cats = this.categoriesByScope[this.selectedScope] || [];
    return cats.find(c => c.id === this.selectedCategory)?.name || '';
  }

  getBadgeClass(db: string): string {
    switch (db) {
      case 'DEFRA': return 'badge-defra';
      case 'ECOINVENT': return 'badge-ecoinvent';
      case 'IPCC': return 'badge-ipcc';
      default: return 'badge-defra';
    }
  }

  addFactor(): void {
    if (!this.newSource || this.newValue === null || this.newValue <= 0) {
      this.showToast('Veuillez saisir une valeur valide.', 'danger');
      return;
    }

    if (this.editingFactorId) {
      const index = this.factorsList.findIndex(f => f.id === this.editingFactorId);
      if (index !== -1) {
        this.factorsList[index] = {
          id: this.editingFactorId,
          category: this.selectedCategory,
          sourceName: this.newSource,
          databaseName: this.newDatabase,
          type: this.newType,
          value: this.newValue,
          unit: this.newUnit
        };
        this.showToast('Facteur modifié avec succès !', 'success');
      }
      this.editingFactorId = null;
    } else {
      const created: EmissionFactor = {
        id: Date.now(),
        category: this.selectedCategory,
        sourceName: this.newSource,
        databaseName: this.newDatabase,
        type: this.newType,
        value: this.newValue,
        unit: this.newUnit
      };
      this.factorsList.push(created);
      this.showToast('Facteur ajouté et sauvegardé !', 'success');
    }

    this.saveFactorsToStorage();
    this.newValue = null;
  }

  editFactor(factor: EmissionFactor): void {
    this.editingFactorId = factor.id || null;
    this.newSource = factor.sourceName;
    this.newDatabase = factor.databaseName;
    this.newType = factor.type;
    this.newValue = factor.value;
    this.newUnit = factor.unit;
  }

  cancelEdit(): void {
    this.editingFactorId = null;
    this.newValue = null;
    this.updateDefaultSourceAndUnit();
  }

  deleteFactor(id?: number): void {
    if (!id) return;
    this.factorsList = this.factorsList.filter(f => f.id !== id);
    this.saveFactorsToStorage();
    this.showToast('Facteur supprimé !', 'info');
  }

  showToast(message: string, type: 'success' | 'danger' | 'info'): void {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => { this.toastMessage = null; }, 3500);
  }
}