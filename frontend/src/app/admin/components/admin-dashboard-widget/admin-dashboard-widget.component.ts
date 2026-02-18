import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';

type DashboardResponse = {
  pendingCount: number;
  todayCount: number;
  nextAppointment: {
    id: string;
    startAt: string;
    clientName: string;
    serviceName: string;
  } | null;
};

@Component({
  selector: 'app-admin-dashboard-widget',
  templateUrl: './admin-dashboard-widget.component.html',
  styleUrl: './admin-dashboard-widget.component.scss'
})
export class AdminDashboardWidgetComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly data = signal<DashboardResponse | null>(null);

  ngOnInit(): void {
    this.fetchDashboard();
  }

  protected openRequests(): void {
    void this.router.navigateByUrl('/admin/demandes');
  }

  protected formatTime(value: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  protected hasData(): boolean {
    const value = this.data();
    if (!value) {
      return false;
    }
    return value.pendingCount > 0 || value.todayCount > 0 || value.nextAppointment !== null;
  }

  private fetchDashboard(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.http.get<DashboardResponse>(`${environment.apiUrl}/api/admin/dashboard`).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Chargement du dashboard impossible.');
        this.data.set(null);
        this.loading.set(false);
      }
    });
  }
}
