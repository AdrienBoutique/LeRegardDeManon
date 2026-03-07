import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BookingMode = 'MANUAL' | 'AUTO_INTELLIGENT';
export type AvailabilityDisplayMode = 'dots' | 'colors';
export type AdminSmsSettings = {
  smsEnabled: boolean;
  smsConfirmationEnabled: boolean;
  smsReminder24hEnabled: boolean;
  smsReminder2hEnabled: boolean;
  smsCancellationEnabled: boolean;
  smsRescheduleEnabled: boolean;
  smsSender: string | null;
  smsTemplateConfirmation: string | null;
  smsTemplateReminder24h: string | null;
  smsTemplateReminder2h: string | null;
  smsTemplateCancellation: string | null;
  smsTemplateReschedule: string | null;
};

export type AdminSettings = AdminSmsSettings & {
  bookingMode: BookingMode;
  showAvailabilityDots: boolean;
  availabilityDisplayMode: AvailabilityDisplayMode;
};

export type UpdateAdminSettingsPayload = Partial<AdminSettings>;

@Injectable({ providedIn: 'root' })
export class AdminSettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/settings`;

  getSettings(): Observable<AdminSettings> {
    return this.http.get<AdminSettings>(this.baseUrl);
  }

  updateSettings(payload: UpdateAdminSettingsPayload): Observable<AdminSettings> {
    return this.http.put<AdminSettings>(this.baseUrl, payload);
  }
}
