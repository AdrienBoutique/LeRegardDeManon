import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AdminPractitionerItem,
  AdminPractitionersApiService,
  PractitionerStatsPeriod,
  PractitionerStatsResponse,
  PractitionerStatus
} from '../../../core/services/admin-practitioners-api.service';
import { PASTEL_COLOR_OPTIONS } from '../../shared/pastel-colors';

type StaffCardItem = {
  id: string;
  name: string;
  email: string;
  colorHex: string;
  defaultDiscountPercent: number | null;
  active: boolean;
  isTrainee: boolean;
  hasAccount: boolean;
};

@Component({
  selector: 'app-admin-staff-list',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-staff-list.html',
  styleUrl: './admin-staff-list.scss'
})
export class AdminStaffList {
  private readonly api = inject(AdminPractitionersApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly practitioners = signal<AdminPractitionerItem[]>([]);
  protected readonly pendingAction = signal<{ id: string; action: 'delete' | 'deactivate' } | null>(null);
  protected readonly createModalOpen = signal(false);
  protected readonly tempPassword = signal<string | null>(null);
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;
  protected readonly statsOpen = signal(false);
  protected readonly statsLoading = signal(false);
  protected readonly statsError = signal('');
  protected readonly statsPeriod = signal<PractitionerStatsPeriod>('month');
  protected readonly activeStatsPractitioner = signal<StaffCardItem | null>(null);
  protected readonly practitionerStats = signal<PractitionerStatsResponse | null>(null);

  protected readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.email]],
    active: [true],
    isTrainee: [false],
    accessPlanning: [true],
    colorHex: ['#8C6A52'],
    defaultDiscountPercent: [20]
  });

  protected readonly staff = computed<StaffCardItem[]>(() =>
    this.practitioners().map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      colorHex: member.colorHex,
      defaultDiscountPercent: member.defaultDiscount,
      active: member.status !== 'inactive',
      isTrainee: member.status === 'stagiaire',
      hasAccount: member.hasAccount
    }))
  );

  constructor() {
    this.fetchStaff();
  }

  protected fetchStaff(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api
      .listPractitioners()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.practitioners.set(items),
        error: () => this.errorMessage.set('Impossible de charger les praticiennes.')
      });
  }

  protected submitCreate(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const accessPlanning = raw.accessPlanning;
    const email = raw.email.trim().toLowerCase();
    const status: PractitionerStatus = raw.active
      ? raw.isTrainee
        ? 'stagiaire'
        : 'active'
      : 'inactive';
    const discount = Number(raw.defaultDiscountPercent);

    if (accessPlanning && !email) {
      this.errorMessage.set("L'email est obligatoire si l'acces planning est active.");
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');
    this.tempPassword.set(null);

    this.api
      .createPractitioner({
        name: raw.name.trim(),
        email: email || undefined,
        status,
        defaultDiscount: raw.isTrainee ? Math.min(100, Math.max(0, discount)) : null,
        colorHex: raw.colorHex,
        createAccount: accessPlanning
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (created) => {
          this.tempPassword.set(created.tempPassword);
          this.createForm.reset({
            name: '',
            email: '',
            active: true,
            isTrainee: false,
            accessPlanning: true,
            colorHex: '#8C6A52',
            defaultDiscountPercent: 20
          });
          this.fetchStaff();
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Creation impossible.');
        }
      });
  }

  protected deleteStaff(member: StaffCardItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .deletePractitioner(member.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.pendingAction.set(null);
          this.fetchStaff();
        },
        error: (error: { error?: { error?: string } }) =>
          this.errorMessage.set(error.error?.error ?? 'Suppression impossible.')
      });
  }

  protected deactivateStaff(member: StaffCardItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .updateStatus(member.id, 'inactive')
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.pendingAction.set(null);
          this.fetchStaff();
        },
        error: (error: { error?: { error?: string } }) =>
          this.errorMessage.set(error.error?.error ?? 'Desactivation impossible.')
      });
  }

  protected requestAction(memberId: string, action: 'delete' | 'deactivate'): void {
    this.pendingAction.set({ id: memberId, action });
  }

  protected cancelAction(): void {
    this.pendingAction.set(null);
  }

  protected openCreateModal(): void {
    this.createModalOpen.set(true);
    this.errorMessage.set('');
    this.tempPassword.set(null);
  }

  protected closeCreateModal(): void {
    this.createModalOpen.set(false);
    this.tempPassword.set(null);
  }

  protected openStats(member: StaffCardItem): void {
    this.activeStatsPractitioner.set(member);
    this.practitionerStats.set(null);
    this.statsError.set('');
    this.statsOpen.set(true);
    this.loadStats(member.id);
  }

  protected closeStats(): void {
    this.statsOpen.set(false);
    this.statsError.set('');
    this.practitionerStats.set(null);
  }

  protected setStatsPeriod(value: string): void {
    const period: PractitionerStatsPeriod = value === 'year' ? 'year' : value === 'quarter' ? 'quarter' : 'month';
    this.statsPeriod.set(period);
    const member = this.activeStatsPractitioner();
    if (member) {
      this.loadStats(member.id);
    }
  }

  protected formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value ?? 0);
  }

  protected formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-BE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(value ?? 0);
  }

  protected formatPercent(ratio: number | null): string {
    if (ratio === null || Number.isNaN(ratio)) {
      return '-';
    }
    return `${Math.round(ratio * 100)}%`;
  }

  protected formatDate(dateIso: string | null | undefined): string {
    if (!dateIso) {
      return '-';
    }
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  protected mapStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'CONFIRMED':
        return 'Confirme';
      case 'COMPLETED':
        return 'Termine';
      case 'CANCELLED':
        return 'Annule';
      case 'NO_SHOW':
        return 'Absence';
      case 'REJECTED':
        return 'Refuse';
      default:
        return status;
    }
  }

  protected hasColorOption(hex: string | null | undefined): boolean {
    if (!hex) {
      return false;
    }

    return this.colorOptions.some((option) => option.hex.toUpperCase() === hex.toUpperCase());
  }

  protected copyTempPassword(): void {
    const password = this.tempPassword();
    if (!password || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(password).catch(() => undefined);
  }

  private loadStats(practitionerId: string): void {
    this.statsLoading.set(true);
    this.statsError.set('');

    this.api
      .getStats(practitionerId, this.statsPeriod())
      .pipe(finalize(() => this.statsLoading.set(false)))
      .subscribe({
        next: (stats) => this.practitionerStats.set(stats),
        error: (error: { error?: { error?: string } }) => {
          this.statsError.set(error.error?.error ?? 'Impossible de charger les statistiques de la praticienne.');
        }
      });
  }
}
