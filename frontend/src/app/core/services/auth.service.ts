import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'lrdm_auth_token';
const USER_KEY = 'lrdm_auth_user';

export type AuthRole = 'ADMIN' | 'STAFF';

export type AuthUser = {
  id: string;
  email: string;
  role: AuthRole;
  mustChangePassword: boolean;
  practitionerId?: string | null;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: AuthRole;
    mustChangePassword: boolean;
  };
  practitionerId?: string | null;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(this.readStoredUser());

  readonly currentUser$ = this.currentUserSubject.asObservable();

  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/api/auth/login`, { email, password })
      .pipe(
        tap((response) => this.persistAuth(this.toAuthUser(response), response.token)),
        map((response) => this.toAuthUser(response))
      );
  }

  me(): Observable<AuthUser | null> {
    if (!this.getToken()) {
      this.currentUserSubject.next(null);
      return of(null);
    }

    return this.http
      .get<{
        user: { id: string; email: string; role: AuthRole; mustChangePassword: boolean };
        practitionerId?: string | null;
      }>(`${environment.apiBaseUrl}/api/auth/me`)
      .pipe(
        map((response) => ({
          ...response.user,
          practitionerId: response.practitionerId ?? null,
        })),
        tap((user) => {
          this.currentUserSubject.next(user);
          localStorage.setItem(USER_KEY, JSON.stringify(user));
        }),
        catchError(() => {
          this.logout();
          return of(null);
        })
      );
  }

  changePassword(currentPassword: string | undefined, newPassword: string): Observable<AuthUser> {
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/api/auth/change-password`, {
        currentPassword,
        newPassword,
      })
      .pipe(
        tap((response) => this.persistAuth(this.toAuthUser(response), response.token)),
        map((response) => this.toAuthUser(response))
      );
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return Boolean(this.getToken() && this.currentUserSubject.value);
  }

  hasRole(...roles: AuthRole[]): boolean {
    const user = this.currentUserSubject.value;
    return !!user && roles.includes(user.role);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUserSubject.next(null);
  }

  private persistAuth(user: AuthUser, token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }

  private toAuthUser(response: LoginResponse): AuthUser {
    return {
      id: response.user.id,
      email: response.user.email,
      role: response.user.role,
      mustChangePassword: response.user.mustChangePassword,
      practitionerId: response.practitionerId ?? null,
    };
  }
}
