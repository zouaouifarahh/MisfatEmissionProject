import {
  ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, isDevMode
} from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ReferentialService, FacteurDetaille } from '../../services/referential.service';
import { EntityContextService } from '../../core/entity-context.service';
import { OrganizationService } from '../../services/organization.service';
import { Filiale, Usine } from '../../models/organization.model';

import {
  TypeActifAval, TYPES_ACTIF, ModeSaisie, EnergieActif, UNITES_PAR_MODE, OrigineFacteur,
  retenirFacteurAval, classerFacteursAval, consommationValorisee, uniteValorisee,
  calculerEmissionAval, normaliserUnite, reconnaitreTypeActif, reconnaitreModeSaisie,
  modeDepuisUnite, classeBadgeActifAval, emojiActifAval, KWH_PAR_M2_AN
} from './aval-actifs-facteur';

/** Origine d'une ligne, restituée en pastille dans le tableau. */
export type Provenance = 'Réel' | 'Estimation' | 'Excel';

/** Actif loué en aval, catégorie 13 du Scope 3. */
export interface EmissionActifAval {
  id: number;
  scope: string;
  categorie: string;
  reference: string;
  designation: string;
  typeActif: TypeActifAval | null;
  locataire: string;
  provenance: Provenance;
  modeSaisie: ModeSaisie;
  energie: EnergieActif;
  quantite: number | null;
  unite: string;
  /** Consommation imputable, surface déjà convertie en kWh le cas échéant. */
  consommation: number | null;
  uniteConsommation: string;
  facteur: number | null;
  uniteFacteur: string;
  libelleFacteur: string;
  baseAppliquee: string;
  origineFacteur: OrigineFacteur;
  emissionCalculee: number;
  creeLe: string;
}

const MOTIF_CATEGORIE = /Category 13/i;
const CLE_STOCKAGE = 'listeEmissionsActifsAval';
const CLE_SANS_ACTIVITE = 'actifsAvalSansActivite';
const LIBELLE_CATEGORIE = 'Actifs loués en aval';
const TAILLES_PAGE = [20, 50, 100];

@Component({
  selector: 'app-actifs-loues-aval',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './actifs-loues-aval.html',
  styleUrl: './actifs-loues-aval.css'
})
export class ActifsLouesAvalComponent implements OnInit {

  listeEmissions: EmissionActifAval[] = [];
  filtreType = 'Tous';
  filtreProvenance = 'Toutes';
  rechercheTexte = '';

  /**
   * Déclaration « aucun actif loué en aval sur cet exercice ».
   *
   * <p>Un tableau vide se confondrait avec un oubli de collecte : la position
   * doit être consignée explicitement.</p>
   */
  sansActivite = false;

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  readonly taillesPage = TAILLES_PAGE;
  taillePage = TAILLES_PAGE[0];
  pageCourante = 1;

  modaleSaisieOuverte = false;
  modaleImportOuverte = false;
  isEdition = false;
  idEditionActive: number | null = null;
  erreurFormulaire = false;
  messageErreur = '';

  fichierSelectionne: File | null = null;
  importErreurMsg = '';
  toastMessage = '';
  toastSecondaire = '';

  readonly typesActif = TYPES_ACTIF;
  readonly classeBadgeActifAval = classeBadgeActifAval;
  readonly emojiActifAval = emojiActifAval;
  readonly kwhParM2 = KWH_PAR_M2_AN;

  facteursDisponibles: FacteurDetaille[] = [];
  facteursCompatibles: FacteurDetaille[] = [];
  facteurChoisiId: number | null = null;
  avertissementReferentiel = '';
  erreurInitialisation = '';
  avertissementStockage = '';

  usinesDisponibles: Usine[] = [];
  filiales: Filiale[] = [];
  societeActiveId: number | null = null;
  societeActiveLabel = 'Groupe MISFAT';
  deviseActive = 'TND';

