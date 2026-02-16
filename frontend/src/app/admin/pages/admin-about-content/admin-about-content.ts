import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AboutPageContent,
  defaultAboutPageContent,
  PageContentApi
} from '../../../core/api/page-content.api';

@Component({
  selector: 'app-admin-about-content',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-about-content.html',
  styleUrl: './admin-about-content.scss'
})
export class AdminAboutContent {
  private readonly api = inject(PageContentApi);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly content = signal<AboutPageContent>(defaultAboutPageContent());

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.getAdminContent<AboutPageContent>('about').subscribe({
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

    this.api.updateAdminContent<AboutPageContent>('about', this.content()).subscribe({
      next: (payload) => {
        this.content.set(payload);
        this.saving.set(false);
        this.toastMessage.set('Page A propos mise a jour.');
        setTimeout(() => this.toastMessage.set(''), 2200);
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Sauvegarde impossible.');
      }
    });
  }

  protected patch(section: keyof AboutPageContent, field: string, value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }
}
