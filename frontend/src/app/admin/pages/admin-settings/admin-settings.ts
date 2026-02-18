import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminSettingsApiService, BookingMode } from '../../../core/services/admin-settings-api.service';

@Component({
  selector: 'app-admin-settings',
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss'
})
export class AdminSettings {
  private readonly api = inject(AdminSettingsApiService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly bookingMode = signal<BookingMode>('MANUAL');
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api
      .getSettings()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (settings) => {
          this.bookingMode.set(settings.bookingMode);
          this.errorMessage.set('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Chargement des reglages impossible.');
        }
      });
  }

  protected save(mode: BookingMode): void {
    if (this.saving() || this.bookingMode() === mode) {
      return;
    }
    this.saving.set(true);
    this.api
      .updateSettings(mode)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (settings) => {
          this.bookingMode.set(settings.bookingMode);
          this.successMessage.set('Reglages enregistres.');
          this.errorMessage.set('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour impossible.');
        }
      });
  }
}
