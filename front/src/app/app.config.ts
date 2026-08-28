import {
  ApplicationConfig, ErrorHandler, provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { ErreurVisibleHandler } from './core/erreur-visible.handler';
import { jouerMigrationsDeDemarrage } from './core/migrations-demarrage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()), // <-- withFetch() activé

    // Les reprises du stockage sont jouées avant le premier affichage. Elles
    // vivaient dans l'écran du transport amont, donc ne se jouaient que si
    // l'utilisateur s'y rendait : qui consulte le bilan sans saisir voyait un
    // total faux indéfiniment.
    provideAppInitializer(() => { jouerMigrationsDeDemarrage(); }),

    // Une exception pendant le rendu laisse un écran vide : ce gestionnaire
    // affiche le message à l'écran, pour qu'une capture suffise au diagnostic.
    { provide: ErrorHandler, useClass: ErreurVisibleHandler }
  ]
};