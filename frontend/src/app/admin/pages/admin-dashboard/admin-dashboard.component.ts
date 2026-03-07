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
  private readonly goalStorageKey = 'admin_dashboard_goal_v1';

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly dashboard = signal<AdminDashboardData | null>(null);
  protected readonly goalType = signal<'weeklyAppointments' | 'monthlyRevenue'>('weeklyAppointments');
  protected readonly goalValue = signal(20);

  protected readonly progressPercent = computed(() => {
    const data = this.dashboard();
    const target = this.goalValue();
    if (!data || target <= 0) {
      return 0;
    }

    const current =
      this.goalType() === 'monthlyRevenue'
        ? data.revenue.month
        : data.stats.weekAppointments;

    return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  });

  protected readonly remainingToGoal = computed(() => {
    const data = this.dashboard();
    const target = this.goalValue();
    if (!data) {
      return target;
    }

    const current =
      this.goalType() === 'monthlyRevenue'
        ? data.revenue.month
        : data.stats.weekAppointments;

    return Math.max(0, target - current);
  });

  protected readonly averageBasketWeek = computed(() => {
    const data = this.dashboard();
    if (!data || data.stats.weekAppointments <= 0) {
      return 0;
    }
    return data.revenue.week / data.stats.weekAppointments;
  });

  constructor() {
    this.restoreGoal();
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

  protected setGoalType(value: string): void {
    const normalized = value === 'monthlyRevenue' ? 'monthlyRevenue' : 'weeklyAppointments';
    this.goalType.set(normalized);
    this.persistGoal();
  }

  protected setGoalValue(value: string): void {
    const parsed = Number(value);
    const next = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
    this.goalValue.set(next);
    this.persistGoal();
  }

  protected goalLabel(): string {
    return this.goalType() === 'monthlyRevenue' ? 'CA mensuel' : 'RDV hebdomadaire';
  }

  protected goalUnit(): string {
    return this.goalType() === 'monthlyRevenue' ? 'EUR' : 'RDV';
  }

  protected progressText(): string {
    const data = this.dashboard();
    if (!data) {
      return '';
    }

    if (this.goalType() === 'monthlyRevenue') {
      return `${this.formatEuro(data.revenue.month)} / ${this.formatEuro(this.goalValue())}`;
    }

    return `${data.stats.weekAppointments} / ${this.goalValue()} RDV`;
  }

  private restoreGoal(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(this.goalStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { type?: string; value?: number };
      const type = parsed.type === 'monthlyRevenue' ? 'monthlyRevenue' : 'weeklyAppointments';
      const value = Number.isFinite(parsed.value) ? Math.max(1, Math.round(parsed.value as number)) : 20;
      this.goalType.set(type);
      this.goalValue.set(value);
    } catch {
      // ignore invalid local settings
    }
  }

  private persistGoal(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      this.goalStorageKey,
      JSON.stringify({ type: this.goalType(), value: this.goalValue() })
    );
  }
}
