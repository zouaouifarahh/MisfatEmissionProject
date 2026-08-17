import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import * as XLSX from 'xlsx';

import { EntityContextService, EntityOption } from '../../core/entity-context.service';
import { FlagIconComponent } from '../../shared/flag-icon/flag-icon.component';
import {
  ReferentialImportService,
  ReferentialImportLog
} from '../../services/referential-import.service';

import { DispatchStore, exerciceDepuisNom } from '../../shared/dispatch/dispatch-store';
import { ConfirmationService } from '../../shared/ui/confirmation.service';
import { lireClasseurDispatch, RapportDispatch } from '../../shared/dispatch/dispatch-excel';
import { REGLES, EcranDestination, CodeScope } from '../../shared/dispatch/regles-dispatch';

type EtatImport = 'idle' | 'upload' | 'traitement' | 'succes' | 'erreur';

/** Historique des ventilations, conservé côté navigateur. */
const CLE_HISTORIQUE_LOCAL = 'misfat_import_history_local';

/** Dépôts serveur retirés de l'affichage par l'utilisateur. */
const CLE_DEPOTS_MASQUES = 'misfat_import_masques';

/** Poste de la répartition d'un dépôt, restitué dans la modale de détail. */
export interface PosteVentilation {
  scope: CodeScope;
  categorie: string;
  icone: string;
  lignes: number;
  emissionKg: number;
}

/** Synthèse d'une destination alimentée par la ventilation. */
export interface SyntheseVentilation {
  ecran: EcranDestination;
  libelle: string;
  icone: string;
  scope: CodeScope;
  lignes: number;
  montant: number;
  emissionKg: number;
}

/**
 * Colonnes du gabarit unifié MISFAT, couvrant toutes les bases d'activité.
 *
 * <p>Une base donnée n'en renseigne qu'une partie : le moteur d'import résout
 * les colonnes par leur intitulé et ignore celles qui ne s'appliquent pas.</p>
 */
const COLONNES_MISFAT = [
  'CodeArticle', 'Type', 'Référence Carbone', 'Catégorie', 'Fact',
  'Valeur Fact', 'Descriptif', 'Valeur de Quantité', 'Source',
  'Date Fact', 'Unité', 'Pays', 'Distance Destination'
];

/**
 * Écran d'importation du référentiel carbone.
 *
 * <p>Dédié au classeur MISFAT : plus de sélecteur de type, le fichier attendu
 * est toujours le même et son dépôt alimente directement
 * {@code emission_factor} et {@code ref_emission_sources}.</p>
 */
@Component({
  selector: 'app-import-data',
  standalone: true,
  imports: [CommonModule, FormsModule, FlagIconComponent],
  templateUrl: './import-data.component.html',
  styleUrl: './import-data.component.css'
})
export class ImportDataComponent implements OnInit {
  @Output() imported = new EventEmitter<ReferentialImportLog>();

