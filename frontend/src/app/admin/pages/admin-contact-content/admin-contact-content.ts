import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ContactDayHours,
  ContactFaqItem,
  ContactPageContent,
  defaultContactPageContent,
  PageContentApi
} from '../../../core/api/page-content.api';

@Component({
  selector: 'app-admin-contact-content',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-contact-content.html',
  styleUrl: './admin-contact-content.scss'
})
export class AdminContactContent {
  private readonly api = inject(PageContentApi);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly content = signal<ContactPageContent>(defaultContactPageContent());

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.getAdminContent<ContactPageContent>('contact').subscribe({
      next: (payload) => {
        this.content.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Chargement impossible.');
      }
    });
  }

  protected save(): void {
    this.saving.set(true);
    this.errorMessage.set('');

    this.api.updateAdminContent<ContactPageContent>('contact', this.content()).subscribe({
      next: (payload) => {
        this.content.set(payload);
        this.saving.set(false);
        this.toastMessage.set('Page Contact mise a jour.');
        setTimeout(() => this.toastMessage.set(''), 2200);
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Sauvegarde impossible.');
      }
    });
  }

  protected patch(
    section: keyof ContactPageContent,
    field: string,
    value: string | boolean | ContactFaqItem[] | ContactDayHours[]
  ): void {
    this.content.update((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }

  protected patchWeeklyHour(index: number, field: keyof ContactDayHours, value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      info: {
        ...current.info,
        weeklyHours: current.info.weeklyHours.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
      }
    }));
  }

  protected patchFaqItem(index: number, field: keyof ContactFaqItem, value: string): void {
    this.content.update((current) => ({
      ...current,
      faq: {
        ...current.faq,
        items: current.faq.items.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
      }
    }));
  }

  protected addFaqItem(): void {
    this.content.update((current) => ({
      ...current,
      faq: {
        ...current.faq,
        items: [...current.faq.items, { question: 'Nouvelle question', answer: 'Nouvelle reponse.' }]
      }
    }));
  }

  protected removeFaqItem(index: number): void {
    this.content.update((current) => {
      if (current.faq.items.length <= 1) {
        return current;
      }

      return {
        ...current,
        faq: {
          ...current.faq,
          items: current.faq.items.filter((_, idx) => idx !== index)
        }
      };
    });
  }
}
