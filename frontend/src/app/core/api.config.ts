import { environment } from '../../environments/environment';

// Single source of truth for the backend's base URL, sourced from the
// environment file Angular swaps in per build configuration (see angular.json's
// fileReplacements for "development").
export const API_BASE_URL = environment.apiUrl;