  private readonly importService = inject(ReferentialImportService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly dispatchStore = inject(DispatchStore);
  private readonly confirmation = inject(ConfirmationService);
  readonly entityService = inject(EntityContextService);

  /** Le parser serveur s'appuie sur Apache POI, qui ne lit pas le CSV. */
  readonly extensionsAcceptees = ['.xlsx', '.xls'];
  readonly tailleMaxMo = 200;
  readonly colonnesGabarit = COLONNES_MISFAT;

  /** Renseignée à la première émission du contexte : absente au premier rendu. */
  entite?: EntityOption;
  historique: ReferentialImportLog[] = [];
  chargementHistorique = false;

  fichier: File | null = null;
  etat: EtatImport = 'idle';
  progression = 0;
  survol = false;
  message = '';
  dernierLog: ReferentialImportLog | null = null;
  logDetaille: ReferentialImportLog | null = null;

  /**
   * Ventilation locale du même classeur.
   *
   * <p>Le serveur alimente le référentiel ; la ventilation, elle, achemine
   * chaque ligne comptable vers son écran de saisie. Les deux traitements
   * partent du fichier déposé, sans second dépôt.</p>
   */
  ventilation: RapportDispatch | null = null;
  resumeVentilation = '';
  detailVentilation = '';
  diagnosticVentilation = '';
  ventilationEnCours = false;
  avertissementPersistance = '';

  /**
   * Historique local des ventilations.
   *
   * <p>Le serveur ne journalise que les dépôts de référentiel : un classeur
   * comptable, qu'il refuse à juste titre, n'y laisserait aucune trace alors
   * qu'il a bel et bien alimenté le bilan.</p>
   */
  historiqueVentilation: ReferentialImportLog[] = [];

  /** Exercice et société consultés, suivis depuis le contexte global. */
  exerciceActif: number | null = null;
  entiteActive: number | null = null;

  /** Exercice retenu pour la dernière ventilation. */
  exerciceVentile: number | null = null;

  /** Issue de la ventilation, arbitrée avec la réponse du serveur. */
  private etatVentilation: 'en-cours' | 'reussie' | 'sans-objet' = 'sans-objet';

  /** Rejet du serveur mis en attente, le temps que la ventilation se prononce. */
  private rejetServeurEnAttente: { status?: number; error?: { message?: string } } | null = null;

  ngOnInit(): void {
    this.entityService.entity$.subscribe(e => {
      this.entite = e;
      this.cdr.markForCheck();
    });

    // Le périmètre consulté détermine l'exercice auquel une ventilation se
    // rattache, et celui sur lequel elle remonte dans les catégories.
    this.entityService.filter$.subscribe(filtre => {
      this.exerciceActif = filtre?.year ?? null;
      this.entiteActive = filtre?.entityId ?? null;
      this.dispatchStore.suivrePerimetre(this.exerciceActif, this.entiteActive);
      this.cdr.markForCheck();
    });

    // L'historique local précède l'appel au serveur : après un rafraîchissement,
    // les ventilations réussies s'affichent sans attendre la réponse réseau.
    this.relireMasques();
    this.relireHistoriqueLocal();
    this.avertissementPersistance = this.dispatchStore.avertissementPersistance;
    this.chargerHistorique();
  }

  // ---------- Bloc 1 : gabarit ----------

  /** Toujours disponible : le gabarit ne dépend d'aucune sélection. */
  /**
   * Le gabarit vient du serveur : les listes déroulantes Excel (DataValidation)
   * ne peuvent pas être produites par la librairie du navigateur.
   */
  telechargerGabarit(): void {
    window.location.href = this.importService.templateUrl;
  }

  // ---------- Bloc 2 : dépôt ----------

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.survol = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.survol = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.survol = false;
    const fichier = event.dataTransfer?.files?.[0];
    if (fichier) this.retenirFichier(fichier);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.retenirFichier(input.files[0]);
    input.value = '';
  }

  retirerFichier(): void {
    this.fichier = null;
    this.reinitialiserEtat();
  }

  private retenirFichier(fichier: File): void {
    const extension = fichier.name.slice(fichier.name.lastIndexOf('.')).toLowerCase();
    if (!this.extensionsAcceptees.includes(extension)) {
      this.etat = 'erreur';
      this.message = `Format non pris en charge (${extension}). Attendus : ${this.extensionsAcceptees.join(', ')}.`;
      return;
    }
    if (fichier.size > this.tailleMaxMo * 1024 * 1024) {
      this.etat = 'erreur';
      this.message = `Fichier trop volumineux (${this.formaterTaille(fichier.size)}), limite ${this.tailleMaxMo} Mo.`;
      return;
    }
    this.fichier = fichier;
    this.reinitialiserEtat();
  }

  get pretAEnvoyer(): boolean {
    return !!this.fichier && this.etat !== 'upload' && this.etat !== 'traitement';
  }

