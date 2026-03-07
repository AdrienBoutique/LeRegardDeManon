import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AppointmentsApiService } from '../../appointments/appointments-api.service';
import { AppointmentHistoryItem } from '../../appointments/appointment.models';

type HistoryStatusFilter = 'all' | 'confirmed' | 'pending' | 'cancelled' | 'noShow' | 'completed' | 'deleted';

@Component({
  selector: 'app-admin-appointments-history',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-appointments-history.component.html',
  styleUrl: './admin-appointments-history.component.scss'
})
export class AdminAppointmentsHistoryComponent {
  private readonly appointmentsApi = inject(AppointmentsApiService);

  protected readonly loading = signal(false);
  protected readonly actionLoadingId = signal<string | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly items = signal<AppointmentHistoryItem[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = 20;
  protected readonly total = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly query = signal('');
  protected readonly searchInput = signal('');
  protected readonly statusFilter = signal<HistoryStatusFilter>('all');

  protected readonly pageLabel = computed(() => {
    if (this.total() === 0) {
      return 'Aucun rendez-vous';
    }

    const from = (this.page() - 1) * this.pageSize + 1;
    const to = Math.min(this.page() * this.pageSize, this.total());
    return `${from}-${to} sur ${this.total()}`;
  });

  constructor() {
    this.fetch();
  }

  protected setStatusFilter(value: string): void {
    this.statusFilter.set((value as HistoryStatusFilter) || 'all');
    this.page.set(1);
    this.fetch();
  }

  protected submitSearch(): void {
    this.query.set(this.searchInput().trim());
    this.page.set(1);
    this.fetch();
  }

  protected clearSearch(): void {
    this.searchInput.set('');
    this.query.set('');
    this.page.set(1);
    this.fetch();
  }

  protected previousPage(): void {
    if (this.page() <= 1) {
      return;
    }
    this.page.update((value) => value - 1);
    this.fetch();
  }

  protected nextPage(): void {
    if (this.page() >= this.totalPages()) {
      return;
    }
    this.page.update((value) => value + 1);
    this.fetch();
  }

  protected statusLabel(item: AppointmentHistoryItem): string {
    if (item.deletedAt) {
      return 'Supprime';
    }
    if (item.status === 'CONFIRMED') {
      return 'Confirme';
    }
    if (item.status === 'PENDING') {
      return 'En attente';
    }
    if (item.status === 'CANCELLED') {
      return 'Annule';
    }
    if (item.status === 'NO_SHOW') {
      return 'Absence';
    }
    if (item.status === 'COMPLETED') {
      return 'Termine';
    }
    return 'Refuse';
  }

  protected statusClass(item: AppointmentHistoryItem): string {
    if (item.deletedAt) {
      return 'is-deleted';
    }
    if (item.status === 'CANCELLED') {
      return 'is-cancelled';
    }
    if (item.status === 'NO_SHOW') {
      return 'is-no-show';
    }
    if (item.status === 'COMPLETED') {
      return 'is-completed';
    }
    if (item.status === 'PENDING') {
      return 'is-pending';
    }
    return 'is-confirmed';
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  protected formatMoney(value: number): string {
    return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value ?? 0);
  }

  protected canCancel(item: AppointmentHistoryItem): boolean {
    return !item.deletedAt && item.status !== 'CANCELLED';
  }

  protected canRestoreCancel(item: AppointmentHistoryItem): boolean {
    return !item.deletedAt && item.status === 'CANCELLED';
  }

  protected canDelete(item: AppointmentHistoryItem): boolean {
    return !item.deletedAt;
  }

  protected canUndelete(item: AppointmentHistoryItem): boolean {
    return Boolean(item.deletedAt);
  }

  protected cancel(item: AppointmentHistoryItem): void {
    this.runAction(item.id, () => this.appointmentsApi.cancelAppointment(item.id), 'Rendez-vous annule.');
  }

  protected restoreCancellation(item: AppointmentHistoryItem): void {
    this.runAction(item.id, () => this.appointmentsApi.restoreAppointment(item.id), 'Rendez-vous desannule.');
  }

  protected delete(item: AppointmentHistoryItem): void {
    this.runAction(item.id, () => this.appointmentsApi.deleteAppointment(item.id), 'Rendez-vous supprime.');
  }

  protected undelete(item: AppointmentHistoryItem): void {
    this.runAction(item.id, () => this.appointmentsApi.undeleteAppointment(item.id), 'Rendez-vous restaure.');
  }

  private runAction(id: string, action: () => ReturnType<AppointmentsApiService['cancelAppointment']>, success: string): void {
    this.actionLoadingId.set(id);
    this.errorMessage.set('');
    this.successMessage.set('');

    action()
      .pipe(finalize(() => this.actionLoadingId.set(null)))
      .subscribe({
        next: () => {
          this.successMessage.set(success);
          this.fetch();
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Action impossible sur ce rendez-vous.');
        }
      });
  }

  private fetch(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.appointmentsApi
      .listAppointmentHistory({
        page: this.page(),
        pageSize: this.pageSize,
        status: this.statusFilter(),
        q: this.query()
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.total.set(response.total);
          this.totalPages.set(response.totalPages);
          this.page.set(response.page);
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Chargement des rendez-vous impossible.');
          this.items.set([]);
          this.total.set(0);
          this.totalPages.set(1);
        }
      });
  }
}
