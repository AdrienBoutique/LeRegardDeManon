import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import {
  AdminAvailabilityItem,
  AdminInstituteApiService,
  AvailabilityMode,
  CustomWorkingDayItem,
  AdminStaffItem,
  AdminStaffServiceItem,
  StaffPlanningSettings
} from '../../../core/services/admin-institute-api.service';
import { AdminServicesApiService, AdminServiceItem } from '../../../core/services/admin-services-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { PASTEL_COLOR_OPTIONS } from '../../shared/pastel-colors';

type TabKey = 'info' | 'services' | 'availability';

type CustomDayDraft = {
  date: string;
  isClosed: boolean;
  slots: Array<{ startTime: string; endTime: string }>;
};

type DayRow = {
  weekday: number;
  label: string;
  id: string | null;
  off: boolean;
  startTime: string;
  endTime: string;
};

const DAYS: Array<{ weekday: number; label: string }> = [
  { weekday: 0, label: 'Dimanche' },
  { weekday: 1, label: 'Lundi' },
  { weekday: 2, label: 'Mardi' },
  { weekday: 3, label: 'Mercredi' },
  { weekday: 4, label: 'Jeudi' },
  { weekday: 5, label: 'Vendredi' },
  { weekday: 6, label: 'Samedi' }
];

