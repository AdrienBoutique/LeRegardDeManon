import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PublicPromotionServiceItem = {
  id: string;
  name: string;
  priceCents: number;
  durationMin: number;
  discountedPriceCents: number;
  discountLabel: string;
};

export type PublicPromotionItem = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  computedDiscountLabel: string;
  startAt: string;
  endAt: string;
  services: PublicPromotionServiceItem[];
};

@Injectable({ providedIn: 'root' })
export class PublicPromotionsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/public/promotions`;

  getActivePromotions(): Observable<PublicPromotionItem[]> {
    return this.http.get<PublicPromotionItem[]>(`${this.baseUrl}/active`);
  }
}
