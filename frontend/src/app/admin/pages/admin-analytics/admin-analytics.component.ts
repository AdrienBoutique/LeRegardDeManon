import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { environment } from '../../../../environments/environment';
import 'chart.js/auto';

type AdvancedDashboardResponse = {
  period?: 'week' | 'month';
  revenue: {
    today: number;
    week: number;
    month: number;
    period?: number;
    revenuePerDayLast7Days: Array<{ date: string; sum: number }>;
    revenuePerPeriod?: Array<{ date: string; sum: number }>;
  };
  appointments: {
    totalWeekConfirmed: number;
    totalWeekCancelled: number;
    totalPeriodConfirmed?: number;
    totalPeriodCancelled?: number;
    cancellationRate: number;
  };
  clients: {
    newClientsThisWeek: number;
    returningClientsThisWeek: number;
  };
  basket: {
    averageBasket: number;
  };
  timing: {
    averageDaysBetweenAppointments: number;
  };
  weeklyPlanningHeatmap: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
  trend?: {
    labels: string[];
    revenue: number[];
    confirmed: number[];
    cancelled: number[];
  };
};

type HeatmapItem = {
  key: string;
  label: string;
  count: number;
  intensity: number;
};

@Component({
  selector: 'app-admin-analytics',
  imports: [BaseChartDirective],
  templateUrl: './admin-analytics.component.html',
  styleUrl: './admin-analytics.component.scss'
})
export class AdminAnalyticsComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly data = signal<AdvancedDashboardResponse | null>(null);
  protected readonly heatmap = signal<HeatmapItem[]>([]);
  protected readonly period = signal<'week' | 'month'>('week');

  protected readonly revenueChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [
      {
        data: [],
        label: 'CA',
        borderColor: '#8c6a52',
        backgroundColor: 'rgba(140, 106, 82, 0.2)',
        fill: true,
        tension: 0.28,
        pointRadius: 3,
        pointHoverRadius: 4
      }
    ]
  });

  protected readonly revenueChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => `${value} EUR`
        }
      }
    }
  };

  protected readonly appointmentRateChartData = signal<ChartConfiguration<'line'>['data']>({
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Confirmes',
        borderColor: '#6f8f5b',
        backgroundColor: 'rgba(111, 143, 91, 0.16)',
        fill: true,
        tension: 0.25,
        pointRadius: 3
      },
      {
        data: [],
        label: 'Annules',
        borderColor: '#b05a5a',
        backgroundColor: 'rgba(176, 90, 90, 0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 3
      }
    ]
  });

  protected readonly appointmentRateChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  constructor() {
    timer(0, 60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.fetch();
      });
  }

  protected goToRequests(): void {
    void this.router.navigateByUrl('/admin/demandes');
  }

  protected goToAppointmentHistory(): void {
    void this.router.navigateByUrl('/admin/analytics/rendez-vous');
  }

  protected setPeriod(value: string): void {
    const normalized: 'week' | 'month' = value === 'month' ? 'month' : 'week';
    this.period.set(normalized);
    this.fetch();
  }

  protected periodLabel(): string {
    return this.period() === 'month' ? 'mois' : 'semaine';
  }

  protected formatEuro(value: number): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value ?? 0);
  }

  protected formatPercent(value: number): string {
    return `${Math.round((value ?? 0) * 100)}%`;
  }

  protected heatmapBackground(item: HeatmapItem): string {
    const alpha = 0.12 + item.intensity * 0.45;
    return `rgba(140,106,82,${alpha})`;
  }

  private fetch(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const period = this.period();
    this.http
      .get<AdvancedDashboardResponse>(`${environment.apiUrl}/api/admin/dashboard/advanced?period=${period}`)
      .subscribe({
        next: (response) => {
          this.data.set(response);
          this.updateRevenueChart(response);
          this.updateAppointmentRateChart(response);
          this.updateHeatmap(response.weeklyPlanningHeatmap);
          this.loading.set(false);
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Chargement analytics impossible.');
          this.loading.set(false);
        }
      });
  }

  private updateRevenueChart(response: AdvancedDashboardResponse): void {
    const trend = response.trend;
    const rows =
      trend?.labels?.length
        ? trend.labels.map((label, index) => ({ date: label, sum: trend.revenue[index] ?? 0 }))
        : response.revenue.revenuePerPeriod ?? response.revenue.revenuePerDayLast7Days ?? [];

    this.revenueChartData.set({
      labels: rows.map((item) => item.date),
      datasets: [
        {
          data: rows.map((item) => item.sum ?? 0),
          label: 'CA',
          borderColor: '#8c6a52',
          backgroundColor: 'rgba(140, 106, 82, 0.2)',
          fill: true,
          tension: 0.28,
          pointRadius: 3,
          pointHoverRadius: 4
        }
      ]
    });
  }

  private updateAppointmentRateChart(response: AdvancedDashboardResponse): void {
    const trend = response.trend;
    if (!trend || trend.labels.length === 0) {
      this.appointmentRateChartData.set({ labels: [], datasets: [] });
      return;
    }

    this.appointmentRateChartData.set({
      labels: trend.labels,
      datasets: [
        {
          data: trend.confirmed,
          label: 'Confirmes',
          borderColor: '#6f8f5b',
          backgroundColor: 'rgba(111, 143, 91, 0.16)',
          fill: true,
          tension: 0.25,
          pointRadius: 3
        },
        {
          data: trend.cancelled,
          label: 'Annules',
          borderColor: '#b05a5a',
          backgroundColor: 'rgba(176, 90, 90, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: 3
        }
      ]
    });
  }

  private updateHeatmap(heatmap: AdvancedDashboardResponse['weeklyPlanningHeatmap']): void {
    const ordered: Array<{ key: string; label: string; count: number }> = [
      { key: 'mon', label: 'Lun', count: heatmap.mon ?? 0 },
      { key: 'tue', label: 'Mar', count: heatmap.tue ?? 0 },
      { key: 'wed', label: 'Mer', count: heatmap.wed ?? 0 },
      { key: 'thu', label: 'Jeu', count: heatmap.thu ?? 0 },
      { key: 'fri', label: 'Ven', count: heatmap.fri ?? 0 },
      { key: 'sat', label: 'Sam', count: heatmap.sat ?? 0 },
      { key: 'sun', label: 'Dim', count: heatmap.sun ?? 0 }
    ];
    const max = Math.max(1, ...ordered.map((item) => item.count));
    this.heatmap.set(
      ordered.map((item) => ({
        ...item,
        intensity: item.count / max
      }))
    );
  }
}
