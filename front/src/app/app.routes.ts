import { Routes } from '@angular/router';
import { Home } from './frontoffice/components/home/home';
import { DashboardComponent } from './backoffice/components/dashboard/dashboard';
import { SignupComponent } from './frontoffice/signup/signup';
import { SigninComponent } from './frontoffice/signin/signin';
import { UserApprovalComponent } from './backoffice/user-approval/user-approval.component';

export const routes: Routes = [
  // 1. Route par défaut : Redirige vers la page de connexion (Signin) à l'ouverture du site
  { path: '', redirectTo: 'signin', pathMatch: 'full' }, 

  // 2. Routes du Frontoffice (Espace Public / Authentification)
  { path: 'home', component: Home },
  { path: 'signin', component: SigninComponent },
  { path: 'signup', component: SignupComponent },
  
  // 3. Routes du Backoffice (Sécurisé)
  { path: 'dashboard', component: DashboardComponent },
  { path: 'backoffice/user-approval', component: UserApprovalComponent }, // Optionnel (intégré au dashboard maintenant)
  
  // 4. Wildcard : Redirection automatique si l'utilisateur tape une URL inconnue
  { path: '**', redirectTo: 'signin' }
];