import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OrganizationService } from '../../services/organization.service';
import { EntityContextService } from '../../core/entity-context.service';
import { Filiale, Usine, AnneeReference } from '../../models/organization.model';
import { PAYS_DU_MONDE, Pays, drapeauEmoji, normaliserPays } from '../../core/pays-catalogue';

/** Saisie de l'écran, distincte du modèle renvoyé par l'API. */
interface FormulaireSociete {
  id: number | null;
  libelle: string;
  code: string;
  pays: string;
  devise: string;
  dateCreation: string;
}

const FORMULAIRE_VIDE: FormulaireSociete = {
  id: null,
  libelle: '',
  code: '',
  pays: 'Tunisie',
  devise: 'TND',
  dateCreation: ''
};

/**
 * Gestion des sociétés du groupe.
 *
 * <p>Écran de référentiel : la société porte le pays, la devise principale et
 * la date de création qui alimentent ensuite les filtres, le drapeau et la
 * valorisation monétaire du tableau de bord. Toute modification est propagée au
 * contexte applicatif, sans rechargement de la page.</p>
 */
@Component({
  selector: 'app-gestion-societes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestion-societes.component.html',
  styleUrl: './gestion-societes.component.css'
})
export class GestionSocietesComponent implements OnInit {

  /** Émis après toute écriture : le tableau de bord recharge son périmètre. */
  @Output() modifie = new EventEmitter<void>();

  private readonly organizationService = inject(OrganizationService);
  private readonly entityService = inject(EntityContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly devisesDisponibles = ['TND', 'EUR', 'MAD', 'USD', 'GBP', 'CHF', 'AED', 'CNY', 'JPY'];

  // ---------- Sélecteur de pays ----------
  /**
   * Liste complète des pays, filtrée à la frappe.
   *
   * <p>Un `<select>` de 135 entrées serait inutilisable : le champ combine donc
   * une saisie libre et une liste déroulante restreinte à la recherche.</p>
   */
  paysOuvert = false;
  recherchePays = '';

  get paysFiltres(): Pays[] {
    const terme = normaliserPays(this.recherchePays);
    if (!terme) return PAYS_DU_MONDE;
    return PAYS_DU_MONDE.filter(p => normaliserPays(p.nom).includes(terme));
  }

  ouvrirPays(): void {
    this.paysOuvert = true;
    this.recherchePays = '';
    this.cdr.markForCheck();
  }

  fermerPays(): void {
    this.paysOuvert = false;
    this.cdr.markForCheck();
  }

  choisirPays(pays: Pays): void {
    this.formulaire.pays = pays.nom;
    this.paysOuvert = false;
    this.cdr.markForCheck();
  }

  societes: Filiale[] = [];
  chargement = false;

  formulaire: FormulaireSociete = { ...FORMULAIRE_VIDE };
  modeEdition = false;

  // Exercices carbone, gérés depuis le même écran de paramétrage.
  annees: AnneeReference[] = [];
  nouvelleAnnee: number | null = null;

  societeASupprimer: Filiale | null = null;

  message: string | null = null;
  messageType: 'success' | 'danger' | 'info' = 'success';
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.charger();
    this.chargerAnnees();
    this.nouvelleAnnee = new Date().getFullYear();
  }

  // ---------- Lecture ----------

  charger(): void {
    this.chargement = true;
    this.organizationService.getFiliales().subscribe({
      next: societes => {
        this.societes = societes;
        this.chargement = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.chargement = false;
        this.afficherMessage('Chargement des sociétés impossible.', 'danger');
      }
    });
  }

  chargerAnnees(): void {
    this.organizationService.getAnnees().subscribe({
      next: annees => {
        this.annees = annees;
        this.cdr.markForCheck();
      },
      error: () => this.afficherMessage('Chargement des exercices impossible.', 'danger')
    });
  }

  drapeau(pays: string | null | undefined): string {
    return drapeauEmoji(pays);
  }

  // ---------- Usines d'une société ----------

  /** Société dont on gère les usines ; null si le panneau est fermé. */
  societeUsines: Filiale | null = null;
  usines: Usine[] = [];
  nouvelleUsine = { nom: '', emplacement: '' };
  usineEnEdition: number | null = null;

  ouvrirUsines(societe: Filiale): void {
    this.societeUsines = societe;
    this.annulerEditionUsine();
    this.chargerUsines(societe.id);
  }

  fermerUsines(): void {
    this.societeUsines = null;
    this.usines = [];
    this.annulerEditionUsine();
  }

  private chargerUsines(filialeId: number): void {
    this.organizationService.getUsinesByFiliale(filialeId).subscribe({
      next: usines => {
        this.usines = usines;
        this.cdr.markForCheck();
      },
      error: () => this.afficherMessage('Chargement des usines impossible.', 'danger')
    });
  }

  enregistrerUsine(): void {
    const societe = this.societeUsines;
    const nom = this.nouvelleUsine.nom.trim();
    if (!societe || !nom) {
      this.afficherMessage("Le nom de l'usine est obligatoire.", 'danger');
      return;
    }

    const charge: Partial<Usine> = {
      nom,
      emplacement: this.nouvelleUsine.emplacement.trim(),
      filialeId: societe.id
    };

    const requete = this.usineEnEdition != null
      ? this.organizationService.updateUsine(this.usineEnEdition, charge)
      : this.organizationService.createUsine(charge);

    requete.subscribe({
      next: () => {
        this.afficherMessage(this.usineEnEdition != null ? 'Usine modifiée.' : 'Usine ajoutée.', 'success');
        this.annulerEditionUsine();
        this.chargerUsines(societe.id);
        // Le compte d'usines figure dans le tableau des sociétés.
        this.charger();
        this.propager();
      },
      error: err => this.afficherMessage(
        err?.error?.message ?? "Échec de l'enregistrement de l'usine.",
        'danger'
      )
    });
  }

