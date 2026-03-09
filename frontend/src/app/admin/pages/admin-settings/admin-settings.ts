import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AdminSettingsApiService,
  AvailabilityDisplayMode,
  BookingMode
} from '../../../core/services/admin-settings-api.service';

type SmsTemplateKey =
  | 'smsTemplateConfirmation'
  | 'smsTemplateReminder24h'
  | 'smsTemplateReminder2h'
  | 'smsTemplateCancellation'
  | 'smsTemplateReschedule';

type SmsVariableKey = 'establishmentName' | 'clientName' | 'date' | 'time';

type SmsTemplateConfig = {
  key: SmsTemplateKey;
  label: string;
  description: string;
};

@Component({
  selector: 'app-admin-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss'
})
export class AdminSettings {
  private readonly api = inject(AdminSettingsApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly previewValues: Record<SmsVariableKey, string> = {
    establishmentName: 'Le Regard de Manon',
    clientName: 'Sophie',
    date: '18/03/2026',
    time: '14:30'
  };
  protected readonly smsVariables: Array<{ key: SmsVariableKey; token: string; label: string; preview: string }> = [
    { key: 'establishmentName', token: '{establishmentName}', label: 'Institut', preview: this.previewValues.establishmentName },
    { key: 'clientName', token: '{clientName}', label: 'Cliente', preview: this.previewValues.clientName },
    { key: 'date', token: '{date}', label: 'Date', preview: this.previewValues.date },
    { key: 'time', token: '{time}', label: 'Heure', preview: this.previewValues.time }
  ];
  protected readonly smsTemplateConfigs: SmsTemplateConfig[] = [
    {
      key: 'smsTemplateConfirmation',
      label: 'Modele confirmation',
      description: 'Envoye juste apres confirmation du rendez-vous.'
    },
    {
      key: 'smsTemplateReminder24h',
      label: 'Modele rappel 24h',
      description: 'Rappel automatique la veille du rendez-vous.'
    },
    {
      key: 'smsTemplateReminder2h',
      label: 'Modele rappel 2h',
      description: "Rappel court juste avant l'arrivee."
    },
    {
      key: 'smsTemplateCancellation',
      label: 'Modele annulation',
      description: "Message envoye quand le rendez-vous est annule."
    },
    {
      key: 'smsTemplateReschedule',
      label: 'Modele modification de rendez-vous',
      description: "Message envoye quand l'horaire change."
    }
  ];

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
  protected readonly activeSmsEditor = signal<SmsTemplateKey | null>('smsTemplateConfirmation');
  protected readonly activeSmsTextarea = signal<HTMLTextAreaElement | null>(null);

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

  protected setActiveSmsEditor(key: SmsTemplateKey, textarea?: HTMLTextAreaElement): void {
    this.activeSmsEditor.set(key);
    if (textarea) {
      this.activeSmsTextarea.set(textarea);
    }
  }

  protected insertSmsVariable(key: SmsTemplateKey, token: string, textarea: HTMLTextAreaElement): void {
    if (this.smsOptionsDisabled()) {
      return;
    }

    const control = this.smsForm.controls[key];
    const currentValue = control.value ?? '';
    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;

    control.setValue(nextValue);
    control.markAsDirty();
    this.activeSmsEditor.set(key);

    queueMicrotask(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  protected previewSmsTemplate(key: SmsTemplateKey): string {
    const rawValue = this.smsForm.controls[key].value?.trim() || '';
    if (!rawValue) {
      return '-';
    }

    return this.smsVariables.reduce(
      (message, variable) => message.split(variable.token).join(variable.preview),
      rawValue
    );
  }

  protected countSmsCharacters(key: SmsTemplateKey): number {
    return (this.smsForm.controls[key].value ?? '').length;
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
