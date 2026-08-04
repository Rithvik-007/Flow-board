import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { User } from '../models/user.model';

const TOKEN_KEY = 'flowboard_token';

interface TokenResponse {
  access_token: string;
  token_type: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Any component can read this signal to reactively show/hide UI based on login state.
  readonly currentUser = signal<User | null>(null);

  constructor(private http: HttpClient) {}

  register(request: RegisterRequest): Observable<User> {
    return this.http.post<User>(`${API_BASE_URL}/auth/register`, request);
  }

  login(email: string, password: string): Observable<TokenResponse> {
    // OAuth2PasswordRequestForm on the backend expects form-encoded fields
    // named "username" and "password", not JSON.
    const body = new URLSearchParams();
    body.set('username', email);
    body.set('password', password);

    return this.http
      .post<TokenResponse>(`${API_BASE_URL}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(tap((res) => localStorage.setItem(TOKEN_KEY, res.access_token)));
  }

  fetchCurrentUser(): Observable<User> {
    return this.http
      .get<User>(`${API_BASE_URL}/auth/me`)
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
}
