import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminServiceLiteItem = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  active: boolean;
};

@Injectable({ providedIn: 'root' })
export class AdminServicesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/admin/services`;

  listServices(): Observable<AdminServiceLiteItem[]> {
    return this.http.get<AdminServiceLiteItem[]>(this.baseUrl);
  }
}
