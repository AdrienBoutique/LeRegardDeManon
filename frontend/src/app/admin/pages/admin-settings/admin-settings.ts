import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import {
  AdminSettingsApiService,
  AvailabilityDisplayMode,
  BookingMode
} from '../../../core/services/admin-settings-api.service';

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
  protected readonly availabilityDisplayMode = signal<AvailabilityDisplayMode>('dots');
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
          this.availabilityDisplayMode.set(
            settings.availabilityDisplayMode ?? (settings.showAvailabilityDots === false ? 'colors' : 'dots')
          );
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
      .updateSettings({ bookingMode: mode })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (settings) => {
          this.bookingMode.set(settings.bookingMode);
          this.availabilityDisplayMode.set(
            settings.availabilityDisplayMode ?? (settings.showAvailabilityDots === false ? 'colors' : 'dots')
          );
          this.successMessage.set('Reglages enregistres.');
          this.errorMessage.set('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour impossible.');
        }
      });
  }

  protected saveAvailabilityDisplayMode(mode: AvailabilityDisplayMode): void {
    if (this.saving() || this.availabilityDisplayMode() === mode) {
      return;
    }

    this.saving.set(true);
    this.api
      .updateSettings({ availabilityDisplayMode: mode })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (settings) => {
          this.bookingMode.set(settings.bookingMode);
          this.availabilityDisplayMode.set(
            settings.availabilityDisplayMode ?? (settings.showAvailabilityDots === false ? 'colors' : 'dots')
          );
          this.successMessage.set('Reglages enregistres.');
          this.errorMessage.set('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour impossible.');
        }
      });
  }
}
