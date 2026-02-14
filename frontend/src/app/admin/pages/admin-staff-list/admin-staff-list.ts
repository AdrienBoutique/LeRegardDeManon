import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AdminInstituteApiService,
  AdminStaffItem
} from '../../../core/services/admin-institute-api.service';
import { PASTEL_COLOR_OPTIONS } from '../../shared/pastel-colors';

@Component({
  selector: 'app-admin-staff-list',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-staff-list.html',
  styleUrl: './admin-staff-list.scss'
})
export class AdminStaffList {
  private readonly api = inject(AdminInstituteApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly staff = signal<AdminStaffItem[]>([]);
  protected readonly pendingDeleteId = signal<string | null>(null);
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;

  protected readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    active: [true],
    isTrainee: [false],
    colorHex: ['#8C6A52'],
    defaultDiscountPercent: [20]
  });

  constructor() {
    this.fetchStaff();
  }

  protected fetchStaff(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api
      .listStaff()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.staff.set(items),
        error: () => this.errorMessage.set('Impossible de charger les praticiennes.')
      });
  }

  protected submitCreate(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const isTrainee = raw.isTrainee;
    const discount = Number(raw.defaultDiscountPercent);

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .createStaff({
        name: raw.name.trim(),
        email: raw.email.trim().toLowerCase(),
        active: raw.active,
        isTrainee,
        colorHex: raw.colorHex,
        defaultDiscountPercent: isTrainee ? Math.min(100, Math.max(0, discount)) : null
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.createForm.reset({
            name: '',
            email: '',
            active: true,
            isTrainee: false,
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

  protected deleteStaff(member: AdminStaffItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .deleteStaff(member.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.pendingDeleteId.set(null);
          this.fetchStaff();
        },
        error: () => this.errorMessage.set('Suppression impossible.')
      });
  }

  protected requestDelete(memberId: string): void {
    this.pendingDeleteId.set(memberId);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  protected hasColorOption(hex: string | null | undefined): boolean {
    if (!hex) {
      return false;
    }

    return this.colorOptions.some((option) => option.hex.toUpperCase() === hex.toUpperCase());
  }
}
