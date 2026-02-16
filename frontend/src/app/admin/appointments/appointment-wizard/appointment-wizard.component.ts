import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, finalize, of, switchMap } from 'rxjs';
import { AdminInstituteApiService } from '../../../core/services/admin-institute-api.service';
import { AdminServicesApiService } from '../../../core/services/admin-services-api.service';
import { AppointmentsApiService } from '../appointments-api.service';
import {
  AvailabilityRuleLite,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly instituteApi = inject(AdminInstituteApiService);
  private readonly servicesApi = inject(AdminServicesApiService);
  private readonly appointmentsApi = inject(AppointmentsApiService);
  private readonly conflictTrigger$ = new Subject<void>();
  private wasOpen = false;

  protected readonly step = signal(1);
  protected readonly mode = signal<'create' | 'edit'>('create');
  protected readonly draft = signal<AppointmentDraft>(this.emptyDraft());
  protected readonly editingId = signal<string | null>(null);
  protected readonly practitioners = signal<Array<{ id: string; name: string }>>([]);
  protected readonly clients = signal<ClientLite[]>([]);
  protected readonly appointments = signal<Appointment[]>([]);
  protected readonly services = signal<AppointmentServiceItem[]>([]);
  protected readonly staffAvailability = signal<AvailabilityRuleLite[]>([]);
  protected readonly instituteAvailability = signal<AvailabilityRuleLite[]>([]);
  protected readonly serviceQuery = signal('');
  protected readonly clientMode = signal<'existing' | 'new'>('existing');
  protected readonly clientQuery = signal('');
  protected readonly conflict = signal<{ conflict: boolean; conflictWith?: Appointment } | null>(null);
  protected readonly conflictLoading = signal(false);
  protected readonly loadingStaffServices = signal(false);
  protected readonly staffServiceIds = signal<Set<string> | null>(null);
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

  protected readonly filteredServices = computed(() => {
    const query = this.serviceQuery().trim().toLowerCase();
    const allowed = this.staffServiceIds();
    const practitionerId = this.draft().practitionerId;

    const byStaff = this.services().filter((item) => {
      if (!practitionerId) {
        return true;
      }
      if (!allowed) {
        return true;
      }
      return allowed.has(item.serviceId);
    });

    if (!query) {
      return byStaff;
    }

    return byStaff.filter((item) => item.name.toLowerCase().includes(query));
  });

  protected readonly canGoStep2 = computed(() => {
    const draft = this.draft();
    return Boolean(draft.practitionerId && draft.startAt && !this.conflict()?.conflict && !this.conflictLoading());
  });

  protected readonly maxAvailableDurationMin = computed(() => this.computeMaxAvailableDurationMin());

  protected readonly selectionFitsAvailability = computed(() => {
    const max = this.maxAvailableDurationMin();
    if (max === null) {
      return true;
    }
    return this.draft().durationMin <= max;
  });
  protected readonly canGoStep3 = computed(() => this.draft().services.length > 0 && this.selectionFitsAvailability());

  protected readonly canGoStep4 = computed(() => {
    const draft = this.draft();
    return this.hasClientInput(draft) && this.hasContactInput(draft);
  });

  protected readonly canSubmit = computed(() => {
    return this.canGoStep2() && this.canGoStep3() && this.canGoStep4() && !this.conflict()?.conflict && !this.conflictLoading();
  });

  constructor() {
    this.ui.isOpen$.pipe(takeUntilDestroyed()).subscribe((isOpen) => {
      if (isOpen && !this.wasOpen) {
        this.step.set(1);
        this.clientMode.set('existing');
        this.errorMessage.set('');
        this.serviceQuery.set('');
        this.clientQuery.set('');
      }
      this.wasOpen = isOpen;
    });

    this.ui.mode$.pipe(takeUntilDestroyed()).subscribe((value) => this.mode.set(value));
    this.ui.editingId$.pipe(takeUntilDestroyed()).subscribe((value) => this.editingId.set(value));
    this.ui.draft$.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.draft.set({
        ...value,
        services: value.services ?? [],
        clientDraft: value.clientDraft ?? { firstName: '', lastName: '', phone: '', email: '' }
      });
      this.loadServicesForPractitioner(value.practitionerId);
      this.triggerConflictCheck();
    });

    this.ui.practitioners$.pipe(takeUntilDestroyed()).subscribe((value) => this.practitioners.set(value));
    this.ui.clients$.pipe(takeUntilDestroyed()).subscribe((value) => this.clients.set(value));
    this.ui.appointments$.pipe(takeUntilDestroyed()).subscribe((value) => this.appointments.set(value));
    this.ui.staffAvailability$.pipe(takeUntilDestroyed()).subscribe((value) => this.staffAvailability.set(value));
    this.ui.instituteAvailability$.pipe(takeUntilDestroyed()).subscribe((value) => this.instituteAvailability.set(value));
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

    if (step === 3) {
      this.clientMode.set('existing');
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
    if (this.isServiceDisabled(item.serviceId)) {
      return;
    }

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

  protected isServiceDisabled(serviceId: string): boolean {
    if (this.isServiceSelected(serviceId)) {
      return false;
    }

    const item = this.services().find((service) => service.serviceId === serviceId);
    if (!item) {
      return false;
    }

    const max = this.maxAvailableDurationMin();
    if (max === null) {
      return false;
    }

    return this.draft().durationMin + item.durationMin > max;
  }

  protected switchClientMode(mode: 'existing' | 'new'): void {
    this.clientMode.set(mode);
    if (mode === 'new') {
      this.ui.setPartial({
        clientId: undefined,
        clientDraft: { firstName: '', lastName: '', phone: '', email: '' }
      });
    }
  }

  protected chooseClient(client: ClientLite): void {
    this.ui.setPartial({
      clientId: client.id,
      clientDraft: {
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone ?? '',
        email: client.email ?? ''
      }
    });
  }

  protected updateClientDraft(field: 'firstName' | 'lastName' | 'phone' | 'email', value: string): void {
    const current = this.draft().clientDraft ?? { firstName: '', lastName: '', phone: '', email: '' };
    const next = {
      ...current,
      [field]: value
    };
    this.ui.setPartial({
      clientDraft: next,
      clientId: this.clientMode() === 'new' ? undefined : this.draft().clientId
    });
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

  protected practitionerNameById(practitionerId?: string): string {
    if (!practitionerId) {
      return 'Non definie';
    }
    return this.practitioners().find((item) => item.id === practitionerId)?.name ?? practitionerId;
  }

  protected formatDateTime(value?: string): string {
    if (!value) {
      return 'Non definie';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  protected selectedServicesLabel(): string {
    if (!this.draft().services.length) {
      return 'Aucun';
    }
    return this.draft()
      .services.map((item) => item.name)
      .join(', ');
  }

  protected statusLabel(status: AppointmentDraft['status']): string {
    if (status === 'confirmed') {
      return 'Confirme';
    }
    if (status === 'pending') {
      return 'En attente';
    }
    return 'Bloque';
  }

  protected conflictLabel(): string {
    const conflict = this.conflict();
    if (!conflict?.conflictWith) {
      return 'Conflit detecte avec un autre rendez-vous.';
    }

    const start = new Date(conflict.conflictWith.startAt);
    const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(start);
    return `Conflit detecte (${hour}).`;
  }

  protected save(): void {
    const blockingReason = this.getSubmitBlockingReason();
    if (blockingReason) {
      this.errorMessage.set(blockingReason);
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
      error: (error) => {
        this.errorMessage.set(this.extractSaveErrorMessage(error));
      }
    });
  }

  private triggerConflictCheck(): void {
    const draft = this.draft();
    if (!draft.durationMin || draft.durationMin <= 0) {
      this.conflict.set(null);
      return;
    }
    this.conflictTrigger$.next();
  }

  private loadServicesForPractitioner(practitionerId?: string): void {
    if (!practitionerId) {
      this.staffServiceIds.set(null);
      return;
    }

    this.loadingStaffServices.set(true);
    this.instituteApi
      .listStaffServices(practitionerId)
      .pipe(
        finalize(() => this.loadingStaffServices.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (links) => {
          const allowed = new Set(links.filter((link) => link.serviceActive).map((link) => link.serviceId));
          this.staffServiceIds.set(allowed);

          const selected = this.draft().services;
          const nextServices = selected.filter((service) => allowed.has(service.serviceId));
          if (nextServices.length !== selected.length) {
            this.ui.setPartial({ services: nextServices });
            this.triggerConflictCheck();
          }
        },
        error: () => {
          this.staffServiceIds.set(null);
        }
      });
  }

  private hasClientInput(draft: AppointmentDraft): boolean {
    if (draft.clientId) {
      return true;
    }

    return Boolean(draft.clientDraft?.firstName?.trim() && draft.clientDraft?.lastName?.trim());
  }

  private hasContactInput(draft: AppointmentDraft): boolean {
    return Boolean(draft.clientDraft?.phone?.trim() || draft.clientDraft?.email?.trim());
  }

  private getSubmitBlockingReason(): string | null {
    const draft = this.draft();

    if (this.conflictLoading()) {
      return 'Verification de conflit en cours, veuillez patienter.';
    }
    if (!draft.practitionerId) {
      return 'Selectionnez une praticienne.';
    }
    if (!draft.startAt) {
      return 'Selectionnez une date et une heure.';
    }
    if (!draft.services.length) {
      return 'Selectionnez au moins un service.';
    }
    if (!draft.durationMin || draft.durationMin <= 0) {
      return 'La duree est calculee automatiquement depuis les services.';
    }
    if (!this.selectionFitsAvailability()) {
      const max = this.maxAvailableDurationMin();
      if (max !== null) {
        return `La duree totale depasse le temps disponible (${max} min).`;
      }
      return 'La duree totale depasse le temps disponible.';
    }
    if (this.conflict()?.conflict) {
      return this.conflictLabel();
    }
    if (!this.hasClientInput(draft)) {
      return 'Selectionnez une cliente existante ou renseignez nom et prenom.';
    }
    if (!this.hasContactInput(draft)) {
      return 'Renseignez au moins un telephone ou un email pour la cliente.';
    }
    return null;
  }

  private extractSaveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const api = error.error;
      const apiMessage =
        (typeof api === 'string' && api) ||
        (api && typeof api === 'object' && (
          api.message ||
          api.error ||
          api.detail ||
          api.title
        ));

      if (typeof apiMessage === 'string' && apiMessage.trim()) {
        return this.humanizeApiMessage(apiMessage);
      }

      if (error.status === 409) {
        return 'Conflit detecte: ce creneau est deja pris.';
      }
      if (error.status === 400) {
        return 'Donnees invalides. Verifiez les champs du rendez-vous.';
      }
      if (error.status === 401 || error.status === 403) {
        return "Vous n'avez pas les droits pour enregistrer ce rendez-vous.";
      }
      if (error.status >= 500) {
        return 'Erreur serveur. Reessayez dans quelques instants.';
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return this.humanizeApiMessage(error.message);
    }

    return "Impossible d'enregistrer le rendez-vous.";
  }

  private humanizeApiMessage(message: string): string {
    const normalized = message.trim().toLowerCase();
    if (normalized.includes('selected staff cannot perform all selected services')) {
      return 'La praticienne selectionnee ne peut pas realiser tous les services choisis. Modifiez la praticienne ou les soins.';
    }
    if (normalized.includes('cannot perform all selected services')) {
      return 'Ce membre du staff ne peut pas realiser tous les services choisis.';
    }
    if (normalized.includes('conflict')) {
      return 'Conflit detecte: ce creneau est deja pris.';
    }
    return message;
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
    if (!clientDraft?.phone?.trim() && !clientDraft?.email?.trim()) {
      return null;
    }

    return {
      practitionerId: draft.practitionerId,
      startAt: parsedStartAt.toISOString(),
      durationMin: draft.durationMin,
      services: draft.services,
      clientId: draft.clientId,
      clientDraft: {
        firstName: clientDraft?.firstName?.trim() ?? '',
        lastName: clientDraft?.lastName?.trim() ?? '',
        phone: clientDraft?.phone?.trim() || undefined,
        email: clientDraft?.email?.trim() || undefined
      },
      notes: draft.notes,
      status: draft.status
    };
  }

  private computeMaxAvailableDurationMin(): number | null {
    const draft = this.draft();
    if (!draft.practitionerId || !draft.startAt) {
      return null;
    }

    const start = new Date(draft.startAt);
    if (Number.isNaN(start.getTime())) {
      return null;
    }

    const byStaff = this.remainingMinutesFromRules(
      start,
      this.staffAvailability().filter((rule) => rule.staffId === draft.practitionerId)
    );
    const byInstitute = this.remainingMinutesFromRules(start, this.instituteAvailability());
    const byNextAppointment = this.remainingMinutesBeforeNextAppointment(start, draft.practitionerId, this.editingId() ?? undefined);

    const candidates = [byStaff, byInstitute, byNextAppointment].filter((value): value is number => value !== null);
    if (!candidates.length) {
      return null;
    }

    return Math.max(0, Math.min(...candidates));
  }

  private remainingMinutesFromRules(start: Date, rules: AvailabilityRuleLite[]): number | null {
    if (!rules.length) {
      return null;
    }

    const weekday = start.getDay();
    const dayRules = rules.filter((rule) => rule.weekday === weekday);
    if (!dayRules.length) {
      return 0;
    }

    const startMinute = start.getHours() * 60 + start.getMinutes();
    const candidates = dayRules
      .map((rule) => {
        const startRuleMin = this.timeToMinutes(rule.startTime);
        const endRuleMin = this.timeToMinutes(rule.endTime);
        if (startMinute < startRuleMin || startMinute >= endRuleMin) {
          return null;
        }
        return Math.max(0, endRuleMin - startMinute);
      })
      .filter((value): value is number => value !== null);

    if (!candidates.length) {
      return 0;
    }

    return Math.max(...candidates);
  }

  private remainingMinutesBeforeNextAppointment(start: Date, practitionerId: string, excludeId?: string): number | null {
    const startMs = start.getTime();
    const nextStartOffsets: number[] = [];

    for (const item of this.appointments()) {
      if (item.practitionerId !== practitionerId) {
        continue;
      }
      if (excludeId && item.id === excludeId) {
        continue;
      }

      const itemStart = new Date(item.startAt).getTime();
      const itemEnd = itemStart + item.durationMin * 60_000;
      if (Number.isNaN(itemStart) || Number.isNaN(itemEnd)) {
        continue;
      }

      if (startMs >= itemStart && startMs < itemEnd) {
        return 0;
      }
      if (itemStart > startMs) {
        nextStartOffsets.push(Math.floor((itemStart - startMs) / 60_000));
      }
    }

    if (!nextStartOffsets.length) {
      return null;
    }

    return Math.max(0, Math.min(...nextStartOffsets));
  }

  private timeToMinutes(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private emptyDraft(): AppointmentDraft {
    return {
      services: [],
      durationMin: 0,
      priceTotal: 0,
      status: 'confirmed'
    };
  }
}
