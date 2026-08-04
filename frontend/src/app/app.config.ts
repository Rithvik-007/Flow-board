import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { catchError, of } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // currentUser is otherwise only set right after login — without this, a page
    // refresh leaves it null even though the token in localStorage is still valid,
    // which would break every role check that reads AuthService.currentUser().
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      if (!authService.isAuthenticated()) {
        return;
      }
      return authService.fetchCurrentUser().pipe(catchError(() => of(null)));
    }),
  ],
};
