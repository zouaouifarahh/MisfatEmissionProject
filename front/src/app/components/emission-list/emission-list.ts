import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Emission {
  id: number;
  scope: string;
  categorie: string;
  etablissement: string;
  carburant: string;
  typeDonnee: 'Physique' | 'Monetaire';
  quantite: number;
  facteur: number;
  unite: string;
  dateDebut: string;
  dateFin: string;
  emissionCalculee: number;
  hypothese: 'Estimation' | 'Réelle';
  descriptionHypothese?: string;
  creeLe: string;
}

@Component({
  selector: 'app-emission-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './emission-list.html',
  styleUrl: './emission-list.css'
})
export class EmissionListComponent implements OnInit {
  listeEmissions: Emission[] = [];
  filtreEtablissement: string = 'Tous';
  rechercheTexte: string = '';

  modaleOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;

  etablissementsList = ['Misfat 1', 'Misfat 2', 'Misfat 3'];
  
  carburantsList = [
    { nom: 'Gaz de pétrole liquéfié', facteurDefaut: 1.47 },
    { nom: 'Essence automobile', facteurDefaut: 2.30 },
    { nom: 'Essence aviation', facteurDefaut: 2.50 },
    { nom: 'Essence pour jet', facteurDefaut: 2.52 },
    { nom: 'Pétrole brut', facteurDefaut: 2.65 },
    { nom: 'Gazole/Fioul', facteurDefaut: 2.68 },
    { nom: 'Fioul lourd', facteurDefaut: 3.10 },
    { nom: 'Gaz naturel', facteurDefaut: 1.88 },
    { nom: 'Kérosène pour jet', facteurDefaut: 2.54 },
    { nom: 'Autre kérosène', facteurDefaut: 2.53 },
    { nom: 'Lubrifiants', facteurDefaut: 2.90 },
    { nom: 'Naphte', facteurDefaut: 2.63 }
  ];

  formModel = {
    scope: 'Scope 1',
    categorie: 'Combustion dans les établissements',
    etablissement: '',
    carburant: '',
    typeDonnee: 'Physique' as 'Physique' | 'Monetaire',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: 'L',
    dateDebut: '',
    dateFin: '',
    hypothese: 'Réelle' as 'Estimation' | 'Réelle',
    descriptionHypothese: ''
  };

  constructor(private datePipe: DatePipe) {}

  // Charge les données enregistrées au démarrage de la page
  ngOnInit() {
    const donneesSauvegardees = localStorage.getItem('listeEmissions');
    if (donneesSauvegardees) {
      this.listeEmissions = JSON.parse(donneesSauvegardees);
    }
  }

  // Sauvegarde automatique dans le navigateur
  sauvegarderDansLocalStorage() {
    localStorage.setItem('listeEmissions', JSON.stringify(this.listeEmissions));
  }

  // Filtrage et recherche dynamique par lettre (Carburant ou Établissement)
  get emissionsFiltrees(): Emission[] {
    return this.listeEmissions.filter(item => {
      const correspondEtab = this.filtreEtablissement === 'Tous' || item.etablissement === this.filtreEtablissement;
      
      const termeRecherche = this.rechercheTexte.trim().toLowerCase();
      const correspondRecherche = !termeRecherche || 
        item.carburant.toLowerCase().includes(termeRecherche) ||
        item.etablissement.toLowerCase().includes(termeRecherche);

      return correspondEtab && correspondRecherche;
    });
  }

  ouvrirModale(emission?: Emission) {
    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope,
        categorie: emission.categorie,
        etablissement: emission.etablissement,
        carburant: emission.carburant,
        typeDonnee: emission.typeDonnee,
        quantite: emission.quantite,
        facteur: emission.facteur,
        unite: emission.unite,
        dateDebut: emission.dateDebut,
        dateFin: emission.dateFin,
        hypothese: emission.hypothese,
        descriptionHypothese: emission.descriptionHypothese || ''
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'Scope 1',
        categorie: 'Combustion dans les établissements',
        etablissement: '',
        carburant: '',
        typeDonnee: 'Physique',
        quantite: null,
        facteur: null,
        unite: 'L',
        dateDebut: '',
        dateFin: '',
        hypothese: 'Réelle',
        descriptionHypothese: ''
      };
    }
    this.modaleOuverte = true;
  }

  fermerModale() {
    this.modaleOuverte = false;
  }

  onCarburantChange() {
    const selection = this.carburantsList.find(c => c.nom === this.formModel.carburant);
    if (selection) {
      this.formModel.facteur = selection.facteurDefaut;
    }
  }

  changerTypeDonnee(valeur: 'Physique' | 'Monetaire') {
    this.formModel.typeDonnee = valeur;
    if (valeur === 'Physique') {
      this.formModel.unite = 'L';
    } else {
      this.formModel.unite = 'TND';
    }
  }

  enregistrerEmission() {
    if (!this.formModel.etablissement || !this.formModel.carburant || !this.formModel.quantite) {
      alert('Veuillez remplir les champs obligatoires (*)');
      return;
    }

    const qte = this.formModel.quantite || 0;
    const fact = this.formModel.facteur || 0;
    const calcul = parseFloat((qte * fact).toFixed(3));

    if (this.isEdition && this.idEditionActive !== null) {
      this.listeEmissions = this.listeEmissions.map(item => {
        if (item.id === this.idEditionActive) {
          return {
            ...item,
            etablissement: this.formModel.etablissement,
            carburant: this.formModel.carburant,
            typeDonnee: this.formModel.typeDonnee,
            quantite: qte,
            facteur: fact,
            unite: this.formModel.unite,
            dateDebut: this.formModel.dateDebut,
            dateFin: this.formModel.dateFin,
            emissionCalculee: calcul,
            hypothese: this.formModel.hypothese,
            descriptionHypothese: this.formModel.descriptionHypothese
          };
        }
        return item;
      });
    } else {
      const nouvelleEmission: Emission = {
        id: Date.now(),
        scope: this.formModel.scope,
        categorie: this.formModel.categorie,
        etablissement: this.formModel.etablissement,
        carburant: this.formModel.carburant,
        typeDonnee: this.formModel.typeDonnee,
        quantite: qte,
        facteur: fact,
        unite: this.formModel.unite,
        dateDebut: this.formModel.dateDebut,
        dateFin: this.formModel.dateFin,
        emissionCalculee: calcul,
        hypothese: this.formModel.hypothese,
        descriptionHypothese: this.formModel.descriptionHypothese,
        creeLe: this.datePipe.transform(new Date(), 'dd/MM/yyyy') || ''
      };
      this.listeEmissions.push(nouvelleEmission);
    }

    this.sauvegarderDansLocalStorage();
    this.fermerModale();
  }

  supprimerEmission(id: number) {
    if (confirm('Voulez-vous vraiment supprimer cette ligne ?')) {
      this.listeEmissions = this.listeEmissions.filter(item => item.id !== id);
      this.sauvegarderDansLocalStorage();
    }
  }

  selectionnerHypothese(valeur: 'Estimation' | 'Réelle') {
    this.formModel.hypothese = valeur;
  }
}