  envoyer(): void {
    if (!this.pretAEnvoyer || !this.fichier) return;

    this.etat = 'upload';
    this.progression = 0;
    this.message = '';
    this.dernierLog = null;

    // La ventilation est menée en parallèle de l'envoi : elle se lit dans le
    // navigateur et n'attend pas la réponse du serveur.
    this.ventiler(this.fichier);

    this.importService.upload(this.fichier).subscribe({
      next: evenement => {
        if (evenement.kind === 'progress') {
          this.progression = evenement.percent;
          // 100 % d'envoi ne signifie pas fin de traitement : le serveur lit
          // encore le classeur et met la base à jour.
          if (this.progression >= 100) this.etat = 'traitement';
          this.cdr.markForCheck();
          return;
        }
        this.dernierLog = evenement.log;
        this.etat = evenement.log.status === 'FAILED' ? 'erreur' : 'succes';
        this.message = this.messageBilan(evenement.log);
        this.imported.emit(evenement.log);
        this.chargerHistorique();
        this.cdr.markForCheck();
      },
      error: err => {
        this.progression = 0;

        // Le serveur n'accepte que les gabarits de référentiel. Un classeur
        // comptable est légitimement refusé : ce n'est pas un échec d'import
        // dès lors que la ventilation, elle, a abouti. On attend son verdict
        // avant de trancher.
        this.rejetServeurEnAttente = err;
        this.arbitrerResultat();
        this.chargerHistorique(); // le serveur a journalisé son propre refus
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Tranche entre le refus du serveur et la réussite de la ventilation.
   *
   * <p>Tant que la ventilation n'a pas rendu son verdict, aucune alerte n'est
   * affichée : annoncer un échec puis le démentir une seconde plus tard serait
   * pire que d'attendre.</p>
   */
  private arbitrerResultat(): void {
    if (!this.rejetServeurEnAttente) return;
    if (this.etatVentilation === 'en-cours') { this.etat = 'traitement'; return; }

    if (this.etatVentilation === 'reussie') {
      const traitees = this.ventilation?.lignes.filter(l => l.ecran).length ?? 0;
      this.etat = 'succes';
      this.message = `Importation et ventilation réussies : ${traitees} lignes traitées.`;
      this.rejetServeurEnAttente = null;
      return;
    }

    // Aucune ligne ventilée : le refus du serveur est le seul fait à rapporter.
    this.etat = 'erreur';
    this.message = this.messageErreur(this.rejetServeurEnAttente);
    this.rejetServeurEnAttente = null;
  }

  // ---------- Ventilation automatique vers les catégories ----------

  /**
   * Lit le classeur et achemine ses lignes vers les écrans de saisie.
   *
   * <p>Aucun classeur n'est refusé : ce qui n'a pas pu être lu figure au
   * diagnostic plutôt que sous un « fichier illisible » qui n'apprend rien.
   * Un classeur de référentiel, dépourvu de ligne comptable, laisse
   * simplement la ventilation vide sans troubler l'import.</p>
   */
  private ventiler(fichier: File): void {
    this.ventilationEnCours = true;
    this.etatVentilation = 'en-cours';
    this.ventilation = null;
    this.resumeVentilation = '';
    this.detailVentilation = '';
    this.diagnosticVentilation = '';

    const lecteur = new FileReader();

    lecteur.onerror = () => {
      this.ventilationEnCours = false;
      this.etatVentilation = 'sans-objet';
      this.diagnosticVentilation = 'Le navigateur n\'a pas pu relire ce fichier pour la '
        + 'ventilation. Vérifiez qu\'il n\'est pas ouvert dans Excel.';
      this.arbitrerResultat();
      this.cdr.markForCheck();
    };

    lecteur.onload = () => {
      // Le référentiel est chargé avant valorisation : sans lui, toutes les
      // lignes basculeraient sur les replis alors que la base les documente.
      this.dispatchStore.chargerFacteurs().subscribe({
        next: () => this.appliquerVentilation(lecteur.result),
        error: () => this.appliquerVentilation(lecteur.result)
      });
    };

    lecteur.readAsArrayBuffer(fichier);
  }

  private appliquerVentilation(contenu: unknown): void {
    try {
      const classeur = XLSX.read(contenu, { type: 'array', cellDates: true });
      const rapport = lireClasseurDispatch(classeur);
      this.ventilation = rapport;

      const ventilees = rapport.lignes.filter(l => l.ecran);

      if (ventilees.length) {
        // L'exercice se lit d'abord dans le nom du classeur — « BG MISFAT
        // 2025 » solde bien 2025 —, à défaut dans l'année consultée.
        const nomFichier = this.fichier?.name ?? '';
        const exercice = exerciceDepuisNom(nomFichier) ?? this.exerciceActif;

        this.dispatchStore.publier({
          lignes: this.dispatchStore.valoriser(rapport.lignes),
          fichier: nomFichier,
          importeLe: new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }),
          exclues: rapport.exclues,
          nonVentilees: rapport.nonVentilees,
          exercice,
          entityId: this.entiteActive
        });

        this.exerciceVentile = exercice;

        this.resumeVentilation = `${ventilees.length} ligne(s) ventilée(s) dans `
          + this.scopesAlimentes().join(', ') + '.';

        this.detailVentilation = this.detailParScope();
        this.avertissementPersistance = this.dispatchStore.avertissementPersistance;
        this.etatVentilation = 'reussie';
        this.journaliserVentilation(ventilees.length, rapport);
      } else {
        // Un classeur de référentiel n'a pas vocation à être ventilé.
        this.resumeVentilation = '';
        this.etatVentilation = 'sans-objet';
        this.diagnosticVentilation = rapport.lignes.length
          ? 'Aucune ligne de ce classeur ne relève d\'une catégorie du bilan carbone.'
          : (rapport.avertissements[0] ?? '');
      }

      this.ventilationEnCours = false;
      this.arbitrerResultat();
      this.cdr.markForCheck();
    } catch (erreur) {
      this.ventilationEnCours = false;
      this.etatVentilation = 'sans-objet';
      this.diagnosticVentilation = 'Ventilation impossible : '
        + (erreur instanceof Error ? erreur.message : 'format de classeur inattendu.');
      this.arbitrerResultat();
      this.cdr.markForCheck();
    }
  }

  /**
   * Inscrit la ventilation à l'historique, du côté du navigateur.
   *
   * <p>Le compte rendu porte le nombre de lignes réellement ventilées, non le
   * zéro que le serveur journalise en refusant un classeur qui n'est pas un
   * gabarit de référentiel.</p>
   */
  private journaliserVentilation(ventilees: number, rapport: RapportDispatch): void {
    const entree: ReferentialImportLog = {
      id: -Date.now(),
      fileName: this.fichier?.name ?? 'classeur comptable',
      importDate: new Date().toISOString(),
      totalRows: rapport.lignes.length,
      createdReferences: 0,
      createdSources: 0,
      createdFactors: 0,
      errorCount: rapport.nonVentilees,
      status: 'SUCCESS',
      errorDetail: rapport.nonVentilees
        ? `${rapport.nonVentilees} ligne(s) sans destination, ${rapport.exclues} écartée(s) du bilan.`
        : null,
      importedBy: 'Ventilation locale'
    };

    this.historiqueVentilation = [entree, ...this.historiqueVentilation];
    this.ventilationsParEntree.set(entree.id, ventilees);
    this.repartitionsParEntree.set(entree.id, this.repartitionDe(rapport));
    this.ecarteesParEntree.set(entree.id, rapport.exclues);
    this.exercicesParEntree.set(entree.id, this.exerciceVentile);
    this.avertissementsParEntree.set(
      entree.id, this.avertissementsDuMagasin(rapport.exclues, rapport.nonVentilees)
    );
    this.persisterHistoriqueLocal();
  }

  /** Répartition d'un import par scope et par catégorie. */
  private repartitionDe(rapport: RapportDispatch): PosteVentilation[] {
    const valorisees = this.dispatchStore.instantane.lignes;

    return REGLES.map(regle => {
      const lues = rapport.lignes.filter(l => l.ecran === regle.ecran);
      return {
        scope: regle.scope,
        categorie: regle.libelle,
        icone: regle.icone,
        lignes: lues.length,
        emissionKg: valorisees
          .filter(l => l.ecran === regle.ecran)
          .reduce((somme, l) => somme + l.emissionKg, 0)
      };
    }).filter(poste => poste.lignes > 0);
  }

  /** Répartition rattachée à une entrée d'historique locale. */
  private repartitionsParEntree = new Map<number, PosteVentilation[]>();

  /** Postes écartés du bilan pour une entrée locale. */
  private ecarteesParEntree = new Map<number, number>();

  /** Exercice rattaché à une entrée locale. */
  private exercicesParEntree = new Map<number, number | null>();

  ecarteesDe(log: ReferentialImportLog): number {
    return this.ecarteesParEntree.get(log.id) ?? 0;
  }

  exerciceDe(log: ReferentialImportLog): number | null {
    return this.exercicesParEntree.get(log.id) ?? null;
  }

  /**
   * Répartition du dépôt ouvert dans la modale de détail.
   *
   * <p>Un dépôt journalisé avant que la répartition ne soit mémorisée n'en
   * porte aucune : elle est alors reconstruite depuis le magasin, quand c'est
   * bien ce dépôt qu'il détient. Mieux vaut recalculer que d'annoncer à tort
   * « aucune ligne ventilée ».</p>
   */
  get repartitionDetaillee(): PosteVentilation[] {
    if (!this.logDetaille) return [];

    const memorisee = this.repartitionsParEntree.get(this.logDetaille.id);
    if (memorisee?.length) return memorisee;

    if (this.dispatchStore.instantane.fichier !== this.logDetaille.fileName) return [];
    return this.repartitionDuMagasin();
  }

  /**
   * Avertissements de qualification d'un dépôt.
   *
   * <p>Ils disent quelles colonnes du classeur restent à compléter : un
   * facteur de repli n'est pas une erreur, mais il pèse sur la précision du
   * bilan et l'utilisateur doit savoir où porter l'effort.</p>
   */
  get avertissementsDetailles(): string[] {
    if (!this.logDetaille) return [];

    const memorises = this.avertissementsParEntree.get(this.logDetaille.id);
    if (memorises?.length) return memorises;

    if (this.dispatchStore.instantane.fichier !== this.logDetaille.fileName) return [];
    return this.avertissementsDuMagasin(this.ecarteesDe(this.logDetaille),
                                        this.logDetaille.errorCount);
  }

  /** Avertissements déduits des lignes que le magasin détient. */
  private avertissementsDuMagasin(exclues: number, nonVentilees: number): string[] {
    const lignes = this.dispatchStore.instantane.lignes.filter(l => l.ecran);
    const messages: string[] = [];

    const replis = lignes.filter(l => l.origineFacteur === 'ADEME Fallback').length;
    if (replis) {
      messages.push(
        `${replis} ligne(s) valorisée(s) par un facteur de repli ADEME, faute de facteur `
        + 'correspondant au référentiel MS SQL. Versez la base de facteurs pour les affiner.'
      );
    }

    // Une immobilisation sans catégorie ne tombe pas sur le même repli qu'une
    // ligne de balance : la première prend le facteur de sécurité
    // « Équipements Ind. », la seconde le libellé de son compte. Un message
    // unique désignerait la mauvaise colonne à compléter.
    const immobilisations = lignes.filter(l => l.categorieAbsente && l.ecran === 'investissements');
    if (immobilisations.length) {
      messages.push(
        `${immobilisations.length} immobilisation(s) sans catégorie carbone exploitable : le `
        + 'facteur de sécurité « Équipements Ind. » (0,250 kgCO₂e/TND) leur est appliqué. '
        + 'Complétez la colonne « Catégorie Carbone » du classeur d\'immobilisations pour affiner.'
      );
    }

    const comptables = lignes.filter(l => l.categorieAbsente && l.ecran !== 'investissements');
    if (comptables.length) {
      messages.push(
        `${comptables.length} ligne(s) comptable(s) sans catégorie carbone exploitable (colonne `
        + '« Catégorie Carbone » vide, à 0 ou #N/A) : le libellé du compte a servi de repli. '
        + 'Complétez cette colonne dans la balance pour gagner en précision.'
      );
    }

    if (nonVentilees) {
      messages.push(
        `${nonVentilees} ligne(s) qu'aucune règle n'a su rattacher à une catégorie du bilan : `
        + 'elles pèsent zéro tant qu\'elles ne sont pas qualifiées.'
      );
    }

    if (exclues) {
      messages.push(
        `${exclues} poste(s) écarté(s) du bilan à dessein (personnel, financier, impôts, `
        + 'dotations aux amortissements). Aucune action requise.'
      );
    }

    return messages;
  }

  /** Avertissements rattachés à une entrée d'historique locale. */
  private avertissementsParEntree = new Map<number, string[]>();

  /** Répartition déduite des lignes que le magasin détient. */
  private repartitionDuMagasin(): PosteVentilation[] {
    const lignes = this.dispatchStore.instantane.lignes;

    return REGLES.map(regle => {
      const retenues = lignes.filter(l => l.ecran === regle.ecran);
      return {
        scope: regle.scope,
        categorie: regle.libelle,
        icone: regle.icone,
        lignes: retenues.length,
        emissionKg: retenues.reduce((somme, l) => somme + l.emissionKg, 0)
      };
    }).filter(poste => poste.lignes > 0);
  }

  /** Total du dépôt ouvert, en kgCO₂e. */
  get totalDetaille(): number {
    return this.repartitionDetaillee.reduce((somme, p) => somme + p.emissionKg, 0);
  }

  /** Lignes ventilées par entrée locale, pour l'affichage de l'historique. */
  private ventilationsParEntree = new Map<number, number>();

  /**
   * Conserve l'historique local d'un rafraîchissement à l'autre.
   *
   * <p>Le serveur ne journalise que ses propres dépôts : sans cette
   * persistance, un F5 ferait réapparaître la ligne d'échec du référentiel à
   * la place de la ventilation réussie.</p>
   */
  private persisterHistoriqueLocal(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const charge = this.historiqueVentilation.map(log => ({
        log,
        lignesVentilees: this.ventilationsParEntree.get(log.id) ?? log.totalRows,
        repartition: this.repartitionsParEntree.get(log.id) ?? [],
        ecartees: this.ecarteesParEntree.get(log.id) ?? 0,
        exercice: this.exercicesParEntree.get(log.id) ?? null,
        avertissements: this.avertissementsParEntree.get(log.id) ?? []
      }));
      localStorage.setItem(CLE_HISTORIQUE_LOCAL, JSON.stringify(charge));
    } catch {
      console.warn('[import] historique local non mémorisé : quota du navigateur atteint.');
    }
  }

  private relireHistoriqueLocal(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const brut = localStorage.getItem(CLE_HISTORIQUE_LOCAL);
      if (!brut) return;

      const relu = JSON.parse(brut) as {
        log: ReferentialImportLog; lignesVentilees: number; repartition?: PosteVentilation[];
        ecartees?: number; exercice?: number | null; avertissements?: string[];
      }[];
      if (!Array.isArray(relu)) return;

      this.historiqueVentilation = relu.map(e => e.log);
      this.ventilationsParEntree = new Map(relu.map(e => [e.log.id, e.lignesVentilees]));
      this.repartitionsParEntree = new Map(relu.map(e => [e.log.id, e.repartition ?? []]));
      this.ecarteesParEntree = new Map(relu.map(e => [e.log.id, e.ecartees ?? 0]));
      this.exercicesParEntree = new Map(relu.map(e => [e.log.id, e.exercice ?? null]));
      this.avertissementsParEntree = new Map(relu.map(e => [e.log.id, e.avertissements ?? []]));
    } catch {
      this.historiqueVentilation = [];
    }
  }

