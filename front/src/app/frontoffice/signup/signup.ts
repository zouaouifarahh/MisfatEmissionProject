import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../user.service'; // 2 niveaux pour remonter depuis signup
import { Router, RouterLink } from '@angular/router'; // <-- CORRECTION 1 : Ajout de RouterLink ici

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], // <-- CORRECTION 2 : Ajout de RouterLink dans les imports
  templateUrl: './signup.html',
  styleUrls: ['./signup.css']
})
export class SignupComponent {
  userData = {
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    role: '',
    usine: ''
  };

  messageSuccess = '';
  messageError = '';

  // Gestion de l'affichage en texte clair des mots de passe
  showPasswordSignup = false;
  showConfirmPasswordSignup = false;

  constructor(private userService: UserService, private router: Router) {}

  onRegister() {
    this.messageSuccess = '';
    this.messageError = '';

    if (this.userData.password !== this.userData.confirmPassword) {
      this.messageError = 'Les mots de passe ne correspondent pas.';
      return;
    }

    // Appel à la méthode signUp de ton service
    this.userService.signUp(this.userData).subscribe({
      next: (response: any) => {
        console.log('Demande d\'inscription envoyée !', response);
        
        // 1. Alerte instantanée pour bloquer l'écran blanc et informer l'utilisateur
        alert("Votre demande d'inscription a bien été soumise ! Veuillez attendre l'acceptation de l'Administrateur avant de vous connecter.");
        
        // 2. Fallback textuel au cas où
        this.messageSuccess = 'Votre demande a été soumise avec succès au Master Administrateur !';
        
        // 3. Redirection propre vers la page de connexion
        this.router.navigate(['/signin']);
      },
      error: (err: any) => {
        console.error('Erreur lors de l\'inscription', err);
        this.messageError = err.error || 'Une erreur est survenue lors de l\'inscription.';
      }
    });
  }
}