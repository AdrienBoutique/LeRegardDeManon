import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminStaffItem = {
  id: string;
  name: string;
  email: string;
  hasAccount?: boolean;
  userRole?: 'ADMIN' | 'STAFF' | null;
  active: boolean;
  isTrainee: boolean;
  colorHex: string;
  defaultDiscountPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AvailabilityMode = 'WEEKLY' | 'CUSTOM_DAYS';

export type StaffPlanningSettings = {
  staffId: string;
  availabilityMode: AvailabilityMode;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CustomWorkingDaySlot = {
  id: string;
  startTime: string;
  endTime: string;
};

export type CustomWorkingDayItem = {
  id: string;
  staffId: string;
  date: string;
  isClosed: boolean;
  slots: CustomWorkingDaySlot[];
  createdAt: string;
  updatedAt: string;
};

export type AdminAvailabilityItem = {
  id: string | null;
  staffId: string;
  weekday: number;
  off?: boolean;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WeeklyAvailabilityDay = {
  weekday: number;
  off: boolean;
  startTime: string | null;
  endTime: string | null;
  active?: boolean;
};

export type WeeklyAvailabilityResponse = {
  staffId?: string;
  days: WeeklyAvailabilityDay[];
};

export type InstituteWeeklyAvailabilityResponse = {
  days: WeeklyAvailabilityDay[];
};

export type AdminTimeOffItem = {
  id: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  reason: string | null;
  createdAt: string;
};

export type AdminStaffServiceItem = {
  id: string;
  serviceId: string;
  staffId: string;
  serviceName: string;
  serviceDurationMin: number;
  serviceActive: boolean;
  basePriceCents: number;
  priceCentsOverride: number | null;
  discountPercentOverride: number | null;
  effectivePriceCents: number;
  createdAt: string;
};

@Injectable({ providedIn: 'root' })
export class AdminInstituteApiService {
  private readonly http = inject(HttpClient);
  private readonly adminBaseUrl = `${environment.apiUrl}/api/admin`;

  listStaff(): Observable<AdminStaffItem[]> {
    return this.http.get<AdminStaffItem[]>(`${this.adminBaseUrl}/staff`);
  }

  createStaff(payload: {
    name: string;
    email: string;
    active?: boolean;
    isTrainee?: boolean;
    colorHex?: string;
    defaultDiscountPercent?: number | null;
  }): Observable<AdminStaffItem> {
    return this.http.post<AdminStaffItem>(`${this.adminBaseUrl}/staff`, payload);
  }

  updateStaff(
    id: string,
    payload: Partial<{
      name: string;
      email: string;
      active: boolean;
      isTrainee: boolean;
      colorHex: string;
      defaultDiscountPercent: number | null;
    }>
  ): Observable<AdminStaffItem> {
    return this.http.patch<AdminStaffItem>(`${this.adminBaseUrl}/staff/${id}`, payload);
  }

  deleteStaff(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.adminBaseUrl}/staff/${id}`);
  }

  updateStaffRole(
    id: string,
    role: 'ADMIN' | 'STAFF'
  ): Observable<Pick<AdminStaffItem, 'id' | 'name' | 'hasAccount' | 'userRole'>> {
    return this.http.patch<Pick<AdminStaffItem, 'id' | 'name' | 'hasAccount' | 'userRole'>>(
      `${this.adminBaseUrl}/staff/${id}/role`,
      { role }
    );
  }

  listAvailability(staffId: string): Observable<AdminAvailabilityItem[]> {
    return this.http.get<AdminAvailabilityItem[]>(`${this.adminBaseUrl}/staff/${staffId}/availability`);
  }

  getAvailability(staffId: string): Observable<AdminAvailabilityItem[]> {
    return this.listAvailability(staffId);
  }

  getInstituteAvailability(): Observable<Array<{
    id: string | null;
    weekday: number;
    off?: boolean;
    startTime: string | null;
    endTime: string | null;
    active: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  }>> {
    return this.http.get<Array<{
      id: string | null;
      weekday: number;
      off?: boolean;
      startTime: string | null;
      endTime: string | null;
      active: boolean;
      createdAt: string | null;
      updatedAt: string | null;
    }>>(`${this.adminBaseUrl}/availability/institute`);
  }

  updateAvailability(
    staffId: string,
    days: Array<{ weekday: number; off: boolean; startTime?: string; endTime?: string }>
  ): Observable<WeeklyAvailabilityResponse> {
    return this.http.put<WeeklyAvailabilityResponse>(`${this.adminBaseUrl}/staff/${staffId}/availability`, { days });
  }

  updateInstituteAvailability(
    days: Array<{ weekday: number; off: boolean; startTime?: string; endTime?: string }>
  ): Observable<InstituteWeeklyAvailabilityResponse> {
    return this.http.put<InstituteWeeklyAvailabilityResponse>(`${this.adminBaseUrl}/availability/institute`, { days });
  }

  createAvailability(
    staffId: string,
    payload: { weekday: number; startTime: string; endTime: string }
  ): Observable<AdminAvailabilityItem> {
    return this.http.post<AdminAvailabilityItem>(`${this.adminBaseUrl}/staff/${staffId}/availability`, payload);
  }

  updateAvailabilityRule(
    id: string,
    payload: Partial<{ weekday: number; startTime: string; endTime: string }>
  ): Observable<AdminAvailabilityItem> {
    return this.http.patch<AdminAvailabilityItem>(`${this.adminBaseUrl}/availability/${id}`, payload);
  }

  deleteAvailability(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.adminBaseUrl}/availability/${id}`);
  }

  getStaffPlanningSettings(staffId: string): Observable<StaffPlanningSettings> {
    return this.http.get<StaffPlanningSettings>(`${this.adminBaseUrl}/staff/${staffId}/planning-settings`);
  }

  updateStaffPlanningSettings(
    staffId: string,
    payload: { availabilityMode: AvailabilityMode }
  ): Observable<StaffPlanningSettings> {
    return this.http.put<StaffPlanningSettings>(
      `${this.adminBaseUrl}/staff/${staffId}/planning-settings`,
      payload
    );
  }

  listCustomWorkingDays(staffId: string, start: string, end: string): Observable<{ staffId: string; start: string; end: string; days: CustomWorkingDayItem[] }> {
    return this.http.get<{ staffId: string; start: string; end: string; days: CustomWorkingDayItem[] }>(
      `${this.adminBaseUrl}/staff/${staffId}/custom-days?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    );
  }

  upsertCustomWorkingDay(
    staffId: string,
    date: string,
    payload: { isClosed?: boolean; slots?: Array<{ startTime: string; endTime: string }> }
  ): Observable<{ day: CustomWorkingDayItem | null }> {
    return this.http.put<{ day: CustomWorkingDayItem | null }>(
      `${this.adminBaseUrl}/staff/${staffId}/custom-days/${encodeURIComponent(date)}`,
      payload
    );
  }

  deleteCustomWorkingDay(staffId: string, date: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.adminBaseUrl}/staff/${staffId}/custom-days/${encodeURIComponent(date)}`
    );
  }

  deleteCustomWorkingDaySlot(staffId: string, date: string, slotId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(
      `${this.adminBaseUrl}/staff/${staffId}/custom-days/${encodeURIComponent(date)}/slots/${slotId}`
    );
  }

  listTimeOff(staffId: string): Observable<AdminTimeOffItem[]> {
    return this.http.get<AdminTimeOffItem[]>(`${this.adminBaseUrl}/staff/${staffId}/timeoff`);
  }

  listGlobalTimeOff(): Observable<AdminTimeOffItem[]> {
    return this.http.get<AdminTimeOffItem[]>(`${this.adminBaseUrl}/timeoff/global`);
  }

  createTimeOff(
    staffId: string,
    payload:
      | { isAllDay: true; date: string; reason?: string }
      | { startsAt: string; endsAt: string; reason?: string }
  ): Observable<AdminTimeOffItem> {
    return this.http.post<AdminTimeOffItem>(`${this.adminBaseUrl}/staff/${staffId}/timeoff`, payload);
  }

  createGlobalTimeOff(
    payload:
      | { isAllDay: true; date: string; reason?: string }
      | { startsAt: string; endsAt: string; reason?: string }
  ): Observable<{ ok: true; createdCount: number }> {
    return this.http.post<{ ok: true; createdCount: number }>(`${this.adminBaseUrl}/timeoff/global`, payload);
  }

  deleteTimeOff(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.adminBaseUrl}/timeoff/${id}`);
  }

  deleteGlobalTimeOff(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.adminBaseUrl}/timeoff/global/${id}`);
  }

  listStaffServices(staffId: string): Observable<AdminStaffServiceItem[]> {
    return this.http.get<AdminStaffServiceItem[]>(`${this.adminBaseUrl}/staff/${staffId}/services`);
  }

  assignService(
    staffId: string,
    payload: {
      serviceId: string;
      priceCentsOverride?: number | null;
      discountPercentOverride?: number | null;
    }
  ): Observable<AdminStaffServiceItem> {
    return this.http.post<AdminStaffServiceItem>(`${this.adminBaseUrl}/staff/${staffId}/services`, payload);
  }

  updateServiceAssignment(
    id: string,
    payload: {
      priceCentsOverride?: number | null;
      discountPercentOverride?: number | null;
    }
  ): Observable<AdminStaffServiceItem> {
    return this.http.patch<AdminStaffServiceItem>(`${this.adminBaseUrl}/service-staff/${id}`, payload);
  }

  deleteServiceAssignment(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.adminBaseUrl}/service-staff/${id}`);
  }
}