  editerUsine(usine: Usine): void {
    this.usineEnEdition = usine.id;
    this.nouvelleUsine = { nom: usine.nom, emplacement: usine.emplacement ?? '' };
    this.cdr.markForCheck();
  }

  annulerEditionUsine(): void {
    this.usineEnEdition = null;
    this.nouvelleUsine = { nom: '', emplacement: '' };
    this.cdr.markForCheck();
  }

  supprimerUsine(usine: Usine): void {
    const societe = this.societeUsines;
    if (!societe) return;

    this.organizationService.deleteUsine(usine.id).subscribe({
      next: () => {
        this.afficherMessage(`Usine « ${usine.nom} » supprimée.`, 'info');
        this.chargerUsines(societe.id);
        this.charger();
        this.propager();
      },
      error: () => this.afficherMessage("Suppression de l'usine impossible.", 'danger')
    });
  }

  // ---------- Écriture ----------

  enregistrer(): void {
    const libelle = this.formulaire.libelle.trim();
    const code = this.formulaire.code.trim().toUpperCase();

    if (!libelle || !code) {
      this.afficherMessage('Le nom et le code de la société sont obligatoires.', 'danger');
      return;
    }

    const charge: Partial<Filiale> = {
      libelle,
      code,
      pays: this.formulaire.pays,
      devise: this.formulaire.devise,
      dateCreation: this.formulaire.dateCreation || null
    };

    const requete = this.modeEdition && this.formulaire.id != null
      ? this.organizationService.updateFiliale(this.formulaire.id, charge)
      : this.organizationService.createFiliale(charge);

    requete.subscribe({
      next: () => {
        this.afficherMessage(
          this.modeEdition ? 'Société modifiée.' : 'Société ajoutée.',
          'success'
        );
        this.annuler();
        this.charger();
        this.propager();
      },
      error: err => this.afficherMessage(
        err?.error?.message ?? "Échec de l'enregistrement de la société.",
        'danger'
      )
    });
  }

  editer(societe: Filiale): void {
    this.modeEdition = true;
    this.formulaire = {
      id: societe.id,
      libelle: societe.libelle,
      code: societe.code,
      pays: societe.pays?.trim() || 'Tunisie',
      devise: societe.devise?.trim().toUpperCase() || 'TND',
      dateCreation: societe.dateCreation ?? ''
    };
    this.cdr.markForCheck();
  }

  annuler(): void {
    this.modeEdition = false;
    this.formulaire = { ...FORMULAIRE_VIDE };
    this.cdr.markForCheck();
  }

  demanderSuppression(societe: Filiale): void {
    this.societeASupprimer = societe;
    this.cdr.markForCheck();
  }

  annulerSuppression(): void {
    this.societeASupprimer = null;
    this.cdr.markForCheck();
  }

  confirmerSuppression(): void {
    const societe = this.societeASupprimer;
    if (!societe) return;
    this.annulerSuppression();

    this.organizationService.deleteFiliale(societe.id).subscribe({
      next: () => {
        this.afficherMessage(`Société « ${societe.libelle} » supprimée.`, 'info');
        this.charger();
        this.propager();
      },
      // Le serveur refuse la suppression d'une société encore rattachée à des
      // usines : son message est plus précis qu'un libellé générique.
      error: err => this.afficherMessage(
        err?.error?.message ?? 'Échec de la suppression.',
        'danger'
      )
    });
  }

  // ---------- Exercices carbone ----------

  ajouterAnnee(): void {
    if (this.nouvelleAnnee == null) {
      this.afficherMessage('Saisissez une année.', 'danger');
      return;
    }

    this.organizationService.createAnnee(this.nouvelleAnnee).subscribe({
      next: () => {
        this.afficherMessage(`Exercice ${this.nouvelleAnnee} ouvert.`, 'success');
        this.chargerAnnees();
        this.entityService.refreshYears();
      },
      error: err => this.afficherMessage(
        err?.error?.message ?? "Échec de l'ouverture de l'exercice.",
        'danger'
      )
    });
  }

  basculerStatutAnnee(annee: AnneeReference): void {
    const requete = annee.statut === 'EN_COURS'
      ? this.organizationService.cloturerAnnee(annee.id)
      : this.organizationService.rouvrirAnnee(annee.id);

    requete.subscribe({
      next: () => {
        this.chargerAnnees();
        this.entityService.refreshYears();
      },
      error: () => this.afficherMessage("Changement de statut impossible.", 'danger')
    });
  }

  supprimerAnnee(annee: AnneeReference): void {
    this.organizationService.deleteAnnee(annee.id).subscribe({
      next: () => {
        this.afficherMessage(`Exercice ${annee.valeur} supprimé.`, 'info');
        this.chargerAnnees();
        this.entityService.refreshYears();
      },
      error: () => this.afficherMessage("Suppression de l'exercice impossible.", 'danger')
    });
  }

  // ---------- Utilitaires ----------

  /** Réaligne les sélecteurs de l'application sur le référentiel modifié. */
  private propager(): void {
    this.entityService.refreshEntities();
    this.modifie.emit();
  }

  private afficherMessage(texte: string, type: 'success' | 'danger' | 'info'): void {
    if (this.messageTimeout) clearTimeout(this.messageTimeout);
    this.message = texte;
    this.messageType = type;
    this.cdr.markForCheck();

    this.messageTimeout = setTimeout(() => {
      this.message = null;
      this.cdr.markForCheck();
    }, 4000);
  }
}
