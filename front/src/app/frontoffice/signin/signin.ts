import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../user.service';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './signin.html',
  styleUrls: ['./signin.css']
})
export class SigninComponent {
  // Modèle lié aux champs du formulaire HTML (Misfat Authentication)
  credentials = { 
    username: '', 
    password: '' 
  };

  messageError = '';
  isLoading = false;
  showPassword = false; // Utilisé dans le template pour basculer le type entre 'text' et 'password'

  constructor(
    private userService: UserService, 
    private router: Router
  ) {}

  onLogin() {
    this.messageError = '';
    
    // Sécurité de base : s'assurer que les champs ne sont pas vides
    if (!this.credentials.username.trim() || !this.credentials.password.trim()) {
      this.messageError = "Veuillez remplir tous les champs.";
      return;
    }

    this.isLoading = true;

    this.userService.signIn(this.credentials).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        console.log('Connexion réussie ! Réponse du backend Misfat :', response);
        
        // 1. Sauvegarde des informations de session
        if (response && response.token) {
          localStorage.setItem('token', response.token);
        }
        if (response && response.role) {
          localStorage.setItem('userRole', response.role);
        }

        // 2. Redirection directe vers le dashboard puisqu'il est validé !
        this.router.navigate(['/dashboard']);
      },
      error: (err: any) => {
        this.isLoading = false;
        console.error('Erreur lors de l\'connexion', err);
        
        // Intercepter l'état d'attente ou d'erreur
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          
          // 🛑 Alerte demandée si le compte n'a pas encore les droits :
          alert("Pas de droit d'accès. Veuillez attendre l'acceptation de l'Administrateur !");
          
          this.messageError = "Votre compte est en attente de validation ou vos identifiants sont incorrects.";
        } else {
          this.messageError = "Impossible de joindre le serveur Misfat. Vérifiez que votre API Spring Boot est lancée.";
        }
      }
    });
  }
}