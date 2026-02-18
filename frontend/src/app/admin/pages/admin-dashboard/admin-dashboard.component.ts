import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminDashboardData, DashboardStateService } from '../../../core/services/dashboard-state.service';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent {
  private readonly dashboardState = inject(DashboardStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly dashboard = signal<AdminDashboardData | null>(null);
  protected readonly weeklyAppointmentsTarget = 20;

  protected readonly weekProgressPercent = computed(() => {
    const data = this.dashboard();
    if (!data || this.weeklyAppointmentsTarget <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((data.stats.weekAppointments / this.weeklyAppointmentsTarget) * 100)));
  });

  constructor() {
    this.dashboardState.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.dashboard.set(data);
    });
    this.dashboardState.loading$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((loading) => {
      this.loading.set(loading);
    });
    this.dashboardState.error$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((message) => {
      this.errorMessage.set(message);
    });
    this.dashboardState.startAutoRefresh(30_000);
  }

  protected goToRequests(): void {
    void this.router.navigateByUrl('/admin/demandes');
  }

  protected formatEuro(value: number): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  }

  protected formatTime(value: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }
}
