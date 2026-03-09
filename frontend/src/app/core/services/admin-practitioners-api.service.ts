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

export type PractitionerStatsPeriod = 'month' | 'quarter' | 'year';

export type PractitionerStatsLiteAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  totalPrice: number;
  clientName: string;
  services: string[];
};

export type PractitionerStatsResponse = {
  practitioner: {
    id: string;
    name: string;
    email: string;
    active: boolean;
    isTrainee: boolean;
    createdAt: string;
    colorHex: string;
  };
  period: PractitionerStatsPeriod;
  periodSummary: {
    appointments: number;
    confirmedLike: number;
    pending: number;
    cancelled: number;
    noShow: number;
    revenue: number;
    averageBasket: number;
    workedHours: number;
    workedDays: number;
    revenuePerWorkedHour: number;
    revenuePerWorkedDay: number;
    appointmentsPerWorkedDay: number;
    scheduledHours: number;
    utilizationRate: number | null;
    revenuePerScheduledHour: number | null;
  };
  lifetimeSummary: {
    confirmedLike: number;
    revenue: number;
    averageBasket: number;
    workedHours: number;
    workedDays: number;
    revenuePerWorkedHour: number;
  };
  timeline: {
    lastAppointment: PractitionerStatsLiteAppointment | null;
    nextAppointment: PractitionerStatsLiteAppointment | null;
  };
  insights: {
    topServices: Array<{ name: string; count: number; revenue: number }>;
    weekdayBreakdown: Array<{ label: string; count: number }>;
  };
  history: PractitionerStatsLiteAppointment[];
};

@Injectable({ providedIn: 'root' })
export class AdminPractitionersApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/practitioners`;

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

  deletePractitioner(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/${id}`);
  }

  getStats(id: string, period: PractitionerStatsPeriod): Observable<PractitionerStatsResponse> {
    return this.http.get<PractitionerStatsResponse>(`${this.baseUrl}/${id}/stats?period=${period}`);
  }
}
