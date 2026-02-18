import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PendingAppointmentItem = {
  id: string;
  startAt: string;
  endAt: string;
  durationMin: number;
  notes: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  practitionerId: string;
  practitionerName: string;
  services: Array<{
    id: string;
    name: string;
    durationMin: number;
  }>;
};

@Injectable({ providedIn: 'root' })
export class AdminAppointmentRequestsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/appointments`;

  listPending(): Observable<PendingAppointmentItem[]> {
    return this.http.get<PendingAppointmentItem[]>(`${this.baseUrl}/pending`);
  }

  accept(id: string): Observable<{ ok: true; status: string; email: string }> {
    return this.http.post<{ ok: true; status: string; email: string }>(`${this.baseUrl}/${id}/accept`, {});
  }

  reject(id: string, reason?: string): Observable<{ ok: true; status: string; email: string }> {
    return this.http.post<{ ok: true; status: string; email: string }>(`${this.baseUrl}/${id}/reject`, {
      reason: reason?.trim() || undefined
    });
  }
}
