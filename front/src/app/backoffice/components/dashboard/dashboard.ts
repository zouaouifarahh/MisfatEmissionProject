import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

// Composants métiers
import { ProfileComponent } from '../profile/profile.component';
import { EmissionListComponent } from '../../../components/emission-list/emission-list';
import { EmissionMeasureComponent } from '../../../components/emission-measure/emission-measure';
import { CombustionVehiculesComponent } from '../../../components/combustion-vehicules/combustion-vehicules';
import { ReferentielCarboneComponent } from '../../../components/referentiel-carbone/referentiel-carbone';

// Services et Modèles
import { OrganizationService } from '../../../services/organization.service';
import { Filiale, Usine, AnneeReference } from '../../../models/organization.model';

interface DonneeAnnuelle {
  annee: number;
  valeur: number;
  hauteurBarre: number;
  provisoire?: boolean;
}

interface KpiEntreprise {
  id: string;
  label: string;
  icone: string;
  couleur: string;
  unite: string;
  donnees: DonneeAnnuelle[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProfileComponent,
    EmissionListComponent,
    EmissionMeasureComponent,
    CombustionVehiculesComponent,
    ReferentielCarboneComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {

  userRole: string = 'ADMINISTRATEUR';
  isSidebarCollapsed: boolean = false;

  // ---------- FILTRES UI & MOTEUR DE RECHERCHE ----------
  filtreActif: string | number = 'ALL';
  selectedFilialeId: number | 'ALL' = 'ALL';
  selectedUsineId: number | 'ALL' = 'ALL';
  selectedAnnee: number | null = null;
  selectedDate: string | null = null; // Date précise
  selectedPeriode: string = 'ANNEE'; // 'JOUR' | 'MOIS' | 'ANNEE'

  // ---------- MENUS & NAVIGATION ----------
  menus = {
    emissions: true,
    mesureCategories: false,
    reporting: false,
    parametres: false,
    utilisateurs: false
  };

  activeSub: string = 'apercu';
  activeScope: string | null = null;
  modulesGeneriques: string[] = ['ghg', 'p-op', 'p-org', 'm-equipe'];

  // ---------- DONNÉES D'ORGANISATION ----------
  filiales: Filiale[] = [];
  usines: Usine[] = [];
  annees: AnneeReference[] = [];

  // Structure des Scopes & Catégories
  scopesData = [
    {
      id: 'scope1',
      name: 'Scope 1',
      categories: [
        { id: 'combustion-etablissements', nom: 'Combustion dans les établissements', icone: '🏭' },
        { id: 'combustion-vehicules', nom: 'Combustion des véhicules', icone: '🚗' },
        { id: 'emissions-refrigerants', nom: 'Émissions de réfrigérants', icone: '❄️' }
      ]
    },
    {
      id: 'scope2',
      name: 'Scope 2',
      categories: [
        { id: 'electricite-achetee', nom: 'Électricité achetée', icone: '💡' }
      ]
    },
    {
      id: 'scope3',
      name: 'Scope 3',
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

  demandesEnAttente = [
    { id: 3, username: 'f.zwawi', email: 'farah.zwawi06@gmail.com', firstName: 'Farah', lastName: 'Zwawi', role: 'CONTRIBUTEUR', status: 'EN_ATTENTE', usine: 'MISFAT_1' },
    { id: 4, username: 'a.bayan', email: 'bayan.rse@misfat.com', firstName: 'Ahmed', lastName: 'Bayan', role: 'RESPONSABLE_RSE', status: 'EN_ATTENTE', usine: 'MISFAT_2' }
  ];

  // ---------- STATISTIQUES & KPIS ----------
  donneesParFiltre: { [key: number]: { stats: { totalCO2: number; scope1: number; scope2: number; scope3: number } } } = {
    1: { stats: { totalCO2: 53300, scope1: 5200, scope2: 3100, scope3: 45000 } },
    2: { stats: { totalCO2: 35300, scope1: 2100, scope2: 1200, scope3: 32000 } },
    3: { stats: { totalCO2: 33725, scope1: 3113, scope2: 1818, scope3: 28794 } },
    4: { stats: { totalCO2: 12500, scope1: 900, scope2: 600, scope3: 11000 } },
    5: { stats: { totalCO2: 11000, scope1: 500, scope2: 500, scope3: 10000 } }
  };

  statsGlobales = { totalCO2: 145825, scope1: 11813, scope2: 7218, scope3: 126794 };
  statsAnneePrecedente = { scope1: 10520, scope2: 6890, scope3: 118300 };

  kpisEntreprise: KpiEntreprise[] = [
    this.construireKpi('ca', 'Chiffre d\'Affaires', '💰', '#1e293b', 'M TND', [
      { annee: 2022, valeur: 38.2 },
      { annee: 2023, valeur: 41.75 },
      { annee: 2024, valeur: 45.0 },
      { annee: 2025, valeur: 27.4, provisoire: true }
    ]),
    this.construireKpi('effectifs', 'Effectif Employés', '👥', '#4f46e5', 'employés', [
      { annee: 2022, valeur: 398 },
      { annee: 2023, valeur: 432 },
      { annee: 2024, valeur: 465 },
      { annee: 2025, valeur: 480, provisoire: true }
    ]),
    this.construireKpi('production', 'Volume de Production', '📦', '#b45309', 'M unités', [
      { annee: 2022, valeur: 7.8 },
      { annee: 2023, valeur: 8.6 },
      { annee: 2024, valeur: 9.4 },
      { annee: 2025, valeur: 5.9, provisoire: true }
    ]),
    this.construireKpi('ventes', 'Ventes', '🛒', '#0f766e', 'M unités', [
      { annee: 2022, valeur: 7.5 },
      { annee: 2023, valeur: 8.3 },
      { annee: 2024, valeur: 9.1 },
      { annee: 2025, valeur: 5.7, provisoire: true }
    ])
  ];

  filtresProduction = [
    { type: 'Filtres à Huile', volume: 40 },
    { type: 'Filtres à Air', volume: 30 },
    { type: 'Filtres à Carburant', volume: 20 },
    { type: 'Filtres d\'Habitacle', volume: 10 }
  ];

  categoriesScope1 = [
    { nom: 'Combustion Stationnaire', total: 8500, q1: 4100, q2: 4400 },
    { nom: 'Combustion Mobile', total: 2000, q1: 900, q2: 1100 },
    { nom: 'Émissions Fugitives', total: 1313, q1: 600, q2: 713 }
  ];

  categoriesScope2 = [
    { nom: 'Électricité Achetée', total: 7218, q1: 3400, q2: 3818 }
  ];

  categoriesScope3 = [
    { nom: 'Achats de Biens et Services', total: 80000, q1: 39000, q2: 41000 },
    { nom: 'Transport et Distribution en Amont', total: 26794, q1: 13000, q2: 13794 },
    { nom: 'Transport et Distribution en Aval', total: 10000, q1: 4800, q2: 5200 },
    { nom: 'Déplacements Domicile-Travail', total: 5000, q1: 2400, q2: 2600 },
    { nom: 'Voyages d\'Affaires', total: 3000, q1: 1400, q2: 1600 },
    { nom: 'Déchets Générés par les Opérations', total: 2000, q1: 900, q2: 1100 },
    { nom: 'Biens d\'Équipement', total: 0, q1: 0, q2: 0 },
    { nom: 'Activités Liées à l\'Énergie (non-S1 & S2)', total: 0, q1: 0, q2: 0 },
    { nom: 'Actifs Loués en Amont', total: 0, q1: 0, q2: 0 },
    { nom: 'Transformation des Produits Vendus', total: 0, q1: 0, q2: 0 },
    { nom: 'Utilisation des Produits Vendus', total: 0, q1: 0, q2: 0 },
    { nom: 'Fin de Vie des Produits Vendus', total: 0, q1: 0, q2: 0 },
    { nom: 'Actifs Loués en Aval', total: 0, q1: 0, q2: 0 },
    { nom: 'Franchises', total: 0, q1: 0, q2: 0 },
    { nom: 'Investissements', total: 0, q1: 0, q2: 0 }
  ];

  selectedScopeSlice: string | null = null;
  selectedScope3Slice: string | null = null;

  scope3Palette: string[] = [
    '#4f46e5', '#0f766e', '#b45309', '#7c3aed', '#0891b2',
    '#be123c', '#4d7c0f', '#c026d3', '#0369a1', '#a16207',
    '#059669', '#9333ea', '#ea580c', '#64748b', '#0284c7'
  ];

  constructor(
    private router: Router,
    private organizationService: OrganizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.chargerFiliales();
    this.chargerAnnees();
  }

  // ---------- GESTION DES FILTRES ----------
  changerFiltre(filtre: string | number): void {
    this.filtreActif = filtre;
    if (typeof filtre === 'number') {
      this.onUsineChange(filtre);
    } else {
      this.onUsineChange('ALL');
    }
  }

  // Les <select> du template renvoient des chaînes : on normalise en nombre
  // pour que les comparaisons avec les ids de l'API (numériques) soient justes.
  onFilialeChange(filialeId: number | string): void {
    const id = filialeId === 'ALL' ? 'ALL' : Number(filialeId);
    this.selectedFilialeId = id;
    this.selectedUsineId = 'ALL';
    this.usines = [];

    if (id !== 'ALL') {
      this.organizationService.getUsinesByFiliale(id).subscribe({
        next: (data) => {
          this.usines = data;
          this.cdr.markForCheck();
        },
        error: (err) => console.error('Erreur lors du chargement des usines', err)
      });
    }
  }

  onUsineChange(usineId: number | string): void {
    this.selectedUsineId = usineId === 'ALL' ? 'ALL' : Number(usineId);
  }

  onAnneeChange(annee: number): void {
    this.selectedAnnee = annee;
  }

  onDateChange(date: string): void {
    this.selectedDate = date;
  }

  onPeriodeChange(periode: string): void {
    this.selectedPeriode = periode;
  }

  resetFiltres(): void {
    this.selectedFilialeId = 'ALL';
    this.selectedUsineId = 'ALL';
    this.selectedDate = null;
    this.selectedPeriode = 'ANNEE';
    this.filtreActif = 'ALL';
    if (this.annees.length > 0) {
      const enCours = this.annees.find(a => a.statut === 'EN_COURS');
      this.selectedAnnee = enCours ? enCours.valeur : this.annees[this.annees.length - 1].valeur;
    }
  }

  // ---------- CHARGEMENT DES DONNÉES DE L'ORGANISATION ----------
  chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: (data) => {
        this.filiales = data;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Erreur lors du chargement des filiales', err)
    });
  }

  chargerAnnees(): void {
    this.organizationService.getAnnees().subscribe({
      next: (data) => {
        this.annees = data;
        const enCours = data.find(a => a.statut === 'EN_COURS');
        this.selectedAnnee = enCours ? enCours.valeur : (data.length ? data[data.length - 1].valeur : null);
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Erreur lors du chargement des années', err)
    });
  }

  // ---------- MÉTHODES D'ANALYSE & KPIS ----------
  private construireKpi(id: string, label: string, icone: string, couleur: string, unite: string,
                        valeurs: { annee: number; valeur: number; provisoire?: boolean }[]): KpiEntreprise {
    const max = Math.max(...valeurs.map(v => v.valeur));
    const donnees: DonneeAnnuelle[] = valeurs.map(v => ({
      ...v,
      hauteurBarre: max > 0 ? Math.max((v.valeur / max) * 100, 8) : 8
    }));
    return { id, label, icone, couleur, unite, donnees };
  }

  getCroissance(kpi: KpiEntreprise): number {
    const complets = kpi.donnees.filter(d => !d.provisoire);
    if (complets.length < 2) return 0;
    const dernier = complets[complets.length - 1].valeur;
    const avantDernier = complets[complets.length - 2].valeur;
    return avantDernier !== 0 ? ((dernier - avantDernier) / avantDernier) * 100 : 0;
  }

  getValeurActuelle(kpi: KpiEntreprise): DonneeAnnuelle {
    return kpi.donnees[kpi.donnees.length - 1];
  }

  get stats() {
    if (this.selectedUsineId === 'ALL') {
      return this.statsGlobales;
    }
    return this.donneesParFiltre[this.selectedUsineId as number]?.stats || this.statsGlobales;
  }

  get totalEmissions(): number {
    return this.stats.scope1 + this.stats.scope2 + this.stats.scope3;
  }

  get usinesFiltered(): Usine[] {
    if (this.selectedFilialeId === 'ALL') {
      return this.usines;
    }
    return this.usines.filter(u => u.filialeId === this.selectedFilialeId);
  }

  get scope1Details(): { nom: string; valeur: number }[] {
    return this.categoriesScope1.map(c => ({ nom: c.nom, valeur: c.total }));
  }

  get scope2Details(): { nom: string; valeur: number }[] {
    return this.categoriesScope2.map(c => ({ nom: c.nom, valeur: c.total }));
  }

  get intensiteCarbone(): number {
    const totalEmissionsKg = (this.stats.scope1 + this.stats.scope2 + this.stats.scope3) * 1000;
    const production = this.kpisEntreprise.find(k => k.id === 'production');
    if (!production) return 0;
    const uniteProduites = this.getValeurActuelle(production).valeur * 1_000_000;
    return uniteProduites > 0 ? totalEmissionsKg / uniteProduites : 0;
  }

  get intensiteGaugePct(): number {
    const cible = 20;
    const pct = (this.intensiteCarbone / cible) * 100;
    return Math.min(Math.max(pct, 0), 100);
  }

  get intensiteGaugeOffset(): number {
    const circumference = 2 * Math.PI * 54;
    return circumference - (this.intensiteGaugePct / 100) * circumference;
  }

  get productiviteEmploye() {
    const ca = this.kpisEntreprise.find(k => k.id === 'ca')?.donnees.filter(d => !d.provisoire) || [];
    const eff = this.kpisEntreprise.find(k => k.id === 'effectifs')?.donnees.filter(d => !d.provisoire) || [];
    if (ca.length < 2 || eff.length < 2) return { valeur: 0, evolution: 0, annee: 2024 };

    const dernierCa = ca[ca.length - 1].valeur * 1_000_000;
    const dernierEff = eff[eff.length - 1].valeur;
    const dernier = dernierEff > 0 ? dernierCa / dernierEff : 0;

    const precedentCa = ca[ca.length - 2].valeur * 1_000_000;
    const precedentEff = eff[eff.length - 2].valeur;
    const precedent = precedentEff > 0 ? precedentCa / precedentEff : 0;

    return {
      valeur: dernier,
      evolution: precedent > 0 ? ((dernier - precedent) / precedent) * 100 : 0,
      annee: ca[ca.length - 1].annee
    };
  }

  getSparklinePoints(kpi: KpiEntreprise): string {
    const vals = kpi.donnees.map(d => d.valeur);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const range = max - min || 1;
    const stepX = 100 / (vals.length - 1);
    return vals.map((v, i) => {
      const x = i * stepX;
      const y = 32 - ((v - min) / range) * 28 - 2;
      return `${x},${y}`;
    }).join(' ');
  }

  // ---------- GESTION DES GRAPHIQUES (DONUT & SCOPES) ----------
  toggleScopeSlice(nom: string): void {
    this.selectedScopeSlice = this.selectedScopeSlice === nom ? null : nom;
  }

  get scopeDonutItems() {
    const total = this.stats.scope1 + this.stats.scope2 + this.stats.scope3;
    return [
      { nom: 'Scope 1 · Direct', total: this.stats.scope1, pct: total ? (this.stats.scope1 / total * 100) : 0, couleur: '#4f46e5' },
      { nom: 'Scope 2 · Énergie', total: this.stats.scope2, pct: total ? (this.stats.scope2 / total * 100) : 0, couleur: '#b45309' },
      { nom: 'Scope 3 · Chaîne', total: this.stats.scope3, pct: total ? (this.stats.scope3 / total * 100) : 0, couleur: '#0f766e' }
    ];
  }

  get scopeDonutGradient(): string {
    let cursor = 0;
    const stops = this.scopeDonutItems.map(it => {
      const start = cursor;
      cursor += it.pct;
      const color = (this.selectedScopeSlice && this.selectedScopeSlice !== it.nom) ? '#e2e8f0' : it.couleur;
      return `${color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  get scopeDonutCenter() {
    if (this.selectedScopeSlice) {
      const it = this.scopeDonutItems.find(i => i.nom === this.selectedScopeSlice);
      if (it) return { value: it.total, label: it.nom, pct: it.pct, focused: true };
    }
    return { value: this.stats.scope1 + this.stats.scope2 + this.stats.scope3, label: 'tCO₂e total', pct: null, focused: false };
  }

  get scopeComparaison() {
    const items = [
      { nom: 'Scope 1', actuel: this.stats.scope1, precedent: this.statsAnneePrecedente.scope1, couleur: '#4f46e5' },
      { nom: 'Scope 2', actuel: this.stats.scope2, precedent: this.statsAnneePrecedente.scope2, couleur: '#b45309' },
      { nom: 'Scope 3', actuel: this.stats.scope3, precedent: this.statsAnneePrecedente.scope3, couleur: '#0f766e' }
    ];
    const max = Math.max(...items.map(i => Math.max(i.actuel, i.precedent)));
    return items.map(i => ({
      ...i,
      pctActuel: max ? (i.actuel / max * 100) : 0,
      pctPrecedent: max ? (i.precedent / max * 100) : 0,
      evolution: i.precedent ? ((i.actuel - i.precedent) / i.precedent) * 100 : 0
    }));
  }

  toggleScope3Slice(nom: string): void {
    this.selectedScope3Slice = this.selectedScope3Slice === nom ? null : nom;
  }

  get scope3Full() {
    const total = this.categoriesScope3.reduce((s, c) => s + c.total, 0);
    return this.categoriesScope3
      .map((c, i) => ({
        nom: c.nom,
        total: c.total,
        pct: total ? (c.total / total * 100) : 0,
        couleur: this.scope3Palette[i % this.scope3Palette.length]
      }))
      .sort((a, b) => b.total - a.total);
  }

  get scope3Top5() {
    return this.scope3Full.filter(it => it.total > 0).slice(0, 5);
  }

  get scope3DonutGradient(): string {
    let cursor = 0;
    const stops = this.scope3Full.filter(it => it.total > 0).map(it => {
      const start = cursor;
      cursor += it.pct;
      const color = (this.selectedScope3Slice && this.selectedScope3Slice !== it.nom) ? '#e2e8f0' : it.couleur;
      return `${color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  get scope3DonutCenter() {
    if (this.selectedScope3Slice) {
      const it = this.scope3Full.find(i => i.nom === this.selectedScope3Slice);
      if (it) return { value: it.total, label: it.nom, pct: it.pct, focused: true };
    }
    const total = this.categoriesScope3.reduce((s, c) => s + c.total, 0);
    return { value: total, label: 'tCO₂e Scope 3', pct: null, focused: false };
  }

  // ---------- UI & NAVIGATION LATÉRALE ----------
  toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  accepterDemande(user: any): void {
    user.status = 'ACTIF';
    this.demandesEnAttente = this.demandesEnAttente.filter(u => u.id !== user.id);
  }

  refuserDemande(user: any): void {
    this.demandesEnAttente = this.demandesEnAttente.filter(u => u.id !== user.id);
  }

  allerAAccueil(): void {
    this.router.navigate(['/signin']);
  }

  toggleMenu(menuName: keyof typeof this.menus): void {
    this.menus[menuName] = !this.menus[menuName];
    if (menuName === 'mesureCategories' && !this.menus.mesureCategories) {
      this.activeScope = null;
    }
  }

  toggleScope(scopeId: string): void {
    this.activeScope = this.activeScope === scopeId ? null : scopeId;
  }

  isCategory(id: string): boolean {
    return this.scopesData.some(scope => scope.categories.some(cat => cat.id === id));
  }

  setActive(sub: string): void {
    this.activeSub = sub;

    if (sub === 'apercu') {
      this.menus.emissions = true;
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
    else if (sub === 'referentiel-carbone') {
      this.menus.emissions = true;
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
    else if (sub === 'mesure') {
      this.menus.mesureCategories = !this.menus.mesureCategories;
      if (!this.menus.mesureCategories) {
        this.activeScope = null;
      }
    }
    else if (this.isCategory(sub)) {
      this.menus.mesureCategories = true;
      const parentScope = this.scopesData.find(scope => scope.categories.some(cat => cat.id === sub));
      if (parentScope) {
        this.activeScope = parentScope.id;
      }
    }
    else {
      this.menus.mesureCategories = false;
      this.activeScope = null;
    }
  }
}