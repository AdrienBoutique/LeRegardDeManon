import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminServiceItem = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  active: boolean;
  colorHex: string | null;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminServiceCategoryItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminServicePayload = {
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  active?: boolean;
  colorHex?: string | null;
  categoryId?: string | null;
};

export type UpdateAdminServicePayload = Partial<CreateAdminServicePayload>;

@Injectable({ providedIn: 'root' })
export class AdminServicesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/admin/services`;

  list(): Observable<AdminServiceItem[]> {
    return this.http.get<AdminServiceItem[]>(this.baseUrl);
  }

  listCategories(): Observable<AdminServiceCategoryItem[]> {
    return this.http.get<AdminServiceCategoryItem[]>(`${this.baseUrl}/categories`);
  }

  createCategory(name: string): Observable<AdminServiceCategoryItem> {
    return this.http.post<AdminServiceCategoryItem>(`${this.baseUrl}/categories`, { name });
  }

  deleteCategory(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/categories/${id}`);
  }

  create(payload: CreateAdminServicePayload): Observable<AdminServiceItem> {
    return this.http.post<AdminServiceItem>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateAdminServicePayload): Observable<AdminServiceItem> {
    return this.http.patch<AdminServiceItem>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/${id}`);
  }
}
