import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';
import { LignesDispatcheesComponent } from '../../shared/dispatch/lignes-dispatchees';
import { KpisCategorieComponent, CarteKpi, tauxCouvertureReferentiel, statutRetenu, uniteDominante , provenanceDe, classeProvenance, libelleProvenance, provenanceRetenue } from '../../shared/ui/kpis-categorie';
import { DispatchStore } from '../../shared/dispatch/dispatch-store';
import { lignesVentileesPour, adapterVersMesure } from '../../shared/dispatch/adaptateurs-mesure';

/** Ligne de mesure de fuite de fluide frigorigène. */
export interface EmissionRefrigerant {
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
  creeLe: string;
  /** Base documentaire du facteur retenu, telle que stockée en MSSQL. */
  databaseSource?: string;
  /** Provenance : renseignée pour les seules lignes issues de la ventilation. */
  sourceData?: string;
}

/** Catégorie GHG couverte par cet écran, côté référentiel carbone. */
const MOTIF_CATEGORIE = /refrigerant|fugitive/i;

const CLE_STOCKAGE = 'listeEmissionsRefrigerants';

@Component({
  selector: 'app-emissions-refrigerants',
  standalone: true,
  imports: [KpisCategorieComponent, LignesDispatcheesComponent, CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './emissions-refrigerants.html',
  styleUrl: './emissions-refrigerants.css'
})
export class EmissionsRefrigerantsComponent implements OnInit {

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

  listeEmissions: EmissionRefrigerant[] = [];
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
  /** Fluides distincts, dérivés des facteurs de la catégorie. */
  fluidesDisponibles: string[] = [];
  /** Facteurs du fluide choisi : plusieurs bases peuvent coexister. */
  facteursDuFluide: FacteurDetaille[] = [];
  facteurSelectionne: FacteurDetaille | null = null;
  chargementFacteurs = false;
  avertissementReferentiel = '';

  // ---------- Périmètre organisationnel ----------
  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    scope: 'SCOPE_1',
    categorie: 'Émissions de réfrigérants',
    etablissement: '',
    reference: '',
    emissionSource: '',
    typeDonnee: 'Physique' as 'Physique' | 'Monetaire',
    quantite: null as number | null,
    facteur: null as number | null,
    unite: '',
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

    // Le périmètre est piloté par l'en-tête : usines et devise en découlent.
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
        this.fluidesDisponibles = [...new Set(facteurs.map(f => f.typeName))].sort((a, b) => a.localeCompare(b));
        this.chargementFacteurs = false;

        // Le référentiel ne documente qu'un fluide à ce jour : le signaler évite
        // de laisser croire à une liste tronquée par un filtre.
        this.avertissementReferentiel = this.fluidesDisponibles.length <= 1
          ? `Le référentiel carbone ne contient que ${this.fluidesDisponibles.length} fluide frigorigène. `
            + `Importez une base enrichie depuis « Référentiel Facteurs » pour en proposer davantage.`
          : '';
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

  /**
   * Aligne usines et devise sur la société sélectionnée dans l'en-tête.
   *
   * <p>Sans société active, toutes les usines du groupe sont proposées et la
   * devise reste le dinar, pivot du référentiel.</p>
   */
  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;

    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';

    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);

    // Une usine retenue hors du nouveau périmètre n'a plus de sens.
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

  get emissionsFiltrees(): EmissionRefrigerant[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.toutesLignes.filter(item => {
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

  ouvrirModale(emission?: EmissionRefrigerant): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';
    this.facteurSelectionne = null;
    this.facteursDuFluide = [];

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        scope: emission.scope,
        categorie: 'Émissions de réfrigérants',
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
      this.onFluideChange(emission.databaseSource);
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        scope: 'SCOPE_1',
        categorie: 'Émissions de réfrigérants',
        etablissement: this.usinesDisponibles.length === 1 ? this.usinesDisponibles[0].nom : '',
        reference: '',
        emissionSource: '',
        typeDonnee: 'Physique',
        quantite: null,
        facteur: null,
        unite: '',
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
   * Un fluide choisi : on rassemble ses facteurs, toutes bases confondues.
   *
   * @param sourcePreferee base à resélectionner en édition
   */
  onFluideChange(sourcePreferee?: string): void {
    const fluide = this.formModel.emissionSource;
    this.facteursDuFluide = this.facteursDisponibles.filter(f => f.typeName === fluide);

    // `??` ne suffit pas : une chaîne vide n'est ni null ni undefined.
    const prefere = sourcePreferee
      ? this.facteursDuFluide.find(f => f.databaseSource === sourcePreferee)
      : undefined;
    const retenu: FacteurDetaille | null = prefere ?? this.facteursDuFluide[0] ?? null;

    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /** L'utilisateur tranche entre plusieurs bases pour un même fluide. */
  onBaseChange(): void {
    const retenu = this.facteursDuFluide.find(f => f.databaseSource === this.formModel.databaseSource) ?? null;
    this.appliquerFacteur(retenu);
    this.cdr.detectChanges();
  }

  /**
   * Reporte le facteur retenu dans le formulaire.
   *
   * <p>L'unité suit le mode de valorisation : en physique elle vient du
   * référentiel carbone (le facteur R410a s'applique au kilogramme, pas au
   * litre), en monétaire c'est la devise de la société active.</p>
   */
  private appliquerFacteur(facteur: FacteurDetaille | null): void {
    this.facteurSelectionne = facteur;

    if (!facteur) {
      this.formModel.reference = '';
      this.formModel.facteur = null;
      this.formModel.databaseSource = '';
      this.formModel.unite = this.formModel.typeDonnee === 'Monetaire' ? this.deviseActive : '';
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
      : (this.facteurSelectionne?.unit ?? '');
    this.cdr.detectChanges();
  }

  get emissionPrevisionnelle(): number {
    const q = this.formModel.quantite ?? 0;
    const f = this.formModel.facteur ?? 0;
    return q * f;
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.etablissement || !m.emissionSource || m.quantite === null || m.facteur === null
        || !m.dateDebut || !m.dateFin) {
      this.erreurFormulaire = true;
      this.messageErreur = 'Usine, fluide, quantité et période sont obligatoires.';
      this.cdr.detectChanges();
      return;
    }
    if (new Date(m.dateFin) < new Date(m.dateDebut)) {
      this.erreurFormulaire = true;
      this.messageErreur = 'La date de fin précède la date de début.';
      this.cdr.detectChanges();
      return;
    }

    const ligne: EmissionRefrigerant = {
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
      emissionCalculee: m.quantite * m.facteur,
      hypothese: m.hypothese,
      descriptionHypothese: m.descriptionHypothese,
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
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(this.listeEmissions));
    }
  }

  // ---------- Import Excel ----------

  /** Colonnes du gabarit, dans l'ordre attendu par {@link importerFichier}. */
  private static readonly COLONNES_GABARIT = [
    'Usine', 'Fluide frigorigene', 'Reference', 'Base appliquee',
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
      'Usine': this.usinesDisponibles[0]?.nom ?? 'Misfat 1',
      'Fluide frigorigene': this.fluidesDisponibles[0] ?? 'R410a emissions',
      'Reference': this.facteursDisponibles[0]?.referenceCode ?? 'MS1RG',
      'Base appliquee': this.facteursDisponibles[0]?.databaseSource ?? 'IPCC 2007',
      'Type de donnees': 'Physique',
      'Quantite': 12.5,
      'Unite': this.facteursDisponibles[0]?.unit ?? 'KGCO2eq/KG',
      'Date debut': '2026-01-01',
      'Date fin': '2026-12-31',
      'Hypothese': 'Réelle'
    };

    const feuille = XLSX.utils.json_to_sheet([exemple], {
      header: [...EmissionsRefrigerantsComponent.COLONNES_GABARIT]
    });
    feuille['!cols'] = [22, 30, 14, 20, 16, 12, 16, 14, 14, 14].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Refrigerants');
    XLSX.writeFile(classeur, 'gabarit-emissions-refrigerants.xlsx');
  }

  /**
   * Lecture du classeur déposé.
   *
   * <p>Le facteur n'est jamais lu du fichier : il est résolu depuis le
   * référentiel carbone à partir du fluide et de la base indiquée. Une valeur
   * saisie à la main dans le tableur contournerait la base de référence.</p>
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

        const ajoutees: EmissionRefrigerant[] = [];
        const erreurs: string[] = [];

        lignes.forEach((ligne, index) => {
          const valeur = (cle: string) => {
            const trouve = Object.keys(ligne).find(k => this.normaliser(k) === this.normaliser(cle));
            return trouve ? ligne[trouve] : null;
          };

          const usine = String(valeur('Usine') ?? '').trim();
          const fluide = String(valeur('Fluide frigorigene') ?? '').trim();
          const base = String(valeur('Base appliquee') ?? '').trim();
          const quantite = Number(valeur('Quantite'));
          const typeDonnee = String(valeur('Type de donnees') ?? 'Physique').trim();

          if (!usine || !fluide || !Number.isFinite(quantite)) {
            erreurs.push(`ligne ${index + 2} : usine, fluide ou quantité manquant`);
            return;
          }

          const candidats = this.facteursDisponibles.filter(f => f.typeName === fluide);
          const facteur = (base && candidats.find(f => f.databaseSource === base)) ?? candidats[0];
          if (!facteur) {
            erreurs.push(`ligne ${index + 2} : fluide « ${fluide} » absent du référentiel`);
            return;
          }

          const monetaire = /monet/i.test(typeDonnee);
          ajoutees.push({
            id: Date.now() + index,
            scope: 'SCOPE_1',
            categorie: 'Émissions de réfrigérants',
            etablissement: usine,
            reference: facteur.referenceCode,
            emissionSource: fluide,
            typeDonnee: monetaire ? 'Monetaire' : 'Physique',
            quantite,
            facteur: facteur.factorValue,
            unite: monetaire ? this.deviseActive : facteur.unit,
            dateDebut: this.texteDate(valeur('Date debut')),
            dateFin: this.texteDate(valeur('Date fin')),
            emissionCalculee: quantite * facteur.factorValue,
            hypothese: /estim/i.test(String(valeur('Hypothese') ?? '')) ? 'Estimation' : 'Réelle',
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
      'Fluide frigorigene': e.emissionSource,
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
    XLSX.utils.book_append_sheet(classeur, feuille, 'Refrigerants');
    XLSX.writeFile(classeur, `emissions-refrigerants-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        libelle: 'Fluide rechargé', icone: '❄️', accent: 'volume',
        valeur: (somme(e => e.quantite)).toLocaleString('fr-FR', { maximumFractionDigits: 2 }),
        unite: uniteDominante(this.listeEmissions.map(e => e.unite), 'kg')
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
        alerte: couverture < 80
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
  get lignesVentilees(): EmissionRefrigerant[] {
    return lignesVentileesPour<EmissionRefrigerant>(
      this.dispatchStore, 'emissions-refrigerants', (ligne, rang) => adapterVersMesure(ligne, rang, 'Émissions de réfrigérants', this.usineVentilation) as EmissionRefrigerant, this.usineVentilation
    );
  }

  /** Saisies de l'utilisateur et lignes ventilées, dans cet ordre d'affichage. */
  get toutesLignes(): EmissionRefrigerant[] {
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

}
