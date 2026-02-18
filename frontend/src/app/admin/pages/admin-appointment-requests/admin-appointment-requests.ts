import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AdminAppointmentRequestsApiService,
  PendingAppointmentItem
} from '../../../core/services/admin-appointment-requests-api.service';
import { NotificationsCardComponent } from '../../components/notifications-card/notifications-card.component';

@Component({
  selector: 'app-admin-appointment-requests',
  imports: [FormsModule, NotificationsCardComponent],
  templateUrl: './admin-appointment-requests.html',
  styleUrl: './admin-appointment-requests.scss'
})
export class AdminAppointmentRequests {
  private readonly api = inject(AdminAppointmentRequestsApiService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly pendingItems = signal<PendingAppointmentItem[]>([]);
  protected readonly rejectOpenId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api
      .listPending()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.pendingItems.set(items),
        error: (error: { error?: { error?: string } }) => {
          this.pendingItems.set([]);
          this.errorMessage.set(error.error?.error ?? 'Chargement impossible.');
        }
      });
  }

  protected accept(item: PendingAppointmentItem): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.api
      .accept(item.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Demande acceptee.');
          this.pendingItems.update((rows) => rows.filter((row) => row.id !== item.id));
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Validation impossible.');
        }
      });
  }

  protected openReject(item: PendingAppointmentItem): void {
    this.rejectOpenId.set(item.id);
    this.rejectReason.set('');
  }

  protected closeReject(): void {
    this.rejectOpenId.set(null);
    this.rejectReason.set('');
  }

  protected reject(item: PendingAppointmentItem): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.api
      .reject(item.id, this.rejectReason())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Demande refusee.');
          this.pendingItems.update((rows) => rows.filter((row) => row.id !== item.id));
          this.closeReject();
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Refus impossible.');
        }
      });
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  protected serviceNames(item: PendingAppointmentItem): string {
    return item.services.map((service) => service.name).join(', ');
  }
}
