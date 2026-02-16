import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminPromotionServiceItem = {
  id: string;
  name: string;
  priceCents: number;
  durationMin: number;
  active: boolean;
  discountedPriceCents: number;
  discountLabel: string;
};

export type AdminPromotionItem = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValueInt: number;
  computedDiscountLabel: string;
  startAt: string;
  endAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  services: AdminPromotionServiceItem[];
};

export type CreateAdminPromotionPayload = {
  title: string;
  subtitle?: string;
  description?: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValueInt: number;
  startAt: string;
  endAt: string;
  active: boolean;
  serviceIds: string[];
};

export type UpdateAdminPromotionPayload = {
  title?: string;
  subtitle?: string | null;
  description?: string | null;
  discountType?: 'PERCENT' | 'FIXED';
  discountValueInt?: number;
  startAt?: string;
  endAt?: string;
  active?: boolean;
  serviceIds?: string[];
};

@Injectable({ providedIn: 'root' })
export class AdminPromotionsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/admin/promotions`;

  listPromotions(): Observable<AdminPromotionItem[]> {
    return this.http.get<AdminPromotionItem[]>(this.baseUrl);
  }

  createPromotion(payload: CreateAdminPromotionPayload): Observable<AdminPromotionItem> {
    return this.http.post<AdminPromotionItem>(this.baseUrl, payload);
  }

  updatePromotion(id: string, payload: UpdateAdminPromotionPayload): Observable<AdminPromotionItem> {
    return this.http.patch<AdminPromotionItem>(`${this.baseUrl}/${id}`, payload);
  }

  togglePromotion(id: string, active: boolean): Observable<{ id: string; active: boolean; updatedAt: string }> {
    return this.http.post<{ id: string; active: boolean; updatedAt: string }>(`${this.baseUrl}/${id}/toggle`, {
      active
    });
  }

  deletePromotion(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.baseUrl}/${id}`);
  }
}
