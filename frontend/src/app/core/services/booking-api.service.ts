import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BookingServiceItem = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  active?: boolean;
  categoryId?: string | null;
  categoryName?: string | null;
};

export type BookingStaffItem = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type FreeStartItem = {
  startAt: string;
  maxFreeMin: number;
  staffIds: string[];
};

export type FreeStartsResponse = {
  date: string;
  stepMin: number;
  starts: FreeStartItem[];
};

export type EligibleServiceItem = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  durationMin: number;
  basePriceCents: number;
  effectivePriceCents: number;
  eligible: boolean;
  reason?: string;
  bestStaffId: string | null;
};

export type EligibleServicesResponse = {
  startAt: string;
  maxFreeMin: number;
  services: EligibleServiceItem[];
};

export type CreateAppointmentPayload = {
  serviceId: string;
  staffId?: string;
  startAt: string;
  smsConsent?: boolean;
  client: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  notes?: string;
};

export type CreateAppointmentResponse = {
  appointmentId: string;
  startAt: string;
  endAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  message: string;
  staffName: string;
  serviceName: string;
};

export type AvailabilityLevel = 'none' | 'low' | 'mid' | 'high';

export type MonthDayMeta = Record<string, { level: AvailabilityLevel }>;
export type MonthlyAvailabilityResponse = {
  dayMeta: MonthDayMeta;
  showAvailabilityDots: boolean;
};

@Injectable({ providedIn: 'root' })
export class BookingApiService {
  private readonly http = inject(HttpClient);

  listServices(): Observable<BookingServiceItem[]> {
    return this.http.get<BookingServiceItem[]>(`${environment.apiUrl}/api/services`);
  }

  listStaff(): Observable<BookingStaffItem[]> {
    return this.http.get<BookingStaffItem[]>(`${environment.apiUrl}/api/staff`);
  }

  getFreeStarts(date: string, staffId?: string): Observable<FreeStartsResponse> {
    const staffParam = staffId ? `&staffId=${encodeURIComponent(staffId)}` : '';
    return this.http.get<FreeStartsResponse>(
      `${environment.apiUrl}/api/free-starts?date=${encodeURIComponent(date)}${staffParam}`
    );
  }

  getEligibleServices(startAt: string, staffId?: string): Observable<EligibleServicesResponse> {
    const staffParam = staffId ? `&staffId=${encodeURIComponent(staffId)}` : '';
    return this.http.get<EligibleServicesResponse>(
      `${environment.apiUrl}/api/eligible-services?startAt=${encodeURIComponent(startAt)}${staffParam}`
    );
  }

  createAppointment(payload: CreateAppointmentPayload): Observable<CreateAppointmentResponse> {
    return this.http.post<CreateAppointmentResponse>(`${environment.apiUrl}/api/appointments`, payload);
  }

  getMonthlyAvailability(month: string, staffId?: string): Observable<MonthlyAvailabilityResponse> {
    const staffParam = staffId ? `&staffId=${encodeURIComponent(staffId)}` : '';
    return this.http
      .get<{
        dayMeta?: MonthDayMeta;
        days?: Array<{ date: string; level: AvailabilityLevel }>;
        showAvailabilityDots?: boolean;
      }>(`${environment.apiUrl}/api/public/availability/month?month=${encodeURIComponent(month)}${staffParam}`)
      .pipe(
        map((response) => {
          const showAvailabilityDots = response.showAvailabilityDots !== false;

          if (response.dayMeta && typeof response.dayMeta === 'object') {
            return {
              dayMeta: response.dayMeta,
              showAvailabilityDots
            };
          }

          if (Array.isArray(response.days)) {
            const mapped: MonthDayMeta = {};
            for (const day of response.days) {
              mapped[day.date] = { level: day.level };
            }
            return {
              dayMeta: mapped,
              showAvailabilityDots
            };
          }

          return {
            dayMeta: {},
            showAvailabilityDots
          };
        })
      );
  }
}
