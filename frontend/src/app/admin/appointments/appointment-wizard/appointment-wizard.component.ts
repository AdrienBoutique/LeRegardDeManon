import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, finalize, of, switchMap } from 'rxjs';
import { AdminServicesApiService } from '../../../core/services/admin-services-api.service';
import { AppointmentsApiService } from '../appointments-api.service';
import {
  Appointment,
  AppointmentDraft,
  AppointmentServiceItem,
  AppointmentUpsertPayload,
  ClientLite
} from '../appointment.models';
import { AppointmentUiService } from '../appointment-ui.service';

@Component({
  selector: 'app-appointment-wizard',
  imports: [CommonModule, FormsModule],
  templateUrl: './appointment-wizard.component.html',
  styleUrl: './appointment-wizard.component.scss'
})
export class AppointmentWizardComponent {
  private readonly ui = inject(AppointmentUiService);
  private readonly servicesApi = inject(AdminServicesApiService);
  private readonly appointmentsApi = inject(AppointmentsApiService);
  private readonly conflictTrigger$ = new Subject<void>();

  protected readonly step = signal(1);
  protected readonly mode = signal<'create' | 'edit'>('create');
  protected readonly draft = signal<AppointmentDraft>(this.emptyDraft());
  protected readonly editingId = signal<string | null>(null);
  protected readonly practitioners = signal<Array<{ id: string; name: string }>>([]);
  protected readonly clients = signal<ClientLite[]>([]);
  protected readonly services = signal<AppointmentServiceItem[]>([]);
  protected readonly clientMode = signal<'existing' | 'new'>('existing');
  protected readonly clientQuery = signal('');
  protected readonly conflict = signal<{ conflict: boolean; conflictWith?: Appointment } | null>(null);
  protected readonly conflictLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly filteredClients = computed(() => {
    const query = this.clientQuery().trim().toLowerCase();
    if (!query) {
      return this.clients();
    }

    return this.clients().filter((client) =>
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(query)
    );
  });

  protected readonly canGoStep2 = computed(() => {
    const draft = this.draft();
    return Boolean(draft.practitionerId && draft.startAt && draft.durationMin > 0 && !this.conflict()?.conflict);
  });

  protected readonly canGoStep3 = computed(() => this.draft().services.length > 0);

  protected readonly canGoStep4 = computed(() => {
    const draft = this.draft();
    return this.hasClientInput(draft);
  });

  protected readonly canSubmit = computed(() => {
    return this.canGoStep2() && this.canGoStep3() && this.canGoStep4() && !this.conflict()?.conflict;
  });

