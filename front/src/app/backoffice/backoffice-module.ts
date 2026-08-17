import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BackofficeRoutingModule } from './backoffice-routing-module';
import { DashboardComponent } from './components/dashboard/dashboard';
import { UserApprovalComponent } from './user-approval/user-approval.component';
import { ProfileComponent } from './components/profile/profile.component';
import { EmissionListComponent } from '../components/emission-list/emission-list';

@NgModule({
  declarations: [
    // Laisse bien ce tableau vide !
  ],
  imports: [
    CommonModule,
    FormsModule,
    BackofficeRoutingModule,
    
    // On importe les composants Standalone ici :
    EmissionListComponent,
    DashboardComponent,
    UserApprovalComponent,
    ProfileComponent
  ]
})
export class BackofficeModule { }