@Component({
  selector: 'app-admin-staff-detail',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-staff-detail.html',
  styleUrl: './admin-staff-detail.scss'
})
export class AdminStaffDetail {
  private readonly api = inject(AdminInstituteApiService);
  private readonly servicesApi = inject(AdminServicesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private successTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly roleOwnerEmail = 'contact@leregarddemanon.com';

  protected readonly tab = signal<TabKey>('info');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly pendingDangerAction = signal<'delete' | 'deactivate' | null>(null);

  protected readonly staff = signal<AdminStaffItem | null>(null);
  protected readonly allServices = signal<AdminServiceItem[]>([]);
  protected readonly staffServices = signal<AdminStaffServiceItem[]>([]);
  protected readonly availability = signal<AdminAvailabilityItem[]>([]);
  protected readonly planningSettings = signal<StaffPlanningSettings | null>(null);
  protected readonly customDays = signal<CustomWorkingDayItem[]>([]);
  protected readonly customDaysLoading = signal(false);
  protected readonly customDaysSaving = signal(false);
  protected readonly customDaysError = signal('');
  protected readonly customDaysSuccess = signal('');
  protected readonly customDayDraft = signal<CustomDayDraft>({
    date: '',
    isClosed: false,
    slots: [{ startTime: '09:00', endTime: '12:00' }]
  });
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;

  protected readonly infoForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.email]],
    active: [true],
    isTrainee: [false],
    colorHex: ['#8C6A52'],
    defaultDiscountPercent: [20]
  });

  protected readonly dayRows = signal<DayRow[]>(
    DAYS.map((day) => ({
      ...day,
      id: null,
      off: true,
      startTime: '09:00',
      endTime: '18:00'
    }))
  );
  protected readonly planningMode = computed<AvailabilityMode>(() => this.planningSettings()?.availabilityMode ?? 'WEEKLY');
  protected readonly customDaysSorted = computed(() =>
    [...this.customDays()].sort((a, b) => a.date.localeCompare(b.date))
  );

  protected readonly serviceRows = computed(() => {
    const assignments = new Map(this.staffServices().map((link) => [link.serviceId, link]));

    return this.allServices()
      .filter((service) => service.active)
      .map((service) => {
        const assignment = assignments.get(service.id);
        const fixedPriceEur = assignment?.priceCentsOverride !== null && assignment?.priceCentsOverride !== undefined
          ? assignment.priceCentsOverride / 100
          : null;
        const discountPercent = assignment?.discountPercentOverride ?? null;
        const hasTraineeDiscount = discountPercent !== null;

        const finalPriceCents = fixedPriceEur !== null
          ? Math.round(fixedPriceEur * 100)
          : discountPercent !== null
            ? Math.max(0, Math.round(service.priceCents * (1 - discountPercent / 100)))
            : service.priceCents;

        return {
          service,
          assignment,
          enabled: Boolean(assignment),
          fixedPriceEur,
          discountPercent,
          hasTraineeDiscount,
          finalPriceCents
        };
      });
  });
  protected readonly allServicesSelected = computed(() => {
    const rows = this.serviceRows();
    return rows.length > 0 && rows.every((row) => row.enabled);
  });
  protected readonly canManageRoles = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.email?.toLowerCase() === this.roleOwnerEmail;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.successTimer) {
        clearTimeout(this.successTimer);
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.errorMessage.set('Praticienne introuvable.');
      return;
    }

    this.load(id);
  }

  protected setTab(tab: TabKey): void {
    this.tab.set(tab);
  }

  protected saveInfo(): void {
    const member = this.staff();
    if (!member || this.infoForm.invalid || this.saving()) {
      this.infoForm.markAllAsTouched();
      return;
    }

    const raw = this.infoForm.getRawValue();
    const email = raw.email.trim().toLowerCase();

    if (member.hasAccount && !email) {
      this.errorMessage.set("L'email est obligatoire pour une praticienne avec acces planning.");
      return;
    }

    this.saving.set(true);
    this.successMessage.set('');

    this.api
      .updateStaff(member.id, {
        name: raw.name.trim(),
        ...(email ? { email } : {}),
        active: raw.active,
        isTrainee: raw.isTrainee,
        colorHex: raw.colorHex,
        defaultDiscountPercent: raw.isTrainee ? Number(raw.defaultDiscountPercent) : null
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.staff.set(updated);
          this.errorMessage.set('');
          this.setSuccess('Modifications enregistrees.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.successMessage.set('');
          this.errorMessage.set(error.error?.error ?? 'Mise a jour impossible.');
        }
      });
  }

  protected requestDelete(): void {
    this.pendingDangerAction.set('delete');
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  protected requestDeactivate(): void {
    this.pendingDangerAction.set('deactivate');
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  protected cancelDangerAction(): void {
    this.pendingDangerAction.set(null);
  }

  protected deleteStaff(): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.api
      .deleteStaff(member.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: async () => {
          this.pendingDangerAction.set(null);
          await this.router.navigate(['/admin/staff']);
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Suppression impossible.');
        }
      });
  }

  protected deactivateStaff(): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.api
      .updateStaff(member.id, { active: false })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.staff.set(updated);
          this.pendingDangerAction.set(null);
          this.errorMessage.set('');
          this.setSuccess('Praticienne desactivee.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Desactivation impossible.');
        }
      });
  }

  protected updateAdminRole(role: 'ADMIN' | 'STAFF'): void {
    const member = this.staff();
    if (!member || this.saving() || !member.hasAccount || member.userRole === role) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.api
      .updateStaffRole(member.id, role)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.staff.update((current) =>
            current
              ? {
                  ...current,
                  hasAccount: Boolean(updated.hasAccount),
                  userRole: updated.userRole ?? current.userRole ?? role
                }
              : current
          );
          this.setSuccess(role === 'ADMIN' ? 'Compte promu administrateur.' : 'Droits administrateur retires.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour du role impossible.');
        }
      });
  }

  protected toggleService(serviceId: string, enabled: boolean): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    const current = this.staffServices().find((link) => link.serviceId === serviceId);

    if (enabled && !current) {
      this.saving.set(true);
      this.api
        .assignService(member.id, { serviceId })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => this.refreshAssignments(member.id),
          error: (error: { error?: { error?: string } }) => {
            this.errorMessage.set(error.error?.error ?? 'Assignation impossible.');
          }
        });
      return;
    }

    if (!enabled && current) {
      this.saving.set(true);
      this.api
        .deleteServiceAssignment(current.id)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => this.refreshAssignments(member.id),
          error: () => {
            this.errorMessage.set('Suppression impossible.');
          }
        });
    }
  }

  protected selectAllServices(): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    const missing = this.serviceRows()
      .filter((row) => !row.enabled)
      .map((row) => row.service.id);

    if (missing.length === 0) {
      return;
    }

    this.saving.set(true);
    Promise.all(missing.map((serviceId) => firstValueFrom(this.api.assignService(member.id, { serviceId }))))
      .then(() => {
        this.refreshAssignments(member.id);
        this.errorMessage.set('');
        this.setSuccess('Tous les soins ont ete selectionnes.');
      })
      .catch((error: { error?: { error?: string } }) => {
        this.errorMessage.set(error?.error?.error ?? 'Selection globale impossible.');
      })
      .finally(() => this.saving.set(false));
  }

  protected saveServicePricing(serviceId: string, fixedPrice: string, useTraineeDiscount: boolean): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    const current = this.staffServices().find((link) => link.serviceId === serviceId);
    if (!current) {
      return;
    }

    const fixed = fixedPrice.trim().length ? Number(fixedPrice) : null;
    const traineeDiscount =
      useTraineeDiscount && member.isTrainee && member.defaultDiscountPercent !== null
        ? member.defaultDiscountPercent
        : null;

    this.saving.set(true);
    this.api
      .updateServiceAssignment(current.id, {
        priceCentsOverride: fixed !== null && !Number.isNaN(fixed) ? Math.round(fixed * 100) : null,
        discountPercentOverride: fixed !== null && !Number.isNaN(fixed) ? null : traineeDiscount
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => this.refreshAssignments(member.id),
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour prix impossible.');
        }
      });
  }

  protected updateDayRow(weekday: number, patch: Partial<DayRow>): void {
    this.dayRows.update((rows) => rows.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)));
  }

  protected saveAvailability(): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    const operations: Array<Promise<unknown>> = [];

    for (const row of this.dayRows()) {
      if (row.off) {
        if (row.id) {
          operations.push(firstValueFrom(this.api.deleteAvailability(row.id)));
        }
        continue;
      }

      if (row.id) {
        operations.push(
          firstValueFrom(
            this.api.updateAvailabilityRule(row.id, {
              startTime: row.startTime,
              endTime: row.endTime,
              weekday: row.weekday
            })
          )
        );
      } else {
        operations.push(
          firstValueFrom(
            this.api.createAvailability(member.id, {
              weekday: row.weekday,
              startTime: row.startTime,
              endTime: row.endTime
            })
          )
        );
      }
    }

    this.saving.set(true);
    Promise.all(operations)
      .then(() => this.refreshAvailability(member.id))
      .catch(() => this.errorMessage.set('Mise a jour horaires impossible.'))
      .finally(() => this.saving.set(false));
  }

  protected setPlanningMode(mode: AvailabilityMode): void {
    const member = this.staff();
    if (!member || this.saving()) {
      return;
    }

    if (this.planningMode() === mode) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.api
      .updateStaffPlanningSettings(member.id, { availabilityMode: mode })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (settings) => {
          this.planningSettings.set(settings);
          this.errorMessage.set('');
          this.setSuccess(mode === 'CUSTOM_DAYS' ? 'Mode de planning passe en jours personnalises.' : 'Mode de planning passe en horaires hebdomadaires.');
          if (mode === 'CUSTOM_DAYS') {
            this.refreshCustomDays(member.id);
          }
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Mise a jour du mode de planning impossible.');
        }
      });
  }

  protected addCustomDraftSlot(): void {
    this.customDayDraft.update((draft) => ({
      ...draft,
      slots: [...draft.slots, { startTime: '09:00', endTime: '12:00' }]
    }));
  }

  protected removeCustomDraftSlot(index: number): void {
    this.customDayDraft.update((draft) => ({
      ...draft,
      slots: draft.slots.filter((_, slotIndex) => slotIndex !== index)
    }));
  }

  protected updateCustomDraftSlot(index: number, key: 'startTime' | 'endTime', value: string): void {
    this.customDayDraft.update((draft) => ({
      ...draft,
      slots: draft.slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [key]: value } : slot))
    }));
  }

  protected setCustomDraftDate(value: string): void {
    this.customDayDraft.update((draft) => ({ ...draft, date: value }));
  }

  protected setCustomDraftClosed(value: boolean): void {
    this.customDayDraft.update((draft) => ({ ...draft, isClosed: value }));
  }

  protected editCustomDay(day: CustomWorkingDayItem): void {
    this.customDayDraft.set({
      date: day.date,
      isClosed: day.isClosed,
      slots: day.slots.length > 0 ? day.slots.map((slot) => ({ startTime: slot.startTime, endTime: slot.endTime })) : [{ startTime: '09:00', endTime: '12:00' }]
    });
  }

  protected startNewCustomDay(): void {
    this.customDayDraft.set({
      date: this.toYmd(new Date()),
      isClosed: false,
      slots: [{ startTime: '09:00', endTime: '12:00' }, { startTime: '14:00', endTime: '18:00' }]
    });
  }

  protected saveCustomDay(): void {
    const member = this.staff();
    if (!member || this.customDaysSaving()) {
      return;
    }

    const draft = this.customDayDraft();
    const validationError = this.validateCustomDayDraft(draft);
    if (validationError) {
      this.customDaysError.set(validationError);
      return;
    }

    this.customDaysSaving.set(true);
    this.customDaysError.set('');
    this.api
      .upsertCustomWorkingDay(member.id, draft.date, {
        isClosed: draft.isClosed,
        slots: draft.isClosed ? [] : draft.slots
      })
      .pipe(finalize(() => this.customDaysSaving.set(false)))
      .subscribe({
        next: () => {
          this.refreshCustomDays(member.id);
          this.customDaysSuccess.set('Jour personnalise enregistre.');
          this.setSuccess('');
        },
        error: (error: { error?: { error?: string } }) => {
          this.customDaysError.set(error.error?.error ?? 'Sauvegarde du jour personnalise impossible.');
        }
      });
  }

  protected deleteCustomDay(day: CustomWorkingDayItem): void {
    const member = this.staff();
    if (!member || this.customDaysSaving()) {
      return;
    }

    this.customDaysSaving.set(true);
    this.customDaysError.set('');
    this.api
      .deleteCustomWorkingDay(member.id, day.date)
      .pipe(finalize(() => this.customDaysSaving.set(false)))
      .subscribe({
        next: () => {
          this.refreshCustomDays(member.id);
          this.customDaysSuccess.set('Jour personnalise supprime.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.customDaysError.set(error.error?.error ?? 'Suppression impossible.');
        }
      });
  }

  protected deleteCustomSlot(day: CustomWorkingDayItem, slotId: string): void {
    const member = this.staff();
    if (!member || this.customDaysSaving()) {
      return;
    }

    this.customDaysSaving.set(true);
    this.customDaysError.set('');
    this.api
      .deleteCustomWorkingDaySlot(member.id, day.date, slotId)
      .pipe(finalize(() => this.customDaysSaving.set(false)))
      .subscribe({
        next: () => this.refreshCustomDays(member.id),
        error: (error: { error?: { error?: string } }) => {
          this.customDaysError.set(error.error?.error ?? 'Suppression de plage impossible.');
        }
      });
  }

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2
    }).format(priceCents / 100);
  }

  protected previewFinalPriceCents(basePriceCents: number, fixedPriceRaw: string, useTraineeDiscount: boolean): number {
    const member = this.staff();
    const fixed = fixedPriceRaw.trim().length ? Number(fixedPriceRaw) : null;

    if (fixed !== null && !Number.isNaN(fixed)) {
      return Math.max(0, Math.round(fixed * 100));
    }

    if (useTraineeDiscount && member?.isTrainee && member.defaultDiscountPercent !== null) {
      return Math.max(0, Math.round(basePriceCents * (1 - member.defaultDiscountPercent / 100)));
    }

    return basePriceCents;
  }

  protected hasColorOption(hex: string | null | undefined): boolean {
    if (!hex) {
      return false;
    }

    return this.colorOptions.some((option) => option.hex.toUpperCase() === hex.toUpperCase());
  }

  private load(staffId: string): void {
    this.loading.set(true);

    Promise.all([
      firstValueFrom(this.api.listStaff()),
      firstValueFrom(this.servicesApi.list()),
      firstValueFrom(this.api.listStaffServices(staffId)),
      firstValueFrom(this.api.listAvailability(staffId)),
      firstValueFrom(this.api.getStaffPlanningSettings(staffId)).catch(() => null),
      firstValueFrom(this.api.listCustomWorkingDays(staffId, this.getMonthStartYmd(), this.getMonthEndYmd())).catch(() => ({
        staffId,
        start: this.getMonthStartYmd(),
        end: this.getMonthEndYmd(),
        days: []
      }))
    ])
      .then(([staff, services, staffServices, availability, settings, customDays]) => {
        const member = (staff ?? []).find((item) => item.id === staffId) ?? null;
        this.staff.set(member);
        this.allServices.set(services ?? []);
        this.staffServices.set(staffServices ?? []);
        this.availability.set(availability ?? []);
        this.planningSettings.set(settings ?? null);
        this.customDays.set(customDays?.days ?? []);

        if (member) {
          this.infoForm.reset({
            name: member.name,
            email: member.email ?? '',
            active: member.active,
            isTrainee: member.isTrainee,
            colorHex: member.colorHex,
            defaultDiscountPercent: member.defaultDiscountPercent ?? 20
          });
        }

        this.patchDayRows();
        if (this.customDays().length > 0) {
          const first = this.customDaysSorted()[0];
          if (first) {
            this.editCustomDay(first);
          }
        } else {
          this.startNewCustomDay();
        }
        this.errorMessage.set(member ? '' : 'Praticienne introuvable.');
      })
      .catch(() => this.errorMessage.set('Chargement impossible.'))
      .finally(() => this.loading.set(false));
  }

  private patchDayRows(): void {
    const byDay = new Map<number, AdminAvailabilityItem[]>();
    for (const rule of this.availability()) {
      if (rule.off) {
        continue;
      }
      const dayRules = byDay.get(rule.weekday) ?? [];
      dayRules.push(rule);
      byDay.set(rule.weekday, dayRules);
    }

    const rows: DayRow[] = DAYS.map((day) => {
      const rules = byDay.get(day.weekday) ?? [];
      const first = rules[0];
      return {
        weekday: day.weekday,
        label: day.label,
        id: first?.id ?? null,
        off: !first,
        startTime: first?.startTime ?? '09:00',
        endTime: first?.endTime ?? '18:00'
      };
    });

    this.dayRows.set(rows);
  }

  private refreshAssignments(staffId: string): void {
    this.api.listStaffServices(staffId).subscribe({
      next: (items) => (this.staffServices.set(items), this.errorMessage.set('')),
      error: () => this.errorMessage.set('Chargement des assignations impossible.')
    });
  }

  private refreshAvailability(staffId: string): void {
    this.api.listAvailability(staffId).subscribe({
      next: (items) => {
        this.availability.set(items);
        this.patchDayRows();
        this.errorMessage.set('');
      },
      error: () => this.errorMessage.set('Chargement des horaires impossible.')
    });
  }

  private refreshCustomDays(staffId: string): void {
    this.api.listCustomWorkingDays(staffId, this.getMonthStartYmd(), this.getMonthEndYmd()).subscribe({
      next: (response) => {
        this.customDays.set(response.days ?? []);
        this.customDaysError.set('');
        if (this.customDays().length > 0) {
          const first = this.customDaysSorted()[0];
          if (first) {
            this.editCustomDay(first);
          }
        } else {
          this.startNewCustomDay();
        }
      },
      error: () => this.customDaysError.set('Chargement des jours personnalises impossible.')
    });
  }

  private getMonthStartYmd(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private getMonthEndYmd(): string {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return this.toYmd(end);
  }

  private validateCustomDayDraft(draft: CustomDayDraft): string | null {
    if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      return 'Veuillez choisir une date valide.';
    }

    if (draft.isClosed) {
      return null;
    }

    if (draft.slots.length === 0) {
      return 'Ajoutez au moins une plage horaire.';
    }

    const sorted = [...draft.slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (!/^\d{2}:\d{2}$/.test(current.startTime) || !/^\d{2}:\d{2}$/.test(current.endTime)) {
        return 'Format horaire invalide.';
      }
      if (current.startTime >= current.endTime) {
        return 'Une plage doit finir apres son debut.';
      }
      const previous = sorted[index - 1];
      if (previous && current.startTime < previous.endTime) {
        return 'Les plages horaires ne doivent pas se chevaucher.';
      }
    }

    return null;
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private setSuccess(message: string): void {
    this.successMessage.set(message);
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    this.successTimer = setTimeout(() => this.successMessage.set(''), 2800);
  }
}
