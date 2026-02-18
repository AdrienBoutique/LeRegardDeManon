import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BookingMode = 'MANUAL' | 'AUTO_INTELLIGENT';
export type AdminSettings = {
  bookingMode: BookingMode;
  showAvailabilityDots: boolean;
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
