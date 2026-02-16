import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicPromotionsApi } from '../../core/api/public-promotions.api';
import { SectionTitle } from '../../shared/ui/section-title/section-title';

@Component({
  selector: 'app-home',
  imports: [RouterLink, AsyncPipe, SectionTitle],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private readonly publicPromotionsApi = inject(PublicPromotionsApi);
  protected readonly activePromotions$ = this.publicPromotionsApi.getActivePromotions();

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(priceCents / 100);
  }

  protected formatUntilDate(endAt: string): string {
    const date = new Date(endAt);
    return `Jusqu'au ${new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long'
    }).format(date)}`;
  }
}
