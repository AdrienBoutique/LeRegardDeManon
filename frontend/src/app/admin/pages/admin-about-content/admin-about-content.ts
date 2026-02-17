import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AboutPageContent,
  defaultAboutPageContent,
  normalizeAboutPageContent,
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
        this.content.set(normalizeAboutPageContent(payload));
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
        this.content.set(normalizeAboutPageContent(payload));
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

  protected patchHero(field: 'visible' | 'title' | 'intro', value: string | boolean): void {
    this.content.update((current) => ({
      ...current,
      hero: {
        ...current.hero,
        [field]: value
      }
    }));
  }

  protected patchBlock(index: number, field: 'visible' | 'title' | 'text', value: string | boolean): void {
    this.content.update((current) => {
      const blocks = current.blocks.map((block, currentIndex) =>
        currentIndex === index ? { ...block, [field]: value } : block
      );
      return { ...current, blocks };
    });
  }

  protected addBlock(): void {
    this.content.update((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        {
          id: `block-${Date.now()}`,
          visible: true,
          title: 'Nouveau bloc',
          text: 'Texte du nouveau bloc.'
        }
      ]
    }));
  }

  protected removeBlock(index: number): void {
    this.content.update((current) => ({
      ...current,
      blocks: current.blocks.filter((_, currentIndex) => currentIndex !== index)
    }));
  }
}
