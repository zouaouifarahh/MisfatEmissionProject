import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { Compte, ComptesService } from '../../core/comptes.service';
import { SessionService } from '../../core/session.service';

/** Domaine imposé aux adresses de la plateforme. */
export const DOMAINE_MISFAT = '@misfat.com';

/**
 * Forme comparable d'un nom : ni la casse, ni les accents, ni les espaces
 * surnuméraires ne distinguent deux écritures du même nom.
 */
export function normaliserNom(nom: string | null | undefined): string {
  return String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Connexion par nom complet et adresse électronique, sans mot de passe.
 *
 * <p>L'accès repose sur trois éléments : une adresse connue de l'annuaire, un
 * nom qui concorde avec celui du compte, et l'approbation du Master Admin. Le
 * compte d'urgence {@code admin@misfat.com} entre en toutes circonstances —
 * c'est lui qui déverrouille l'application le premier jour, avant qu'aucune
 * demande n'ait pu être approuvée.</p>
 *
 * <p>L'inscription publique n'existe plus : les demandes d'accès arrivent de
 * l'intégration du site entreprise, avec le matricule de l'employé, et le
 * Master Admin seul les valide en affectant le rôle correspondant.</p>
 *
 * <p>Ce n'est pas une authentification : rien ici ne prouve l'identité de qui
 * saisit ces deux champs. Le contrôle réel des données appartient au serveur, et
 * ce formulaire n'a vocation à tenir que jusqu'à l'intégration du fournisseur
 * d'identité externe.</p>
 */
@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './signin.html',
  styleUrls: ['./signin.css']
})
export class SigninComponent implements OnInit {
  private readonly comptesService = inject(ComptesService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly domaine = DOMAINE_MISFAT;

  nomComplet = '';
  email = '';
  messageError = '';
  messageSuccess = '';
  isLoading = false;

  /** Adresse demandée avant la redirection par la garde, s'il y en avait une. */
  private retour: string | null = null;

  ngOnInit(): void {
    const parametres = this.route.snapshot.queryParamMap;

    // Demande déposée depuis le site entreprise : elle attend une décision.
    if (parametres.get('demande') === 'transmise') {
      this.messageSuccess = 'Demande transmise avec succès au Master Admin. '
        + 'Vous pourrez vous connecter dès qu\'elle aura été approuvée.';
    }

    this.retour = parametres.get('retour');
  }

  onLogin(): void {
    this.messageError = '';
    this.messageSuccess = '';

    const nomSaisi = this.nomComplet.trim();
    if (!nomSaisi) {
      this.messageError = 'Veuillez saisir votre nom complet.';
      return;
    }

    const email = this.completerDomaine(this.email);
    if (!email) {
      this.messageError = `Veuillez saisir une adresse email en ${DOMAINE_MISFAT}.`;
      return;
    }

    this.isLoading = true;

    // L'approbation a pu être prononcée dans un autre onglet depuis l'ouverture
    // de cette page : l'annuaire est relu avant de statuer, faute de quoi
    // l'utilisateur se verrait répondre « en attente » alors que son accès
    // vient de lui être ouvert.
    this.comptesService.synchroniser();

    const compte = this.comptesService.chercherParEmail(email);

    if (!compte) {
      this.isLoading = false;
      this.messageError = 'Compte inconnu. Votre accès doit être demandé par '
        + 'votre responsable auprès du Master Admin.';
      return;
    }

    if (!this.nomConcorde(compte, nomSaisi)) {
      this.isLoading = false;
      this.messageError = 'Le nom complet ne correspond pas à celui enregistré pour cette adresse.';
      return;
    }

    if (!this.comptesService.peutSeConnecter(compte)) {
      this.isLoading = false;
      this.messageError = compte.statut === 'REFUSE'
        ? 'Votre demande d\'accès a été refusée par le Master Admin.'
        : 'Votre demande d\'accès est en attente de validation par le Master Admin';
      return;
    }

    this.sessionService.ouvrir(compte);
    this.isLoading = false;

    // Tous les profils rejoignent la console : c'est la navigation latérale qui
    // s'adapte au rôle, et elle seule. Une adresse demandée avant la
    // redirection reprend la main, pour ne pas perdre le lien suivi.
    this.router.navigateByUrl(this.retour ?? '/dashboard');
  }

  /**
   * Impose le domaine de l'entreprise.
   *
   * <p>Une saisie sans arobase est complétée — « n.hamdi » vaut
   * « n.hamdi@misfat.com » — ce qui épargne la frappe du domaine à tout
   * l'effectif. Une adresse portant un autre domaine est refusée plutôt que
   * réécrite : la corriger d'office ferait entrer quelqu'un sous une adresse
   * qu'il n'a pas saisie.</p>
   *
   * @returns l'adresse normalisée, ou une chaîne vide si elle est inutilisable.
   */
  private completerDomaine(saisie: string): string {
    const brut = saisie.trim().toLowerCase();
    if (!brut) return '';

    if (!brut.includes('@')) return `${brut}${DOMAINE_MISFAT}`;

    return brut.endsWith(DOMAINE_MISFAT) ? brut : '';
  }

  /**
   * Le nom saisi concorde-t-il avec celui du compte ?
   *
   * <p>Un compte ouvert par invitation peut n'avoir aucun nom enregistré : le
   * refuser fermerait la porte à quelqu'un que le Master Admin vient
   * d'autoriser. Dans ce cas le nom saisi est accepté tel quel.</p>
   */
  private nonRenseigne(compte: Compte): boolean {
    return !normaliserNom(`${compte.firstName ?? ''} ${compte.lastName ?? ''}`);
  }

  private nomConcorde(compte: Compte, nomSaisi: string): boolean {
    if (this.nonRenseigne(compte)) return true;

    const attendu = normaliserNom(`${compte.firstName ?? ''} ${compte.lastName ?? ''}`);
    const saisi = normaliserNom(nomSaisi);

    // « Prénom Nom » et « Nom Prénom » désignent la même personne : l'ordre des
    // deux champs de l'annuaire n'a pas à être deviné par l'utilisateur.
    const inverse = normaliserNom(`${compte.lastName ?? ''} ${compte.firstName ?? ''}`);

    return saisi === attendu || saisi === inverse;
  }
}
