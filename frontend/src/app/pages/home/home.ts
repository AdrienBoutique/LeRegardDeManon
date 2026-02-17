import { AsyncPipe } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PublicPromotionItem,
  PublicPromotionsApi
} from '../../core/api/public-promotions.api';
import {
  defaultHomeContent,
  HomeContentApi,
  HomeContentPayload
} from '../../core/api/home-content.api';
import { SectionTitle } from '../../shared/ui/section-title/section-title';

@Component({
  selector: 'app-home',
  imports: [RouterLink, AsyncPipe, SectionTitle],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  @ViewChild('offersRail') private offersRail?: ElementRef<HTMLElement>;

  private readonly publicPromotionsApi = inject(PublicPromotionsApi);
  private readonly homeContentApi = inject(HomeContentApi);

  protected readonly activePromotions$ = this.publicPromotionsApi.getActivePromotions();
  protected readonly content = signal<HomeContentPayload>(defaultHomeContent());
  protected readonly contentError = signal('');
  protected readonly hasAboutImage = computed(() => this.content().about.images.length > 0);

  constructor() {
    this.homeContentApi.getPublicContent().subscribe({
      next: (payload) => this.content.set(payload),
      error: () => this.contentError.set("Impossible de charger le contenu d'accueil.")
    });
  }

  protected stars(rating: number): string {
    return '★'.repeat(Math.max(1, Math.min(5, Math.round(rating))));
  }

  protected firstAboutImage(): string | null {
    return this.content().about.images[0] ?? null;
  }

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

  protected promoBaseTotal(promo: PublicPromotionItem): number {
    return promo.services.reduce((sum, service) => sum + service.priceCents, 0);
  }

  protected promoDiscountedTotal(promo: PublicPromotionItem): number {
    return promo.services.reduce((sum, service) => sum + service.discountedPriceCents, 0);
  }

  protected scrollOffers(direction: number): void {
    const container = this.offersRail?.nativeElement;
    if (!container) {
      return;
    }

    const firstCard = container.querySelector<HTMLElement>('.offer-card');
    const gap = Number.parseFloat(getComputedStyle(container).columnGap || '16') || 16;
    const step = firstCard ? firstCard.offsetWidth + gap : Math.max(280, Math.round(container.clientWidth * 0.85));
    container.scrollBy({ left: direction * step, behavior: 'smooth' });
  }
}
