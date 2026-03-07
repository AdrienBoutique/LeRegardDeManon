import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminClientItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminClientPayload = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type UpdateAdminClientPayload = Partial<CreateAdminClientPayload>;

export type AdminClientStatsLiteAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  totalPrice: number;
  staffName: string;
  services: string[];
};

export type AdminClientStatsHistoryItem = AdminClientStatsLiteAppointment & {
  createdAt: string;
  notes: string | null;
};

export type AdminClientStats = {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    createdAt: string;
  };
  totals: {
    appointments: number;
    pending: number;
    cancelled: number;
    noShow: number;
    confirmedLike: number;
  };
  revenue: {
    total: number;
    averageBasket: number;
  };
  rates: {
    cancellation: number;
  };
  timeline: {
    lastAppointment: AdminClientStatsLiteAppointment | null;
    nextAppointment: AdminClientStatsLiteAppointment | null;
  };
  history: AdminClientStatsHistoryItem[];
};

@Injectable({ providedIn: 'root' })
export class AdminClientsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/clients`;

  list(search?: string): Observable<AdminClientItem[]> {
    const q = search?.trim() ?? '';
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<AdminClientItem[]>(this.baseUrl, { params });
  }

  create(payload: CreateAdminClientPayload): Observable<AdminClientItem> {
    return this.http.post<AdminClientItem>(this.baseUrl, payload);
  }

  update(id: string, payload: UpdateAdminClientPayload): Observable<AdminClientItem> {
    return this.http.patch<AdminClientItem>(`${this.baseUrl}/${id}`, payload);
  }

  delete(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/${id}`);
  }

  getStats(id: string): Observable<AdminClientStats> {
    return this.http.get<AdminClientStats>(`${this.baseUrl}/${id}/stats`);
  }

  deleteAppointment(clientId: string, appointmentId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/${clientId}/appointments/${appointmentId}`);
  }
}
