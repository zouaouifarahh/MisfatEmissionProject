import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard';
import { ProfileComponent } from './components/profile/profile.component';
import { UserApprovalComponent } from './user-approval/user-approval.component';
import { EmissionListComponent } from '../components/emission-list/emission-list';
const routes: Routes = [
  {
    path: '', 
    component: DashboardComponent, // C'est le composant parent avec la barre latérale
    children: [
      { path: '', redirectTo: 'aperçu', pathMatch: 'full' }, // Page par défaut
      { path: 'profile', component: ProfileComponent },       // Route profil
      { path: 'user-approval', component: UserApprovalComponent },
      { path: 'backoffice/combustion-etablissements', component: EmissionListComponent }, // Notre page CRUD !
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BackofficeRoutingModule { }