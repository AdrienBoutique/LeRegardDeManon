import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-topbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-topbar.html',
  styleUrl: './admin-topbar.scss'
})
export class AdminTopbar {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected isEditionSection(): boolean {
    const url = this.router.url;
    return (
      url.startsWith('/admin/edition') ||
      url.startsWith('/admin/accueil') ||
      url.startsWith('/admin/a-propos') ||
      url.startsWith('/admin/contact')
    );
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/admin/login');
  }
}
