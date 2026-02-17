import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PractitionerStatus = 'active' | 'inactive' | 'stagiaire';

export type AdminPractitionerItem = {
  id: string;
  name: string;
  email: string;
  status: PractitionerStatus;
  defaultDiscount: number | null;
  colorHex: string;
  userId: string | null;
  hasAccount: boolean;
};

export type CreatePractitionerPayload = {
  name: string;
  email?: string;
  status: PractitionerStatus;
  defaultDiscount?: number | null;
  colorHex?: string;
  createAccount: boolean;
};

export type CreatePractitionerResponse = AdminPractitionerItem & {
  tempPassword: string | null;
};

@Injectable({ providedIn: 'root' })
export class AdminPractitionersApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/admin/practitioners`;

  listPractitioners(): Observable<AdminPractitionerItem[]> {
    return this.http.get<AdminPractitionerItem[]>(this.baseUrl);
  }

  createPractitioner(payload: CreatePractitionerPayload): Observable<CreatePractitionerResponse> {
    return this.http.post<CreatePractitionerResponse>(this.baseUrl, payload);
  }

  updatePractitioner(
    id: string,
    payload: Partial<{
      name: string;
      email: string;
      status: PractitionerStatus;
      defaultDiscount: number | null;
      colorHex: string;
      isActive: boolean;
    }>
  ): Observable<AdminPractitionerItem> {
    return this.http.patch<AdminPractitionerItem>(`${this.baseUrl}/${id}`, payload);
  }

  updateStatus(id: string, status: PractitionerStatus): Observable<{ id: string; status: PractitionerStatus }> {
    return this.http.patch<{ id: string; status: PractitionerStatus }>(`${this.baseUrl}/${id}/status`, { status });
  }
}
