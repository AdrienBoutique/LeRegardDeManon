import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminUserRole = 'ADMIN' | 'STAFF';

export type AdminUserItem = {
  id: string;
  email: string;
  role: AdminUserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  hasPractitioner: boolean;
};

export type CreateAdminUserPayload = {
  email: string;
  password?: string;
  role?: AdminUserRole;
  isActive?: boolean;
  mustChangePassword?: boolean;
};

export type UpdateAdminUserPayload = Partial<{
  email: string;
  role: AdminUserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}>;

@Injectable({ providedIn: 'root' })
export class AdminUsersApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/users`;

  listUsers(): Observable<AdminUserItem[]> {
    return this.http.get<AdminUserItem[]>(this.baseUrl);
  }

  createUser(payload: CreateAdminUserPayload): Observable<AdminUserItem & { tempPassword: string | null }> {
    return this.http.post<AdminUserItem & { tempPassword: string | null }>(this.baseUrl, payload);
  }

  updateUser(id: string, payload: UpdateAdminUserPayload): Observable<AdminUserItem> {
    return this.http.patch<AdminUserItem>(`${this.baseUrl}/${id}`, payload);
  }

  resetPassword(id: string): Observable<{ id: string; email: string; tempPassword: string }> {
    return this.http.post<{ id: string; email: string; tempPassword: string }>(`${this.baseUrl}/${id}/reset-password`, {});
  }

  makeAdmin(id: string): Observable<AdminUserItem> {
    return this.http.post<AdminUserItem>(`${this.baseUrl}/${id}/make-admin`, {});
  }

  changeRole(id: string, role: AdminUserRole): Observable<AdminUserItem> {
    return this.http.post<AdminUserItem>(`${this.baseUrl}/${id}/change-role`, { role });
  }

  toggleActive(id: string): Observable<AdminUserItem> {
    return this.http.post<AdminUserItem>(`${this.baseUrl}/${id}/toggle-active`, {});
  }
}
