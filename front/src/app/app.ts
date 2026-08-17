import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConfirmationDialogueComponent } from './shared/ui/confirmation-dialogue';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmationDialogueComponent],
  template: `
    <router-outlet></router-outlet>

    <!-- Posée à la racine : tout écran la sollicite par le service. -->
    <app-confirmation-dialogue></app-confirmation-dialogue>
  `,
  styleUrl: './app.css'
})
export class AppComponent {
  title = 'front';
}