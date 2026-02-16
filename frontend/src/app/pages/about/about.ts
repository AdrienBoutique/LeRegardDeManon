import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AboutPageContent,
  defaultAboutPageContent,
  PageContentApi
} from '../../core/api/page-content.api';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.scss'
})
export class About {
  private readonly pageContentApi = inject(PageContentApi);
  private readonly authService = inject(AuthService);

  protected readonly content = signal<AboutPageContent>(defaultAboutPageContent());
  protected readonly errorMessage = signal('');
  protected readonly isAdminLoggedIn = signal(this.authService.isLoggedIn());

  constructor() {
    this.pageContentApi.getPublicContent<AboutPageContent>('about').subscribe({
      next: (payload) => this.content.set(payload),
      error: () => this.errorMessage.set("Impossible de charger la page A propos.")
    });
  }
}
