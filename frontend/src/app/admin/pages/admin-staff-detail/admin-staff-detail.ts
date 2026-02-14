import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import {
  AdminAvailabilityItem,
  AdminInstituteApiService,
  AdminStaffItem,
  AdminStaffServiceItem
} from '../../../core/services/admin-institute-api.service';
import { AdminServicesApiService, AdminServiceItem } from '../../../core/services/admin-services-api.service';
import { PASTEL_COLOR_OPTIONS } from '../../shared/pastel-colors';

type TabKey = 'info' | 'services' | 'availability';

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
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly tab = signal<TabKey>('info');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');

  protected readonly staff = signal<AdminStaffItem | null>(null);
  protected readonly allServices = signal<AdminServiceItem[]>([]);
  protected readonly staffServices = signal<AdminStaffServiceItem[]>([]);
  protected readonly availability = signal<AdminAvailabilityItem[]>([]);
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;

  protected readonly infoForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
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
    this.saving.set(true);
    this.successMessage.set('');

    this.api
      .updateStaff(member.id, {
        name: raw.name.trim(),
        email: raw.email.trim().toLowerCase(),
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
      firstValueFrom(this.api.listAvailability(staffId))
    ])
      .then(([staff, services, staffServices, availability]) => {
        const member = (staff ?? []).find((item) => item.id === staffId) ?? null;
        this.staff.set(member);
        this.allServices.set(services ?? []);
        this.staffServices.set(staffServices ?? []);
        this.availability.set(availability ?? []);

        if (member) {
          this.infoForm.reset({
            name: member.name,
            email: member.email,
            active: member.active,
            isTrainee: member.isTrainee,
            colorHex: member.colorHex,
            defaultDiscountPercent: member.defaultDiscountPercent ?? 20
          });
        }

        this.patchDayRows();
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

  private setSuccess(message: string): void {
    this.successMessage.set(message);
    if (this.successTimer) {
      clearTimeout(this.successTimer);
    }
    this.successTimer = setTimeout(() => this.successMessage.set(''), 2800);
  }
}
