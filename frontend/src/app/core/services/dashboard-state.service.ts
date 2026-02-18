import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminDashboardData = {
  pendingCount: number;
  todayCount: number;
  nextAppointment: {
    id: string;
    startAt: string;
    clientName: string;
    serviceName: string;
  } | null;
  revenue: {
    today: number;
    week: number;
  };
  stats: {
    weekAppointments: number;
  };
};

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  private readonly http = inject(HttpClient);

  private readonly dataSubject = new BehaviorSubject<AdminDashboardData | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string>('');
  private refreshSub: Subscription | null = null;

  readonly data$ = this.dataSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly error$ = this.errorSubject.asObservable();

  get snapshot(): AdminDashboardData | null {
    return this.dataSubject.value;
  }

  startAutoRefresh(intervalMs = 30_000): void {
    if (this.refreshSub) {
      return;
    }

    this.refreshSub = timer(0, intervalMs)
      .subscribe(() => {
        this.refresh();
      });
  }

  stopAutoRefresh(): void {
    if (!this.refreshSub) {
      return;
    }
    this.refreshSub.unsubscribe();
    this.refreshSub = null;
  }

  refresh(): void {
    this.loadingSubject.next(true);
    this.errorSubject.next('');

    this.http.get<AdminDashboardData>(`${environment.apiUrl}/api/admin/dashboard`).subscribe({
      next: (data) => {
        this.dataSubject.next({
          pendingCount: Number(data.pendingCount ?? 0),
          todayCount: Number(data.todayCount ?? 0),
          nextAppointment: data.nextAppointment ?? null,
          revenue: {
            today: Number(data.revenue?.today ?? 0),
            week: Number(data.revenue?.week ?? 0)
          },
          stats: {
            weekAppointments: Number(data.stats?.weekAppointments ?? 0)
          }
        });
        this.loadingSubject.next(false);
      },
      error: () => {
        this.errorSubject.next('Chargement dashboard impossible.');
        this.loadingSubject.next(false);
      }
    });
  }
}
