import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/app-shell/app-shell').then((m) => m.AppShell),
    canActivate: [authGuard],
    children: [
      {
        path: 'projects',
        loadComponent: () => import('./pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./pages/project-board/project-board').then((m) => m.ProjectBoard),
      },
      {
        path: 'projects/:id/settings',
        loadComponent: () =>
          import('./pages/project-settings/project-settings').then((m) => m.ProjectSettings),
      },
    ],
  },
];
