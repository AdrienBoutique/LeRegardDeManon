import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ContactDayHours,
  ContactPageContent,
  defaultContactPageContent,
  PageContentApi
} from '../../core/api/page-content.api';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-contact',
  imports: [RouterLink],
  templateUrl: './contact.html',
  styleUrl: './contact.scss'
})
export class Contact {
  private readonly pageContentApi = inject(PageContentApi);
  private readonly authService = inject(AuthService);

  protected readonly content = signal<ContactPageContent>(defaultContactPageContent());
  protected readonly errorMessage = signal('');
  protected readonly isAdminLoggedIn = signal(this.authService.isLoggedIn());

  constructor() {
    this.pageContentApi.getPublicContent<ContactPageContent>('contact').subscribe({
      next: (payload) => this.content.set(payload),
      error: () => this.errorMessage.set('Impossible de charger la page Contact.')
    });
  }

  protected showDetailedHours(): boolean {
    const weekly = this.content().info.weeklyHours;
    if (!weekly.length) {
      return false;
    }

    const patterns = new Set(weekly.map((day) => (day.closed ? 'closed' : `${day.start}-${day.end}`)));
    return patterns.size > 1;
  }

  protected formatDayHours(day: ContactDayHours): string {
    if (day.closed) {
      return 'Ferme';
    }

    return `${this.formatHour(day.start)} - ${this.formatHour(day.end)}`;
  }

  private formatHour(value: string): string {
    return value.replace(':', 'h');
  }
}