  /**
   * Supprime un dépôt de l'historique et les mesures qu'il a engendrées.
   *
   * <p>Un dépôt ventilé est indissociable des lignes qu'il a produites :
   * effacer l'un sans l'autre laisserait des émissions orphelines dans les
   * catégories, sans plus aucune trace de leur provenance.</p>
   */
  async supprimerDepot(log: ReferentialImportLog): Promise<void> {
    const locale = this.estEntreeLocale(log);
    const lignes = this.ventilationsParEntree.get(log.id) ?? log.totalRows;

    const consequences = locale
      ? [
          `${lignes} ligne(s) ventilée(s) seront retirées des catégories de mesure.`,
          'Vos saisies manuelles ne sont pas touchées.'
        ]
      : [
          'Le dépôt disparaît de cet historique.',
          'Les facteurs déjà versés au référentiel restent en base : ils ne sont pas annulés.'
        ];

    const confirme = await this.confirmation.demander({
      titre: 'Confirmation de suppression',
      message: `Voulez-vous vraiment supprimer le dépôt « ${log.fileName} » ? `
        + 'Cette action est irréversible et retirera les calculs associés.',
      consequences,
      libelleAction: 'Oui, supprimer'
    });
    if (!confirme) return;

    if (!locale) {
      // Aucun point d'entrée serveur ne permet d'effacer un dépôt de
      // référentiel : il est retiré de l'affichage, et l'utilisateur en est
      // averti dans la boîte de confirmation.
      this.depotsMasques.add(log.id);
      this.persisterMasques();
      if (this.logDetaille?.id === log.id) this.logDetaille = null;
      this.cdr.markForCheck();
      return;
    }

    this.historiqueVentilation = this.historiqueVentilation.filter(l => l.id !== log.id);
    this.ventilationsParEntree.delete(log.id);
    this.repartitionsParEntree.delete(log.id);
    this.ecarteesParEntree.delete(log.id);
    this.exercicesParEntree.delete(log.id);
    this.avertissementsParEntree.delete(log.id);
    this.persisterHistoriqueLocal();

    // La répartition courante est celle du dernier dépôt : la retirer si c'est
    // lui qu'on supprime, la laisser sinon.
    if (this.dispatchStore.instantane.fichier === log.fileName) {
      this.dispatchStore.vider();
      this.ventilation = null;
      this.resumeVentilation = '';
      this.detailVentilation = '';
    }

    if (this.logDetaille?.id === log.id) this.logDetaille = null;
    this.cdr.markForCheck();
  }

