import {
  ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID, inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import * as XLSX from 'xlsx';

import {
  ActivityDataService, CHAMPS_ACTIVITE, DonneesActivite, releveVide
} from '../../core/activity-data.service';
import { EntityContextService } from '../../core/entity-context.service';
import { extraireActivite } from './extraction-activite';

/**
 * Saisie et import des données d'activité extra-financières.
 *
 * <p>Un bilan carbone ne se lit pas seul : c'est le rapport à l'activité —
 * pièces produites, chiffre d'affaires, effectif — qui distingue un effort de
 * décarbonation d'un simple ralentissement. Cet écran est le seul endroit où
 * ces dénominateurs sont tenus ; le tableau de bord et les deux modes du
 * rapport les lisent, aucun ne les redéfinit.</p>
 */
@Component({
  selector: 'app-activity-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './activity-data.component.html',
  styleUrl: './activity-data.component.css'
})
export class ActivityDataComponent implements OnInit, OnDestroy {
  private readonly activite = inject(ActivityDataService);
  private readonly entityService = inject(EntityContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly champs = CHAMPS_ACTIVITE;

  /** Société consultée ; les relevés lui appartiennent. */
  entityId: number | null = null;
  libelleSociete = 'Groupe MISFAT — vue consolidée';
  devise = 'TND';

  /** Exercice en cours d'édition dans le formulaire. */
  anneeEditee: number | null = null;
  formulaire: DonneesActivite = releveVide(new Date().getFullYear());

  historique: DonneesActivite[] = [];

  message = '';
  erreur = '';

  /** Suppression confirmée en deux temps : un clic seul n'efface rien. */
  suppressionEnAttente: number | null = null;

  // ---------- IMPORT ----------
  survol = false;
  nomFichier = '';
  reconnus: string[] = [];
  avertissements: string[] = [];

  private readonly abonnements = new Subscription();

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {}

  ngOnInit(): void {
    this.abonnements.add(this.entityService.filter$.subscribe(filtre => {
      this.entityId = filtre.entityId;
      this.anneeEditee = filtre.year;
      this.rafraichir();
    }));

    this.abonnements.add(this.entityService.entity$.subscribe(entite => {
      this.libelleSociete = entite.id === null ? 'Groupe MISFAT — vue consolidée' : entite.label;
      this.devise = entite.currency === 'Multi-devise' ? 'TND' : entite.currency;
      this.cdr.markForCheck();
    }));

    this.abonnements.add(this.activite.donnees$.subscribe(() => this.rafraichir()));
  }

  ngOnDestroy(): void {
    this.abonnements.unsubscribe();
  }

  /** Exercices proposés au sélecteur : ceux déjà saisis et une fenêtre glissante. */
  get anneesProposees(): number[] {
    const courante = new Date().getFullYear();
    const fenetre = Array.from({ length: 7 }, (_, i) => courante - 4 + i);
    const saisies = this.activite.annees(this.entityId);
    return [...new Set([...fenetre, ...saisies])].sort((a, b) => a - b);
  }

  private rafraichir(): void {
    this.historique = this.activite.liste(this.entityId);
    this.chargerFormulaire(this.anneeEditee);
    this.cdr.markForCheck();
  }

  /** Recharge le formulaire sur un exercice donné. */
  private chargerFormulaire(annee: number | null): void {
    const cible = annee ?? new Date().getFullYear();
    this.anneeEditee = cible;
    this.formulaire = { ...(this.activite.pour(this.entityId, cible) ?? releveVide(cible)) };
  }

  /** L'utilisateur change d'exercice dans le sélecteur. */
  changerAnnee(annee: number | string): void {
    this.chargerFormulaire(Number(annee));
    this.message = '';
    this.erreur = '';
    this.cdr.markForCheck();
  }

  /** Le relevé de l'exercice édité existe-t-il déjà ? */
  get exerciceExistant(): boolean {
    return this.activite.pour(this.entityId, this.anneeEditee) !== null;
  }

  // ---------- CRUD ----------

  /** Ouvre un exercice vierge : l'année suivant la plus récente saisie. */
  ajouterAnnee(): void {
    const derniere = this.historique.length
      ? this.historique[this.historique.length - 1].annee
      : new Date().getFullYear() - 1;

    this.chargerFormulaire(derniere + 1);
    this.message = `Exercice ${this.anneeEditee} ouvert à la saisie. Renseignez puis enregistrez.`;
    this.erreur = '';
    this.cdr.markForCheck();
  }

  /**
   * Enregistre le relevé de l'exercice édité.
   *
   * <p>Une valeur négative est refusée : ni un effectif, ni une production, ni
   * un chiffre d'affaires ne peut l'être, et l'accepter donnerait des ratios de
   * signe inverse sans que rien ne le signale.</p>
   */
  enregistrer(): void {
    this.message = '';
    this.erreur = '';

    if (this.anneeEditee === null || !Number.isFinite(this.anneeEditee)) {
      this.erreur = 'Sélectionnez un exercice avant d\'enregistrer.';
      return;
    }

    for (const champ of this.champs) {
      const valeur = this.formulaire[champ.cle];
      if (valeur !== null && valeur !== undefined && Number(valeur) < 0) {
        this.erreur = `${champ.libelle} ne peut pas être négatif.`;
        return;
      }
    }

    this.activite.enregistrer(this.entityId, { ...this.formulaire, annee: this.anneeEditee });
    this.message = `Exercice ${this.anneeEditee} enregistré. Le tableau de bord et les rapports `
      + 'se recalculent immédiatement.';
    this.cdr.markForCheck();
  }

  /** Charge une ligne du tableau dans le formulaire. */
  editer(releve: DonneesActivite): void {
    this.chargerFormulaire(releve.annee);
    this.message = '';
    this.erreur = '';
    this.cdr.markForCheck();
  }

  demanderSuppression(annee: number): void {
    this.suppressionEnAttente = annee;
  }

  annulerSuppression(): void {
    this.suppressionEnAttente = null;
  }

  confirmerSuppression(annee: number): void {
    this.activite.supprimer(this.entityId, annee);
    this.suppressionEnAttente = null;
    this.message = `Exercice ${annee} supprimé.`;
    this.cdr.markForCheck();
  }

  /** Supprime l'exercice actuellement édité. */
  supprimerCourant(): void {
    if (this.anneeEditee === null) return;
    this.confirmerSuppression(this.anneeEditee);
    this.chargerFormulaire(this.anneeEditee);
  }

  // ---------- IMPORT ----------

  surSurvol(event: DragEvent, actif: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    this.survol = actif;
    this.cdr.markForCheck();
  }

  surDepot(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.survol = false;

    const fichier = event.dataTransfer?.files?.[0];
    if (fichier) this.lireFichier(fichier);
  }

  surSelection(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0];
    if (fichier) this.lireFichier(fichier);
  }

  /**
   * Lit un classeur déposé et en tire les relevés.
   *
   * <p>Les formats tabulaires — classeurs et CSV — sont lus par la même
   * bibliothèque que le reste de l'application. Le PDF, lui, est refusé
   * explicitement : aucun analyseur n'est embarqué, et deviner des chiffres
   * dans un flux compressé produirait des valeurs fausses là où le rapport
   * exige des valeurs vérifiables.</p>
   */
  private lireFichier(fichier: File): void {
    this.nomFichier = fichier.name;
    this.message = '';
    this.erreur = '';
    this.reconnus = [];
    this.avertissements = [];

    if (!isPlatformBrowser(this.platformId)) return;

    if (/\.pdf$/i.test(fichier.name)) {
      this.erreur = 'Les rapports PDF ne sont pas lus automatiquement : aucun analyseur PDF '
        + 'n\'est embarqué dans l\'application. Exportez le tableau en Excel ou CSV, ou '
        + 'saisissez les valeurs dans le formulaire ci-dessous.';
      this.cdr.markForCheck();
      return;
    }

    if (!/\.(xlsx|xls|csv)$/i.test(fichier.name)) {
      this.erreur = 'Format non reconnu. Déposez un classeur Excel (.xlsx, .xls) ou un fichier CSV.';
      this.cdr.markForCheck();
      return;
    }

    const lecteur = new FileReader();

    lecteur.onload = () => {
      try {
        const classeur = XLSX.read(lecteur.result, { type: 'array' });
        const lignes = classeur.SheetNames.flatMap(nom =>
          XLSX.utils.sheet_to_json<unknown[]>(classeur.Sheets[nom], { header: 1, raw: true, defval: null })
        );

        const resultat = extraireActivite(lignes, this.anneeEditee);
        this.reconnus = resultat.reconnus;
        this.avertissements = resultat.avertissements;

        if (!resultat.releves.length) {
          this.erreur = 'Aucune donnée d\'activité n\'a pu être extraite de ce fichier.';
          this.cdr.markForCheck();
          return;
        }

        this.activite.enregistrerLot(this.entityId, resultat.releves);
        this.chargerFormulaire(this.anneeEditee);

        const annees = resultat.releves.map(r => r.annee).join(', ');
        this.message = `${resultat.releves.length} exercice(s) importé(s) depuis `
          + `${fichier.name} : ${annees}.`;
      } catch (erreur) {
        console.error('[activite] Lecture du fichier impossible', erreur);
        this.erreur = 'Le fichier n\'a pas pu être lu. Vérifiez qu\'il s\'agit bien d\'un '
          + 'classeur Excel ou d\'un CSV non protégé.';
      }

      this.cdr.markForCheck();
      this.cdr.detectChanges();
    };

    lecteur.onerror = () => {
      this.erreur = 'La lecture du fichier a échoué.';
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    };

    lecteur.readAsArrayBuffer(fichier);
  }

  // ---------- MISE EN FORME ----------

  /** Valeur d'un champ, tiret cadratin quand elle manque. */
  afficher(releve: DonneesActivite, champ: string): string {
    const valeur = (releve as unknown as Record<string, unknown>)[champ];
    if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return '—';
    return valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }

  /** Unité d'un champ, la devise étant celle du périmètre consulté. */
  unite(champ: { cle: string; unite: string }): string {
    return champ.cle === 'chiffreAffairesM' ? `M ${this.devise}` : champ.unite;
  }
}
