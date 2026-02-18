import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BookingMode = 'MANUAL' | 'AUTO_INTELLIGENT';

@Injectable({ providedIn: 'root' })
export class AdminSettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/settings`;

  getSettings(): Observable<{ bookingMode: BookingMode }> {
    return this.http.get<{ bookingMode: BookingMode }>(this.baseUrl);
  }

  updateSettings(bookingMode: BookingMode): Observable<{ bookingMode: BookingMode }> {
    return this.http.put<{ bookingMode: BookingMode }>(this.baseUrl, { bookingMode });
  }
}