  /** Efface la trace locale des ventilations. */
  viderHistoriqueLocal(): void {
    this.historiqueVentilation = [];
    this.ventilationsParEntree.clear();
    this.repartitionsParEntree.clear();
    this.ecarteesParEntree.clear();
    this.exercicesParEntree.clear();
    this.avertissementsParEntree.clear();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLE_HISTORIQUE_LOCAL);
    this.cdr.markForCheck();
  }

  /** Une entrée d'historique produite par la ventilation locale ? */
  estEntreeLocale(log: ReferentialImportLog): boolean {
    return log.id < 0;
  }

  /** Nombre de lignes à afficher pour une entrée d'historique. */
  lignesTraitees(log: ReferentialImportLog): number {
    return this.ventilationsParEntree.get(log.id) ?? log.totalRows;
  }

  /**
   * Historique affiché : ventilations locales puis dépôts du référentiel.
   *
   * <p>Le rejet journalisé par le serveur pour un classeur déjà ventilé est
   * masqué : afficher « Échec / 0 ligne » à côté de la ventilation réussie du
   * même fichier ne dirait rien de vrai à l'utilisateur.</p>
   */
  get historiqueComplet(): ReferentialImportLog[] {
    const ventiles = new Set(this.historiqueVentilation.map(l => l.fileName));

    const serveur = this.historique
      .filter(log => !(log.status === 'FAILED' && ventiles.has(log.fileName)))
      .filter(log => !this.depotsMasques.has(log.id));

    return [...this.historiqueVentilation, ...serveur];
  }

  /** Dépôts serveur retirés de l'affichage, faute de suppression en base. */
  private depotsMasques = new Set<number>();

  private persisterMasques(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CLE_DEPOTS_MASQUES, JSON.stringify([...this.depotsMasques]));
    } catch {
      console.warn('[import] dépôts masqués non mémorisés : quota atteint.');
    }
  }

  private relireMasques(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const brut = localStorage.getItem(CLE_DEPOTS_MASQUES);
      const relu = brut ? JSON.parse(brut) : [];
      if (Array.isArray(relu)) this.depotsMasques = new Set(relu.map(Number));
    } catch {
      this.depotsMasques = new Set();
    }
  }

  /** Scopes effectivement alimentés, dans l'ordre du GHG Protocol. */
  private scopesAlimentes(): string[] {
    const presents = new Set(this.syntheseVentilation.map(s => s.scope));
    return (['SCOPE_1', 'SCOPE_2', 'SCOPE_3'] as CodeScope[])
      .filter(code => presents.has(code))
      .map(code => code.replace('_', ' '));
  }

  private detailParScope(): string {
    return (['SCOPE_1', 'SCOPE_2', 'SCOPE_3'] as CodeScope[])
      .map(code => {
        const lignes = this.syntheseVentilation
          .filter(s => s.scope === code)
          .reduce((somme, s) => somme + s.lignes, 0);
        return lignes ? `${code.replace('_', ' ')} : ${lignes}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }

  /** Synthèse par destination, ordonnée comme les règles de ventilation. */
  get syntheseVentilation(): SyntheseVentilation[] {
    const lignes = this.ventilation?.lignes ?? [];
    const valorisees = this.dispatchStore.instantane.lignes;

    return REGLES.map(regle => {
      const retenues = lignes.filter(l => l.ecran === regle.ecran);
      const emissionKg = valorisees
        .filter(l => l.ecran === regle.ecran)
        .reduce((somme, l) => somme + l.emissionKg, 0);

      return {
        ecran: regle.ecran,
        libelle: regle.libelle,
        icone: regle.icone,
        scope: regle.scope,
        lignes: retenues.length,
        montant: retenues.reduce((somme, l) => somme + l.quantite, 0),
        emissionKg
      };
    }).filter(s => s.lignes > 0);
  }

  get totalEmissionsVentilees(): number {
    return this.dispatchStore.instantane.lignes.reduce((somme, l) => somme + l.emissionKg, 0);
  }

  viderVentilation(): void {
    this.dispatchStore.vider();
    this.ventilation = null;
    this.resumeVentilation = '';
    this.detailVentilation = '';
    this.cdr.markForCheck();
  }

  // ---------- Bloc 3 : historique ----------

  chargerHistorique(): void {
    this.chargementHistorique = true;
    this.importService.getHistory().subscribe({
      next: logs => {
        this.historique = logs;
        this.chargementHistorique = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.historique = [];
        this.chargementHistorique = false;
        this.cdr.markForCheck();
      }
    });
  }

  voirDetails(log: ReferentialImportLog): void {
    this.logDetaille = log;
  }

  fermerDetails(): void {
    this.logDetaille = null;
  }

  classeStatut(statut: string): string {
    switch (statut) {
      case 'SUCCESS': return 'pill-success';
      case 'PARTIAL_SUCCESS': return 'pill-warning';
      case 'FAILED': return 'pill-danger';
      default: return 'pill-neutral';
    }
  }

  libelleStatut(statut: string): string {
    switch (statut) {
      case 'SUCCESS': return 'Succès';
      case 'PARTIAL_SUCCESS': return 'Partiel';
      case 'FAILED': return 'Échec';
      default: return statut;
    }
  }

  // ---------- Utilitaires ----------

  private messageBilan(log: ReferentialImportLog): string {
    if (log.status === 'FAILED') {
      return `Aucune ligne exploitable sur ${log.totalRows}.`;
    }
    const creations = `${log.createdFactors} facteur(s), ${log.createdReferences} référence(s), ${log.createdSources} source(s)`;
    if (log.createdFactors === 0 && log.createdReferences === 0) {
      return `${log.totalRows} ligne(s) lue(s) — référentiel déjà à jour, aucune création.`;
    }
    return `${log.totalRows} ligne(s) lue(s) — ${creations} créé(s).`;
  }

  private messageErreur(err: { status?: number; error?: { message?: string } }): string {
    switch (err?.status) {
      case 0: return "Service des émissions injoignable (port 8082).";
      case 413: return `Fichier refusé par le serveur : limite ${this.tailleMaxMo} Mo dépassée.`;
      case 422: return 'Fichier illisible : vérifiez les colonnes officielles du référentiel.';
      default: return err?.error?.message ?? `Échec de l'import (code ${err?.status ?? 'inconnu'}).`;
    }
  }

  private reinitialiserEtat(): void {
    this.etat = 'idle';
    this.progression = 0;
    this.message = '';
    this.dernierLog = null;
  }

  formaterTaille(octets: number): string {
    if (octets < 1024) return `${octets} o`;
    if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
    return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
