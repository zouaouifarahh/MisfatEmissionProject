import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileComponent } from '../profile/profile.component';
import { EmissionListComponent } from '../../../components/emission-list/emission-list';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    ProfileComponent, 
    EmissionListComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  
  userRole: string = 'ADMINISTRATEUR'; 

  menus = {
    emissions: true,
    mesureCategories: false, 
    reporting: false,
    parametres: false,
    utilisateurs: false
  };

  activeSub: string = 'apercu';
  filtreActif: number | 'ALL' = 'ALL'; 

  // Vos 10 catégories de mesure pour la barre latérale
  categoriesMesure = [
    { id: 'combustion-etablissements', nom: 'Combustion dans les établissements', icone: '🏢' },
    { id: 'combustion-vehicules', nom: 'Combustion des véhicules', icone: '🚗' },
    { id: 'emissions-refrigerants', nom: 'Émissions de réfrigérants', icone: '🌡️' },
    { id: 'electricite-achetee', nom: 'Électricité achetée', icone: '💡' },
    { id: 'deplacements-employes', nom: 'Déplacements des employés', icone: '🏃‍♂️' },
    { id: 'dechets', nom: 'Déchets', icone: '🗑️' },
    { id: 'voyages-affaires', nom: 'Voyages d’affaires', icone: '✈️' },
    { id: 'biens-services', nom: 'Biens et services achetés', icone: '📦' },
    { id: 'transport-amont', nom: 'Transport en amont', icone: '🚛' },
    { id: 'transport-aval', nom: 'Transport en aval', icone: '🚚' }
  ];

  demandesEnAttente = [
    { id: 3, username: 'f.zwawi', email: 'farah.zwawi06@gmail.com', firstName: 'Farah', lastName: 'Zwawi', role: 'CONTRIBUTEUR', status: 'EN_ATTENTE', usine: 'MISFAT_1' },
    { id: 4, username: 'a.bayan', email: 'bayan.rse@misfat.com', firstName: 'Ahmed', lastName: 'Bayan', role: 'RESPONSABLE_RSE', status: 'EN_ATTENTE', usine: 'MISFAT_2' }
  ];

  // Données par usine (1 à 5)
  donneesParFiltre: { [key: number]: { stats: any, usines: any[], contributeurs: any[], intensite: any[] } } = {
    1: { stats: { totalCO2: 53300, scope1: 5200, scope2: 3100, scope3: 45000 }, usines: [], contributeurs: [], intensite: [] },
    2: { stats: { totalCO2: 35300, scope1: 2100, scope2: 1200, scope3: 32000 }, usines: [], contributeurs: [], intensite: [] },
    3: { stats: { totalCO2: 33725, scope1: 3113, scope2: 1818, scope3: 28794 }, usines: [], contributeurs: [], intensite: [] },
    4: { stats: { totalCO2: 12500, scope1: 900, scope2: 600, scope3: 11000 }, usines: [], contributeurs: [], intensite: [] },
    5: { stats: { totalCO2: 11000, scope1: 500, scope2: 500, scope3: 10000 }, usines: [], contributeurs: [], intensite: [] }
  };

  // Totaux globaux (Tout consolider)
  statsGlobales = { totalCO2: 145825, scope1: 11813, scope2: 7218, scope3: 126794 };

  // Données de performance
  donneesMisfatSociete = {
    caPrecedent: 45000000,
    caActuel: 48500000,
    historiqueCA: [
      { annee: '2023', hauteurBarre: 40 }, 
      { annee: '2024', hauteurBarre: 50 }, 
      { annee: '2025', hauteurBarre: 60 }, 
      { annee: '2026', hauteurBarre: 75 }  
    ],
    filtresProduction: [
      { type: 'Filtres à Huile', volume: 40 },
      { type: 'Filtres à Air', volume: 30 },
      { type: 'Filtres à Carburant', volume: 20 },
      { type: 'Filtres d\'Habitacle', volume: 10 }
    ]
  };

  // --- SCOPE 1 (3 Catégories réelles) ---
  categoriesScope1 = [
    { nom: 'Combustion Stationnaire', total: 8500, q1: 4100, q2: 4400 },
    { nom: 'Combustion Mobile', total: 2000, q1: 900, q2: 1100 },
    { nom: 'Émissions Fugitives', total: 1313, q1: 600, q2: 713 }
  ];

  // --- SCOPE 2 (1 Catégorie réelle) ---
  categoriesScope2 = [
    { nom: 'Électricité Achetée', total: 7218, q1: 3400, q2: 3818 }
  ];

  // --- SCOPE 3 (6 Catégories réelles) ---
  categoriesScope3 = [
    { nom: 'Achats de Biens et Services', total: 80000, q1: 39000, q2: 41000 },
    { nom: 'Transport et Distribution en Amont', total: 26794, q1: 13000, q2: 13794 },
    { nom: 'Transport et Distribution en Aval', total: 10000, q1: 4800, q2: 5200 },
    { nom: 'Déplacements Domicile-Travail', total: 5000, q1: 2400, q2: 2600 },
    { nom: 'Voyages d\'Affaires', total: 3000, q1: 1400, q2: 1600 },
    { nom: 'Déchets Générés par les Opérations', total: 2000, q1: 900, q2: 1100 }
  ];

  constructor(private router: Router) {}

  ngOnInit() {}

  accepterDemande(user: any) {
    user.status = 'ACTIF';
    this.demandesEnAttente = this.demandesEnAttente.filter(u => u.id !== user.id);
  }

  refuserDemande(user: any) {
    this.demandesEnAttente = this.demandesEnAttente.filter(u => u.id !== user.id);
  }

  allerAAccueil() {
    this.router.navigate(['/signin']); 
  }

  get stats() { 
    if (this.filtreActif === 'ALL') {
      return this.statsGlobales;
    }
    return this.donneesParFiltre[this.filtreActif].stats; 
  }

  get listeUsines() { return []; }
  get contributeurs() { return []; }
  get intensite() { return []; }

  toggleMenu(menuName: keyof typeof this.menus) {
    this.menus[menuName] = !this.menus[menuName];
  }

  setActive(sub: string) {
    this.activeSub = sub;
    
    if (sub === 'mesure') {
      this.menus.mesureCategories = !this.menus.mesureCategories;
    } 
    else if (this.categoriesMesure.some(cat => cat.id === sub)) {
      this.menus.mesureCategories = true;
    } 
    else {
      this.menus.mesureCategories = false;
    }
  }

  changerFiltre(valeur: number | 'ALL') {
    this.filtreActif = valeur;
  }
}