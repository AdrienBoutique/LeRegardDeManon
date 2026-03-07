import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlanningStaffItem = {
  id: string;
  name: string;
  colorHex: string;
};

export type PlanningAppointmentItem = {
  id: string;
  startAt: string;
  endAt: string;
  status: 'BOOKED' | 'DONE' | 'NO_SHOW' | 'CANCELLED';
  serviceId: string;
  serviceName: string;
  serviceColorHex: string | null;
  services?: Array<{
    serviceId: string;
    name: string;
    durationMin: number;
    price: number;
  }>;
  clientId?: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  staffId: string;
  staffName?: string;
  staffColorHex: string;
};

export type PlanningResponse = {
  staff: PlanningStaffItem[];
  appointments: PlanningAppointmentItem[];
  staffAvailability: Array<{
    staffId: string;
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
  instituteAvailability?: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
  }>;
  timeOff: Array<{
    id: string;
    staffId: string;
    staffName: string;
    staffColorHex: string;
    startsAt: string;
    endsAt: string;
    isAllDay: boolean;
    reason: string | null;
  }>;
};

@Injectable({ providedIn: 'root' })
export class AdminPlanningService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/planning`;

  getPlanning(start: string, end: string): Observable<PlanningResponse> {
    return this.http.get<PlanningResponse>(`${this.baseUrl}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }
}
