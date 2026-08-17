import { Routes } from '@angular/router';
import { Home } from './frontoffice/components/home/home';
import { DashboardComponent } from './backoffice/components/dashboard/dashboard';
import { SigninComponent } from './frontoffice/signin/signin';
import { UserApprovalComponent } from './backoffice/user-approval/user-approval.component';
import { authGuard } from './core/auth.guard';

// Importation des composants
import { EmissionListComponent } from './components/emission-list/emission-list';
import { EmissionMeasureComponent } from './components/emission-measure/emission-measure';

export const routes: Routes = [
  { path: '', redirectTo: 'signin', pathMatch: 'full' },

  // Frontoffice
  { path: 'home', component: Home },
  { path: 'signin', component: SigninComponent },

  // L'inscription publique est supprimée : les demandes d'accès arrivent de
  // l'intégration du site entreprise et le Master Admin seul les valide. La
  // route est conservée en redirection plutôt que retirée, pour que les liens
  // et favoris existants aboutissent à la connexion au lieu d'un 404.
  { path: 'signup', redirectTo: 'signin', pathMatch: 'full' },

  // Backoffice — réservé aux sessions ouvertes
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'backoffice/user-approval', component: UserApprovalComponent, canActivate: [authGuard] },

  // Gestion des utilisateurs. Les écrans de la console ne sont pas des routes
  // mais des onglets : ces adresses ouvrent la console sur le bon onglet, sans
  // la priver de sa navigation latérale ni de son en-tête de périmètre.
  {
    path: 'settings/profile',
    component: DashboardComponent,
    canActivate: [authGuard],
    data: { ecran: 'm-prof' }
  },
  {
    path: 'settings/team',
    component: DashboardComponent,
    canActivate: [authGuard],
    data: { ecran: 'm-equipe' }
  },

  // Facteurs d'émission
  { path: 'backoffice/emission-factors', component: EmissionListComponent, canActivate: [authGuard] },

  // --- MESURES ---
  // Route générique par défaut pour les mesures
  { path: 'backoffice/emission-measures', component: EmissionMeasureComponent, canActivate: [authGuard] },

  // Route dynamique par catégorie (ex: combustion-etablissements, combustion-vehicules...)
  {
    path: 'backoffice/emission-measures/:category',
    component: EmissionMeasureComponent,
    canActivate: [authGuard]
  },

  // Wildcard
  { path: '**', redirectTo: 'signin' }
];
