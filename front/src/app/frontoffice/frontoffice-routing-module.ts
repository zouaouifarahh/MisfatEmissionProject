import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SigninComponent } from './signin/signin';

// L'inscription publique est supprimée : /signup ramène à la connexion, comme
// dans le routage principal de l'application.
const routes: Routes = [
  { path: 'signin', component: SigninComponent },
  { path: 'signup', redirectTo: 'signin', pathMatch: 'full' },
  { path: '', redirectTo: 'signin', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FrontofficeRoutingModule { }
