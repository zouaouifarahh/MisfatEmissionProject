import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Compte, ComptesService } from '../../../core/comptes.service';
import { SessionService } from '../../../core/session.service';

/**
 * Profil de l'utilisateur connecté.
 *
 * <p>Les caractéristiques sont lues et écrites dans l'annuaire, sur le compte
 * de la session : elles suivent donc la personne d'un écran à l'autre, là où un
 * profil rangé sous ses propres clés de stockage aurait affiché la même fiche à
 * tout le monde.</p>
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  private readonly comptesService = inject(ComptesService);
  private readonly sessionService = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Silhouette neutre, affichée tant qu'aucune photo n'a été déposée. */
  private readonly avatarParDefaut =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
      + '<rect width="128" height="128" fill="#EFF6FA"/>'
      + '<circle cx="64" cy="50" r="23" fill="#B9CFE0"/>'
      + '<path d="M20 122c0-24 20-38 44-38s44 14 44 38z" fill="#B9CFE0"/></svg>');

  /** Compte de la session ; `null` quand personne n'est connecté. */
  compte: Compte | null = null;

  /** Copie de travail du formulaire : rien n'est écrit avant validation. */
  formulaire = { firstName: '', lastName: '', email: '', telephone: '' };

  avatarUrl = this.avatarParDefaut;
  notes: string[] = [];
  nouvelleNote = '';

  noteEnEdition: number | null = null;
  texteModifie = '';

  messageSucces = '';
  messageErreur = '';

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {}

  ngOnInit(): void {
    this.charger();
  }

  /** Rôle affiché sur le badge, à défaut la mention d'absence de session. */
  get role(): string {
    return this.compte?.role ?? 'Aucune session';
  }

  get affectation(): string {
    return this.compte?.affectation ?? '—';
  }

  private charger(): void {
    const email = this.sessionService.session?.email;
    this.compte = email ? this.comptesService.chercherParEmail(email) : null;

    if (!this.compte) return;

    this.formulaire = {
      firstName: this.compte.firstName ?? '',
      lastName: this.compte.lastName ?? '',
      email: this.compte.email,
      telephone: this.compte.telephone ?? ''
    };

    this.avatarUrl = this.compte.avatar || this.avatarParDefaut;
    this.notes = [...(this.compte.notes ?? this.notesHeritees())];
  }

  /**
   * Notes déposées avant que le profil ne soit rattaché à un compte.
   *
   * <p>Elles vivaient sous une clé globale, commune à tous : elles sont reprises
   * une fois pour ne pas disparaître sous les yeux de leur auteur, puis suivent
   * le compte comme le reste.</p>
   */
  private notesHeritees(): string[] {
    if (!isPlatformBrowser(this.platformId)) return [];

    try {
      const brut = localStorage.getItem('profile_notes');
      const relu = brut ? JSON.parse(brut) : null;
      return Array.isArray(relu) ? relu.filter(n => typeof n === 'string') : [];
    } catch {
      return [];
    }
  }

  /** Écrit un lot de champs sur le compte de la session. */
  private enregistrer(champs: Parameters<ComptesService['modifierProfil']>[1]): boolean {
    if (!this.compte) return false;

    const modifie = this.comptesService.modifierProfil(this.compte.id, champs);
    if (!modifie) {
      this.messageErreur = 'Cette adresse email est déjà utilisée par un autre compte.';
      this.messageSucces = '';
      return false;
    }

    this.compte = modifie;
    this.messageErreur = '';
    this.cdr.markForCheck();
    return true;
  }

  /** Enregistre l'identité et les coordonnées. */
  sauvegarderProfil(): void {
    const email = this.formulaire.email.trim();
    if (!email.includes('@')) {
      this.messageErreur = 'Veuillez saisir une adresse email valide.';
      this.messageSucces = '';
      return;
    }

    if (!this.enregistrer({
      firstName: this.formulaire.firstName,
      lastName: this.formulaire.lastName,
      email,
      telephone: this.formulaire.telephone
    })) return;

    // L'adresse identifie la session : la session doit suivre, sinon le profil
    // rechargé pointerait sur un compte introuvable.
    this.sessionService.ouvrir(this.compte!);
    this.messageSucces = 'Profil enregistré.';
  }

  /**
   * Dépose une nouvelle photo de profil.
   *
   * <p>L'image est réduite avant d'être conservée : une photo d'appareil moderne
   * pèse plusieurs mégaoctets, là où le stockage du navigateur en accorde cinq
   * pour l'ensemble de l'application. La déposer telle quelle ferait échouer
   * l'écriture de tout le reste.</p>
   */
  onFileSelected(event: Event): void {
    const fichier = (event.target as HTMLInputElement).files?.[0];
    if (!fichier || !isPlatformBrowser(this.platformId)) return;

    const lecteur = new FileReader();
    lecteur.onload = () => {
      this.reduireImage(String(lecteur.result)).then(reduite => {
        this.avatarUrl = reduite;
        this.enregistrer({ avatar: reduite });
        this.messageSucces = 'Photo de profil mise à jour.';
        this.cdr.detectChanges();
      });
    };
    lecteur.readAsDataURL(fichier);
  }

  /** Ramène une image à 256 pixels de côté, en JPEG. */
  private reduireImage(source: string): Promise<string> {
    return new Promise(resoudre => {
      const image = new Image();

      image.onload = () => {
        const cote = 256;
        const toile = document.createElement('canvas');
        toile.width = cote;
        toile.height = cote;

        const contexte = toile.getContext('2d');
        if (!contexte) { resoudre(source); return; }

        // Recadrage centré : une photo rectangulaire ne doit pas être écrasée
        // pour entrer dans un cadre carré.
        const cote0 = Math.min(image.width, image.height);
        const x = (image.width - cote0) / 2;
        const y = (image.height - cote0) / 2;
        contexte.drawImage(image, x, y, cote0, cote0, 0, 0, cote, cote);

        try {
          resoudre(toile.toDataURL('image/jpeg', 0.82));
        } catch {
          resoudre(source);
        }
      };

      image.onerror = () => resoudre(source);
      image.src = source;
    });
  }

  supprimerPhoto(): void {
    this.avatarUrl = this.avatarParDefaut;
    this.enregistrer({ avatar: '' });
    this.messageSucces = 'Photo de profil retirée.';
  }

  // ---------- NOTES PERSONNELLES ----------

  private persisterNotes(): void {
    this.enregistrer({ notes: [...this.notes] });
  }

  ajouterNote(event: Event): void {
    event.preventDefault();

    const texte = this.nouvelleNote.trim();
    if (!texte) return;

    this.notes.push(texte);
    this.nouvelleNote = '';
    this.persisterNotes();
  }

  activerEdition(index: number, texteActuel: string): void {
    this.noteEnEdition = index;
    this.texteModifie = texteActuel;
  }

  sauvegarderModification(index: number): void {
    const texte = this.texteModifie.trim();
    if (texte) {
      this.notes[index] = texte;
      this.persisterNotes();
    }
    this.annulerEdition();
  }

  annulerEdition(): void {
    this.noteEnEdition = null;
    this.texteModifie = '';
  }

  supprimerNote(index: number): void {
    this.notes.splice(index, 1);
    this.persisterNotes();
    if (this.noteEnEdition === index) this.annulerEdition();
  }
}
