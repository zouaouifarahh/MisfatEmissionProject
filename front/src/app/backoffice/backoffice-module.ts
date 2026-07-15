import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { BackofficeRoutingModule } from './backoffice-routing-module';
import { DashboardComponent } from './components/dashboard/dashboard';
import { UserApprovalComponent } from './user-approval/user-approval.component';
import { ProfileComponent } from './components/profile/profile.component';

@NgModule({
  declarations: [
    // On laisse vide ici car les composants Standalone ne se déclarent pas
  ],
  imports: [
    CommonModule,
    FormsModule,
    BackofficeRoutingModule,
    
    // On les importe ici car ils sont Standalone !
    DashboardComponent,
    UserApprovalComponent,
    ProfileComponent
  ]
})
export class BackofficeModule { }