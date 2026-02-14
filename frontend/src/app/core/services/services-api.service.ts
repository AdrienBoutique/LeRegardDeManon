import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ApiServiceItem = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceCents: number;
  active?: boolean;
  categoryId?: string | null;
  categoryName?: string | null;
  category?: string;
};

@Injectable({ providedIn: 'root' })
export class ServicesApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<ApiServiceItem[]> {
    return this.http.get<ApiServiceItem[]>(`${environment.apiBaseUrl}/api/services`);
  }
}