  constructor() {
    this.ui.mode$.pipe(takeUntilDestroyed()).subscribe((value) => this.mode.set(value));
    this.ui.editingId$.pipe(takeUntilDestroyed()).subscribe((value) => this.editingId.set(value));
    this.ui.draft$.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.draft.set({
        ...value,
        services: value.services ?? [],
        clientDraft: value.clientDraft ?? { firstName: '', lastName: '', phone: '', email: '' }
      });
      this.clientMode.set(value.clientId ? 'existing' : 'new');
      this.errorMessage.set('');
      this.step.set(1);
      this.triggerConflictCheck();
    });

    this.ui.practitioners$.pipe(takeUntilDestroyed()).subscribe((value) => this.practitioners.set(value));
    this.ui.clients$.pipe(takeUntilDestroyed()).subscribe((value) => this.clients.set(value));
    this.ui.servicesCatalog$.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value.length) {
        this.services.set(value);
      }
    });

    this.servicesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe((items) => {
        if (this.services().length > 0) {
          return;
        }

        this.services.set(
          items
            .filter((item) => item.active)
            .map((item) => ({
              serviceId: item.id,
              name: item.name,
              durationMin: item.durationMin,
              price: item.priceCents / 100
            }))
        );
      });

    this.conflictTrigger$
      .pipe(
        debounceTime(300),
        switchMap(() => {
          const draft = this.draft();
          if (!draft.practitionerId || !draft.startAt || !draft.durationMin) {
            this.conflict.set(null);
            return of(null);
          }

          this.conflictLoading.set(true);
          return this.appointmentsApi
            .checkConflict(draft.practitionerId, draft.startAt, draft.durationMin, this.editingId() ?? undefined)
            .pipe(finalize(() => this.conflictLoading.set(false)));
        }),
        takeUntilDestroyed()
      )
      .subscribe((result) => {
        if (!result) {
          return;
        }
        this.conflict.set(result);
      });
  }

  protected close(): void {
    this.ui.close();
  }

  protected goToStep(step: number): void {
    if (step < 1 || step > 4) {
      return;
    }

    if (step === 2 && !this.canGoStep2()) {
      return;
    }
    if (step === 3 && !this.canGoStep3()) {
      return;
    }
    if (step === 4 && !this.canGoStep4()) {
      return;
    }

    this.step.set(step);
  }

  protected nextStep(): void {
    this.goToStep(this.step() + 1);
  }

  protected previousStep(): void {
    this.goToStep(this.step() - 1);
  }

  protected setPractitioner(practitionerId: string): void {
    this.ui.setPartial({ practitionerId: practitionerId || undefined });
    this.triggerConflictCheck();
  }

  protected setStartAt(startAt: string): void {
    this.ui.setPartial({ startAt: startAt || undefined });
    this.triggerConflictCheck();
  }

  protected toggleService(item: AppointmentServiceItem): void {
    const current = this.draft().services;
    const exists = current.some((service) => service.serviceId === item.serviceId);
    const nextServices = exists
      ? current.filter((service) => service.serviceId !== item.serviceId)
      : [...current, item];

    this.ui.setPartial({
      services: nextServices
    });
    this.triggerConflictCheck();
  }

  protected isServiceSelected(serviceId: string): boolean {
    return this.draft().services.some((item) => item.serviceId === serviceId);
  }

  protected switchClientMode(mode: 'existing' | 'new'): void {
    this.clientMode.set(mode);
    if (mode === 'new') {
      this.ui.setPartial({ clientId: undefined });
    }
  }

  protected chooseClient(client: ClientLite): void {
    this.ui.setPartial({
      clientId: client.id,
      clientDraft: {
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email
      }
    });
  }

  protected updateClientDraft(field: 'firstName' | 'lastName' | 'phone' | 'email', value: string): void {
    const current = this.draft().clientDraft ?? { firstName: '', lastName: '', phone: '', email: '' };
    const next = {
      ...current,
      [field]: value
    };
    this.ui.setPartial({ clientDraft: next, clientId: undefined });
  }

  protected updateStatus(value: AppointmentDraft['status']): void {
    this.ui.setPartial({ status: value });
  }

  protected updateNotes(value: string): void {
    this.ui.setPartial({ notes: value });
  }

  protected startAtInputValue(): string {
    const raw = this.draft().startAt;
    if (!raw) {
      return '';
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  protected formatMoney(value: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  }

  protected save(): void {
    if (!this.canSubmit()) {
      this.errorMessage.set('Completez les champs requis avant de valider.');
      return;
    }

    const draft = this.draft();
    const payload = this.toPayload(draft);
    if (!payload) {
      this.errorMessage.set('Donnees invalides.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const request$ =
      this.mode() === 'create'
        ? this.appointmentsApi.createAppointment(payload)
        : this.appointmentsApi.updateAppointment(this.editingId() ?? '', payload);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.ui.notifySaved();
        this.ui.close();
      },
      error: () => {
        this.errorMessage.set("Impossible d'enregistrer le rendez-vous.");
      }
    });
  }

  private triggerConflictCheck(): void {
    this.conflictTrigger$.next();
  }

  private hasClientInput(draft: AppointmentDraft): boolean {
    if (draft.clientId) {
      return true;
    }

    return Boolean(draft.clientDraft?.firstName?.trim() && draft.clientDraft?.lastName?.trim());
  }

  private toPayload(draft: AppointmentDraft): AppointmentUpsertPayload | null {
    if (!draft.practitionerId || !draft.startAt || !draft.durationMin || draft.services.length === 0) {
      return null;
    }

    const parsedStartAt = new Date(draft.startAt);
    if (Number.isNaN(parsedStartAt.getTime())) {
      return null;
    }

    const clientDraft = draft.clientDraft;
    if (!draft.clientId && (!clientDraft?.firstName?.trim() || !clientDraft.lastName?.trim())) {
      return null;
    }

    return {
      practitionerId: draft.practitionerId,
      startAt: parsedStartAt.toISOString(),
      durationMin: draft.durationMin,
      services: draft.services,
      clientId: draft.clientId,
      clientDraft: clientDraft,
      notes: draft.notes,
      status: draft.status
    };
  }

  private emptyDraft(): AppointmentDraft {
    return {
      services: [],
      durationMin: 30,
      priceTotal: 0,
      status: 'confirmed'
    };
  }
}
