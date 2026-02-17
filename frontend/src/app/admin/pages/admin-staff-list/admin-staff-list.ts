import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AdminPractitionerItem,
  AdminPractitionersApiService,
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
  protected readonly pendingDeleteId = signal<string | null>(null);
  protected readonly createModalOpen = signal(false);
  protected readonly tempPassword = signal<string | null>(null);
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;

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
      .updateStatus(member.id, 'inactive')
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.pendingDeleteId.set(null);
          this.fetchStaff();
        },
        error: () => this.errorMessage.set('Desactivation impossible.')
      });
  }

  protected requestDelete(memberId: string): void {
    this.pendingDeleteId.set(memberId);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
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
}
