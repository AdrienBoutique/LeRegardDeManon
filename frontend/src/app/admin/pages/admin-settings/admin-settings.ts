import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AdminSettingsApiService,
  AvailabilityDisplayMode,
  BookingMode
} from '../../../core/services/admin-settings-api.service';

@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss'
})
export class AdminSettings {
  private readonly api = inject(AdminSettingsApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly bookingMode = signal<BookingMode>('MANUAL');
  protected readonly availabilityDisplayMode = signal<AvailabilityDisplayMode>('dots');
  protected readonly smsEnabled = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly smsForm = this.formBuilder.group({
    smsEnabled: this.formBuilder.nonNullable.control(true),
    smsConfirmationEnabled: this.formBuilder.nonNullable.control(true),
    smsReminder24hEnabled: this.formBuilder.nonNullable.control(true),
    smsReminder2hEnabled: this.formBuilder.nonNullable.control(false),
    smsCancellationEnabled: this.formBuilder.nonNullable.control(true),
    smsRescheduleEnabled: this.formBuilder.nonNullable.control(true),
    smsSender: this.formBuilder.control('', [Validators.maxLength(30)]),
    smsTemplateConfirmation: this.formBuilder.control(''),
    smsTemplateReminder24h: this.formBuilder.control(''),
    smsTemplateReminder2h: this.formBuilder.control(''),
    smsTemplateCancellation: this.formBuilder.control(''),
    smsTemplateReschedule: this.formBuilder.control('')
  });
  protected readonly smsOptionsDisabled = computed(() => this.saving() || !this.smsEnabled());

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
          this.smsEnabled.set(settings.smsEnabled);
          this.smsForm.reset({
            smsEnabled: settings.smsEnabled,
            smsConfirmationEnabled: settings.smsConfirmationEnabled,
            smsReminder24hEnabled: settings.smsReminder24hEnabled,
            smsReminder2hEnabled: settings.smsReminder2hEnabled,
            smsCancellationEnabled: settings.smsCancellationEnabled,
            smsRescheduleEnabled: settings.smsRescheduleEnabled,
            smsSender: settings.smsSender ?? '',
            smsTemplateConfirmation: settings.smsTemplateConfirmation ?? '',
            smsTemplateReminder24h: settings.smsTemplateReminder24h ?? '',
            smsTemplateReminder2h: settings.smsTemplateReminder2h ?? '',
            smsTemplateCancellation: settings.smsTemplateCancellation ?? '',
            smsTemplateReschedule: settings.smsTemplateReschedule ?? ''
          });
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
    this.successMessage.set('');
    this.errorMessage.set('');
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

    this.successMessage.set('');
    this.errorMessage.set('');
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

  protected setSmsEnabled(value: boolean): void {
    this.smsEnabled.set(value);
    this.smsForm.controls.smsEnabled.setValue(value);
  }

  protected saveSmsSettings(): void {
    if (this.saving() || this.smsForm.invalid) {
      this.smsForm.markAllAsTouched();
      return;
    }

    this.successMessage.set('');
    this.errorMessage.set('');

    const raw = this.smsForm.getRawValue();
    const payload = {
      smsEnabled: raw.smsEnabled,
      smsConfirmationEnabled: raw.smsConfirmationEnabled,
      smsReminder24hEnabled: raw.smsReminder24hEnabled,
      smsReminder2hEnabled: raw.smsReminder2hEnabled,
      smsCancellationEnabled: raw.smsCancellationEnabled,
      smsRescheduleEnabled: raw.smsRescheduleEnabled,
      smsSender: raw.smsSender?.trim() || null,
      smsTemplateConfirmation: raw.smsTemplateConfirmation?.trim() || null,
      smsTemplateReminder24h: raw.smsTemplateReminder24h?.trim() || null,
      smsTemplateReminder2h: raw.smsTemplateReminder2h?.trim() || null,
      smsTemplateCancellation: raw.smsTemplateCancellation?.trim() || null,
      smsTemplateReschedule: raw.smsTemplateReschedule?.trim() || null
    };

    this.saving.set(true);
    this.api
      .updateSettings(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (settings) => {
          this.smsEnabled.set(settings.smsEnabled);
          this.smsForm.reset({
            smsEnabled: settings.smsEnabled,
            smsConfirmationEnabled: settings.smsConfirmationEnabled,
            smsReminder24hEnabled: settings.smsReminder24hEnabled,
            smsReminder2hEnabled: settings.smsReminder2hEnabled,
            smsCancellationEnabled: settings.smsCancellationEnabled,
            smsRescheduleEnabled: settings.smsRescheduleEnabled,
            smsSender: settings.smsSender ?? '',
            smsTemplateConfirmation: settings.smsTemplateConfirmation ?? '',
            smsTemplateReminder24h: settings.smsTemplateReminder24h ?? '',
            smsTemplateReminder2h: settings.smsTemplateReminder2h ?? '',
            smsTemplateCancellation: settings.smsTemplateCancellation ?? '',
            smsTemplateReschedule: settings.smsTemplateReschedule ?? ''
          });
          this.successMessage.set('Reglages SMS enregistres.');
          this.errorMessage.set('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour des SMS impossible.');
        }
      });
  }
}
