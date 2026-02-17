import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type StaffPlanningAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  notes: string | null;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  items: Array<{
    serviceId: string;
    serviceName: string;
    durationMin: number;
    priceCents: number;
    order: number;
  }>;
};

export type StaffPlanningResponse = {
  date: string;
  practitionerId: string;
  appointments: StaffPlanningAppointment[];
};

@Injectable({ providedIn: 'root' })
export class StaffPlanningService {
  private readonly http = inject(HttpClient);

  getMyPlanning(date?: string, practitionerId?: string): Observable<StaffPlanningResponse> {
    let params = new HttpParams();
    if (date) {
      params = params.set('date', date);
    }
    if (practitionerId) {
      params = params.set('practitionerId', practitionerId);
    }
    return this.http.get<StaffPlanningResponse>(`${environment.apiUrl}/api/staff/me/planning`, { params });
  }
}