  formModel = {
    reference: '',
    designation: '',
    typeActif: 'Entrepôt / Logistique' as TypeActifAval,
    locataire: '',
    provenance: 'Réel' as Provenance,
    modeSaisie: 'Consommation' as ModeSaisie,
    energie: 'Électricité' as EnergieActif,
    quantite: null as number | null,
    unite: 'kWh'
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
   * Initialisation défensive : un échec est rapporté dans l'interface, jamais
   * propagé au tableau de bord dont il interromprait le rendu.
   */
  ngOnInit(): void {
    try {
      this.listeEmissions = this.listeEmissions ?? [];

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
        this.sansActivite = localStorage.getItem(CLE_SANS_ACTIVITE) === 'true';
      }

      this.chargerFacteurs();
      this.chargerFiliales();

      this.entityService.filter$.subscribe({
        next: filtre => {
          this.societeActiveId = filtre?.entityId ?? null;
          this.majPerimetre();
        },
        error: () => this.signalerEchec('Périmètre organisationnel indisponible.')
      });

      if (isDevMode()) console.log('Composant ActifsLouesAval initialisé avec succès');
    } catch (erreur) {
      this.signalerEchec(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }

  private signalerEchec(message: string): void {
    this.erreurInitialisation = message;
    console.error('[actifs-loues-aval] initialisation incomplète :', message);
    this.cdr.detectChanges();
  }

  basculerSansActivite(): void {
    this.sansActivite = !this.sansActivite;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(CLE_SANS_ACTIVITE, String(this.sansActivite));
    }
    this.cdr.detectChanges();
  }

  /** La déclaration contredit les lignes saisies. */
  get contradictionDeclaration(): boolean {
    return this.sansActivite && this.listeEmissions.length > 0;
  }

  private chargerFacteurs(): void {
    this.referentialService.getFactorsByCategory(MOTIF_CATEGORIE).subscribe({
      next: facteurs => {
        this.facteursDisponibles = Array.isArray(facteurs) ? facteurs : [];
        this.avertissementReferentiel = this.facteursDisponibles.length
          ? ''
          : 'Le référentiel MS SQL ne documente pas encore la catégorie 13 : les facteurs de '
            + 'repli ADEME sont appliqués. Versez la base pour les remplacer.';
        this.majFacteursCompatibles();
        this.cdr.detectChanges();
      },
      error: () => {
        this.avertissementReferentiel = 'Référentiel carbone injoignable (port 8082) : '
          + 'les facteurs de repli ADEME sont appliqués.';
        this.cdr.detectChanges();
      }
    });
  }

  private chargerFiliales(): void {
    this.organizationService.getFiliales().subscribe({
      next: filiales => {
        this.filiales = Array.isArray(filiales) ? filiales : [];
        this.majPerimetre();
      },
      error: () => { this.filiales = []; this.majPerimetre(); }
    });
  }

  private majPerimetre(): void {
    const societe = this.filiales.find(f => f.id === this.societeActiveId) ?? null;
    this.societeActiveLabel = societe?.libelle ?? 'Groupe MISFAT';
    this.deviseActive = societe?.devise?.trim().toUpperCase() || 'TND';
    this.usinesDisponibles = societe
      ? (societe.usines ?? [])
      : this.filiales.flatMap(f => f.usines ?? []);
    this.cdr.detectChanges();
  }

  // ---------- Tableau et pagination ----------

  get emissionsFiltrees(): EmissionActifAval[] {
    const terme = this.rechercheTexte.trim().toLowerCase();

    const liste = this.listeEmissions.filter(item => {
      if (this.filtreType !== 'Tous' && item.typeActif !== this.filtreType) return false;
      if (this.filtreProvenance !== 'Toutes' && item.provenance !== this.filtreProvenance) return false;
      if (!terme) return true;
      return [item.reference, item.designation, item.locataire, item.typeActif ?? '', item.baseAppliquee]
        .some(champ => (champ ?? '').toLowerCase().includes(terme));
    });

    if (this.sortColumn) {
      liste.sort((a, b) => {
        const sens = this.sortDirection === 'asc' ? 1 : -1;
        if (this.sortColumn === 'emissions') return (a.emissionCalculee - b.emissionCalculee) * sens;
        if (this.sortColumn === 'consommation') {
          return ((a.consommation ?? 0) - (b.consommation ?? 0)) * sens;
        }
        if (this.sortColumn === 'designation') return a.designation.localeCompare(b.designation) * sens;
        return 0;
      });
    }
    return liste;
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.emissionsFiltrees.length / this.taillePage));
  }

  get emissionsPage(): EmissionActifAval[] {
    const liste = this.emissionsFiltrees;
    const page = Math.min(this.pageCourante, Math.max(1, Math.ceil(liste.length / this.taillePage)));
    return liste.slice((page - 1) * this.taillePage, (page - 1) * this.taillePage + this.taillePage);
  }

  get premierIndexPage(): number {
    return this.emissionsFiltrees.length ? (this.pageCourante - 1) * this.taillePage + 1 : 0;
  }

  get dernierIndexPage(): number {
    return Math.min(this.pageCourante * this.taillePage, this.emissionsFiltrees.length);
  }

  allerPage(page: number): void {
    this.pageCourante = Math.min(Math.max(1, page), this.nombrePages);
    this.cdr.detectChanges();
  }

  changerTaillePage(): void {
    this.taillePage = Number(this.taillePage);
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  onFiltreChange(): void { this.pageCourante = 1; this.cdr.detectChanges(); }

  get totalEmissions(): number {
    return this.emissionsFiltrees.reduce((s, e) => s + e.emissionCalculee, 0);
  }

  get nombreReplis(): number {
    return this.listeEmissions.filter(e => e.origineFacteur === 'ADEME').length;
  }

  sortData(colonne: string): void {
    if (this.sortColumn === colonne) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = colonne;
      this.sortDirection = 'desc';
    }
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  reinitialiserFiltres(): void {
    this.filtreType = 'Tous';
    this.filtreProvenance = 'Toutes';
    this.rechercheTexte = '';
    this.pageCourante = 1;
    this.cdr.detectChanges();
  }

  // ---------- Modale ----------

  ouvrirModale(emission?: EmissionActifAval): void {
    this.erreurFormulaire = false;
    this.messageErreur = '';

    if (emission) {
      this.isEdition = true;
      this.idEditionActive = emission.id;
      this.formModel = {
        reference: emission.reference,
        designation: emission.designation,
        typeActif: emission.typeActif ?? 'Entrepôt / Logistique',
        locataire: emission.locataire,
        provenance: emission.provenance === 'Excel' ? 'Réel' : emission.provenance,
        modeSaisie: emission.modeSaisie,
        energie: emission.energie,
        quantite: emission.quantite,
        unite: emission.unite
      };
    } else {
      this.isEdition = false;
      this.idEditionActive = null;
      this.formModel = {
        reference: '', designation: '', typeActif: 'Entrepôt / Logistique',
        locataire: '', provenance: 'Réel', modeSaisie: 'Consommation',
        energie: 'Électricité', quantite: null, unite: 'kWh'
      };
    }

    this.majFacteursCompatibles();
    this.modaleSaisieOuverte = true;
    this.cdr.detectChanges();
  }

  fermerModale(): void { this.modaleSaisieOuverte = false; this.cdr.detectChanges(); }

  get unitesDisponibles(): string[] {
    return UNITES_PAR_MODE[this.formModel.modeSaisie] ?? [];
  }

  /** Le mode de saisie commande l'unité : la première du mode fait foi. */
  onModeSaisieChange(): void {
    const unites = this.unitesDisponibles;
    if (!unites.includes(this.formModel.unite)) this.formModel.unite = unites[0] ?? '';
    this.majFacteursCompatibles();
    this.cdr.detectChanges();
  }

  onCritereChange(): void { this.majFacteursCompatibles(); this.cdr.detectChanges(); }
  onSaisieChange(): void { this.cdr.detectChanges(); }
  onFacteurChoisiChange(): void { this.cdr.detectChanges(); }

  private majFacteursCompatibles(): void {
    this.facteursCompatibles = classerFacteursAval(this.facteursDisponibles, {
      type: this.formModel.typeActif,
      mode: this.formModel.modeSaisie,
      energie: this.formModel.energie,
      devise: this.deviseActive
    });
    this.facteurChoisiId = this.facteursCompatibles[0]?.id ?? null;
  }

  /** L'énergie desservante ne change le facteur que pour une consommation. */
  get afficherEnergie(): boolean {
    return this.formModel.modeSaisie !== 'Monétaire';
  }

  get facteurCourant() {
    const choisi = this.facteursCompatibles.find(f => f.id === Number(this.facteurChoisiId));
    if (choisi) {
      return {
        origine: 'MS SQL BDD' as OrigineFacteur, valeur: choisi.factorValue,
        unite: choisi.unit, libelle: choisi.typeName,
        reference: choisi.referenceCode, baseAppliquee: choisi.databaseSource, id: choisi.id
      };
    }
    return retenirFacteurAval(this.facteursDisponibles, {
      type: this.formModel.typeActif,
      mode: this.formModel.modeSaisie,
      energie: this.formModel.energie,
      devise: this.deviseActive
    });
  }

  get consommationPrevisionnelle(): number | null {
    return consommationValorisee({
      mode: this.formModel.modeSaisie, quantite: this.formModel.quantite
    });
  }

  get uniteConsommationCourante(): string {
    return uniteValorisee(this.formModel.modeSaisie, this.formModel.unite);
  }

  get emissionPrevisionnelle(): number {
    return calculerEmissionAval(this.consommationPrevisionnelle, this.facteurCourant.valeur);
  }

  enregistrerEmission(): void {
    const m = this.formModel;

    if (!m.designation.trim()) return this.refuser('La désignation de l\'actif est obligatoire.');
    if (m.quantite === null || m.quantite <= 0) {
      return this.refuser(m.modeSaisie === 'Surface'
        ? 'La surface louée est obligatoire.'
        : 'La consommation ou le montant est obligatoire.');
    }

    const facteur = this.facteurCourant;
    const consommation = this.consommationPrevisionnelle;

    const ligne: EmissionActifAval = {
      id: this.idEditionActive ?? Date.now(),
      scope: 'SCOPE_3',
      categorie: LIBELLE_CATEGORIE,
      reference: m.reference.trim() || `ALA-${String(this.listeEmissions.length + 1).padStart(4, '0')}`,
      designation: m.designation.trim(),
      typeActif: m.typeActif,
      locataire: m.locataire.trim(),
      provenance: m.provenance,
      modeSaisie: m.modeSaisie,
      energie: m.energie,
      quantite: m.quantite,
      unite: normaliserUnite(m.unite),
      consommation,
      uniteConsommation: this.uniteConsommationCourante,
      facteur: facteur.valeur,
      uniteFacteur: facteur.unite,
      libelleFacteur: facteur.libelle,
      baseAppliquee: facteur.baseAppliquee,
      origineFacteur: facteur.origine,
      emissionCalculee: calculerEmissionAval(consommation, facteur.valeur),
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

  private sauvegarder(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(this.listeEmissions));
      this.avertissementStockage = '';
    } catch {
      this.avertissementStockage =
        `Volume trop important pour le stockage du navigateur (${this.listeEmissions.length} lignes).`;
      this.cdr.detectChanges();
    }
  }

  // ---------- Import ----------

  ouvrirModaleImport(): void {
    this.modaleImportOuverte = true;
    this.fichierSelectionne = null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerModaleImport(): void { this.modaleImportOuverte = false; this.cdr.detectChanges(); }

  onFichierChange(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    this.fichierSelectionne = input.files?.[0] ?? null;
    this.importErreurMsg = '';
    this.cdr.detectChanges();
  }

  fermerToast(): void {
    this.toastMessage = '';
    this.toastSecondaire = '';
    this.cdr.detectChanges();
  }

  telechargerGabarit(): void {
    const exemples = [
      {
        'Référence': 'ALA-0001', 'Désignation': 'Entrepôt Bizerte Nord',
        'Type Actif': 'Entrepôt / Logistique', 'Locataire': 'LOGIPARC SARL',
        'Mode Saisie': 'Surface', 'Quantité': 500, 'Unité': 'm²'
      },
      {
        'Référence': 'ALA-0002', 'Désignation': 'Plateau bureaux Tunis',
        'Type Actif': 'Bâtiment Commercial', 'Locataire': 'AUDIT CONSEIL',
        'Mode Saisie': 'Consommation', 'Quantité': 42000, 'Unité': 'kWh'
      }
    ];

    const feuille = XLSX.utils.json_to_sheet(exemples);
    feuille['!cols'] = [14, 30, 24, 24, 16, 14, 10].map(w => ({ wch: w }));
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Actifs aval');
    XLSX.writeFile(classeur, 'gabarit-actifs-loues-aval.xlsx');
  }

  /**
   * Import de la matrice des actifs loués en aval.
   *
   * <p>Le mode de saisie est déduit de l'unité quand le fichier est muet, et
   * chaque actif est rapproché du référentiel avec repli ADEME.</p>
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
        const feuille = classeur.Sheets[classeur.SheetNames[0]];
        const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(feuille, { defval: null });

        if (!lignes.length) {
          this.importErreurMsg = 'Classeur vide ou sans ligne exploitable.';
          this.cdr.detectChanges();
          return;
        }

        const horodatage = this.datePipe.transform(new Date(), 'dd/MM/yyyy HH:mm') ?? '';
        let replis = 0;
        let ignorees = 0;
        const ajoutees: EmissionActifAval[] = [];

        lignes.forEach((brute, index) => {
          const valeur = (...cles: string[]) => {
            for (const cle of cles) {
              const trouve = Object.keys(brute).find(
                k => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
                     === cle.toLowerCase()
              );
              if (trouve && brute[trouve] !== null) return brute[trouve];
            }
            return null;
          };

          const designation = String(valeur('designation', 'nom actif', 'actif') ?? '').trim();
          const quantite = Number(String(valeur('quantite', 'valeur', 'consommation') ?? '')
            .replace(/[\s ]/g, '').replace(',', '.'));

          if (!designation || !Number.isFinite(quantite)) { ignorees++; return; }

          const unite = normaliserUnite(String(valeur('unite', 'uom') ?? 'kWh'));
          const modeLu = String(valeur('mode saisie', 'mode calcul', 'approche') ?? '').trim();
          const modeSaisie = modeLu ? reconnaitreModeSaisie(modeLu) : modeDepuisUnite(unite);

          const typeActif = reconnaitreTypeActif(
            String(valeur('type actif', 'type', 'categorie') ?? ''), 'Bâtiment Commercial'
          );

          const facteur = retenirFacteurAval(this.facteursDisponibles, {
            type: typeActif!, mode: modeSaisie, energie: 'Électricité', devise: this.deviseActive
          });
          if (facteur.origine === 'ADEME') replis++;

          const consommation = consommationValorisee({ mode: modeSaisie, quantite });

          ajoutees.push({
            id: Date.now() + index,
            scope: 'SCOPE_3',
            categorie: LIBELLE_CATEGORIE,
            reference: String(valeur('reference', 'id', 'code') ?? '').trim()
              || `ALA-${String(index + 1).padStart(4, '0')}`,
            designation,
            typeActif,
            locataire: String(valeur('locataire', 'preneur', 'client') ?? '').trim(),
            provenance: 'Excel',
            modeSaisie,
            energie: 'Électricité',
            quantite,
            unite,
            consommation,
            uniteConsommation: uniteValorisee(modeSaisie, unite),
            facteur: facteur.valeur,
            uniteFacteur: facteur.unite,
            libelleFacteur: facteur.libelle,
            baseAppliquee: facteur.baseAppliquee,
            origineFacteur: facteur.origine,
            emissionCalculee: calculerEmissionAval(consommation, facteur.valeur),
            creeLe: horodatage
          });
        });

        if (!ajoutees.length) {
          this.importErreurMsg = 'Aucune ligne exploitable : les colonnes Désignation et '
            + 'Quantité sont attendues.';
          this.cdr.detectChanges();
          return;
        }

        this.listeEmissions = [...ajoutees, ...this.listeEmissions];
        this.pageCourante = 1;
        this.sauvegarder();

        this.toastMessage = `Importation de ${ajoutees.length} actifs loués en aval effectuée avec succès !`;
        this.toastSecondaire = replis
          ? `${replis} ligne(s) valorisée(s) par un facteur de repli ADEME.`
          : '';
        this.importErreurMsg = ignorees ? `${ignorees} ligne(s) écartée(s).` : '';

        this.modaleImportOuverte = false;
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
      'Reference': e.reference,
      'Designation': e.designation,
      'Type d actif': e.typeActif ?? '',
      'Locataire': e.locataire,
      'Mode saisie': e.modeSaisie,
      'Quantite': e.quantite,
      'Unite': e.unite,
      'Consommation / an': e.consommation,
      'Unite consommation': e.uniteConsommation,
      'Provenance': e.provenance,
      'Facteur': e.facteur,
      'Base appliquee': e.baseAppliquee,
      'Origine facteur': e.origineFacteur,
      'Emissions (kgCO2e)': e.emissionCalculee
    }));

    const feuille = XLSX.utils.json_to_sheet(donnees);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Actifs aval');
    XLSX.writeFile(classeur, `actifs-loues-aval-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
