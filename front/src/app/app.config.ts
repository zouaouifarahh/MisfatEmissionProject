import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { ErreurVisibleHandler } from './core/erreur-visible.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()), // <-- withFetch() activé

    // Une exception pendant le rendu laisse un écran vide : ce gestionnaire
    // affiche le message à l'écran, pour qu'une capture suffise au diagnostic.
    { provide: ErrorHandler, useClass: ErreurVisibleHandler }
  ]
};