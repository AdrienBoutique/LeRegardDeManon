import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  defaultHomeContent,
  HomeContentApi,
  HomeContentPayload,
  HomeReasonItem,
  HomeTestimonialItem
} from '../../../core/api/home-content.api';

@Component({
  selector: 'app-admin-home-content',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-home-content.html',
  styleUrl: './admin-home-content.scss'
})
export class AdminHomeContent {
  private readonly api = inject(HomeContentApi);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly newAboutImageUrl = signal('');
  protected readonly content = signal<HomeContentPayload>(defaultHomeContent());

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.getAdminContent().subscribe({
      next: (payload) => {
        this.content.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set("Impossible de charger le contenu d'accueil.");
      }
    });
  }

  protected save(): void {
    this.saving.set(true);
    this.errorMessage.set('');

    this.api.updateAdminContent(this.content()).subscribe({
      next: (payload) => {
        this.content.set(payload);
        this.saving.set(false);
        this.toastMessage.set('Accueil mis a jour.');
        setTimeout(() => this.toastMessage.set(''), 2200);
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Sauvegarde impossible.');
      }
    });
  }

  protected updateHero(field: keyof HomeContentPayload['hero'], value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      hero: { ...current.hero, [field]: value }
    }));
  }

  protected updateOffers(field: keyof HomeContentPayload['offers'], value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      offers: { ...current.offers, [field]: value }
    }));
  }

  protected updateAbout(field: keyof HomeContentPayload['about'], value: string | boolean | string[]): void {
    this.content.update((current) => ({
      ...current,
      about: { ...current.about, [field]: value }
    }));
  }

  protected updateReasons(field: keyof HomeContentPayload['reasons'], value: string | boolean | HomeReasonItem[]): void {
    this.content.update((current) => ({
      ...current,
      reasons: { ...current.reasons, [field]: value }
    }));
  }

  protected updateReasonItem(index: number, field: keyof HomeReasonItem, value: string): void {
    this.content.update((current) => ({
      ...current,
      reasons: {
        ...current.reasons,
        items: current.reasons.items.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
      }
    }));
  }

  protected addReasonItem(): void {
    this.content.update((current) => ({
      ...current,
      reasons: {
        ...current.reasons,
        items: [...current.reasons.items, { title: 'Nouveau point', text: 'Texte a completer.' }]
      }
    }));
  }

  protected removeReasonItem(index: number): void {
    this.content.update((current) => {
      if (current.reasons.items.length <= 1) {
        return current;
      }
      return {
        ...current,
        reasons: {
          ...current.reasons,
          items: current.reasons.items.filter((_, idx) => idx !== index)
        }
      };
    });
  }

  protected updateTestimonials(
    field: keyof HomeContentPayload['testimonials'],
    value: string | boolean | HomeTestimonialItem[]
  ): void {
    this.content.update((current) => ({
      ...current,
      testimonials: { ...current.testimonials, [field]: value }
    }));
  }

  protected updateTestimonialItem(index: number, field: keyof HomeTestimonialItem, value: string | number): void {
    this.content.update((current) => ({
      ...current,
      testimonials: {
        ...current.testimonials,
        items: current.testimonials.items.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
      }
    }));
  }

  protected addTestimonialItem(): void {
    this.content.update((current) => ({
      ...current,
      testimonials: {
        ...current.testimonials,
        items: [...current.testimonials.items, { name: 'Nouveau client', text: 'Votre avis ici.', rating: 5 }]
      }
    }));
  }

  protected removeTestimonialItem(index: number): void {
    this.content.update((current) => {
      if (current.testimonials.items.length <= 1) {
        return current;
      }

      return {
        ...current,
        testimonials: {
          ...current.testimonials,
          items: current.testimonials.items.filter((_, idx) => idx !== index)
        }
      };
    });
  }

  protected updateContact(field: keyof HomeContentPayload['contact'], value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      contact: { ...current.contact, [field]: value }
    }));
  }

  protected updateCtaFinal(field: keyof HomeContentPayload['ctaFinal'], value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      ctaFinal: { ...current.ctaFinal, [field]: value }
    }));
  }

  protected addAboutImage(): void {
    const raw = this.newAboutImageUrl().trim();
    if (!raw) {
      return;
    }

    this.content.update((current) => ({
      ...current,
      about: {
        ...current.about,
        images: [...current.about.images, raw]
      }
    }));

    this.newAboutImageUrl.set('');
  }

  protected removeAboutImage(index: number): void {
    this.content.update((current) => ({
      ...current,
      about: {
        ...current.about,
        images: current.about.images.filter((_, idx) => idx !== index)
      }
    }));
  }

  protected blockClass(visible: boolean): string {
    return visible ? 'block-editor' : 'block-editor block-hidden';
  }
}
