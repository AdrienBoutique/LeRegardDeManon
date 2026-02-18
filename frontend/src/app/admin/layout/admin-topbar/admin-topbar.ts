import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardStateService } from '../../../core/services/dashboard-state.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-admin-topbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin-topbar.html',
  styleUrl: './admin-topbar.scss'
})
export class AdminTopbar {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly pendingCount = signal(0);

  constructor() {
    if (this.isAdminUser()) {
      this.dashboardState.startAutoRefresh(30_000);
      this.dashboardState.data$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((data) => {
          this.pendingCount.set(data?.pendingCount ?? 0);
        });
    }
  }

  protected isAdminUser(): boolean {
    return this.authService.getCurrentUser()?.role === 'ADMIN';
  }

  protected isStaffUser(): boolean {
    return this.authService.getCurrentUser()?.role === 'STAFF';
  }

  protected isEditionSection(): boolean {
    const url = this.router.url;
    return (
      url.startsWith('/admin/edition') ||
      url.startsWith('/espace-pro/edition') ||
      url.startsWith('/admin/accueil') ||
      url.startsWith('/espace-pro/accueil') ||
      url.startsWith('/admin/a-propos') ||
      url.startsWith('/espace-pro/a-propos') ||
      url.startsWith('/admin/contact') ||
      url.startsWith('/espace-pro/contact')
    );
  }

  protected hasPendingBadge(): boolean {
    return this.pendingCount() > 0;
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/admin/login');
  }
}
