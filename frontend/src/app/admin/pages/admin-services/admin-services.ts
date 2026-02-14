import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminServiceCategoryItem,
  AdminServiceItem,
  AdminServicesApiService
} from '../../../core/services/admin-services-api.service';
import { PASTEL_COLOR_OPTIONS } from '../../shared/pastel-colors';

@Component({
  selector: 'app-admin-services',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-services.html',
  styleUrl: './admin-services.scss'
})
export class AdminServices {
  private readonly api = inject(AdminServicesApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly services = signal<AdminServiceItem[]>([]);
  protected readonly categories = signal<AdminServiceCategoryItem[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly categoryCreateTarget = signal<'create' | 'edit' | null>(null);
  protected readonly categoryDraft = signal('');
  protected readonly colorOptions = PASTEL_COLOR_OPTIONS;

  protected readonly createForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    description: ['', [Validators.required]],
    durationMin: [60, [Validators.required, Validators.min(1)]],
    priceEur: [65, [Validators.required, Validators.min(0)]],
    colorHex: [''],
    categoryId: [''],
    active: [true]
  });

  protected readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    description: ['', [Validators.required]],
    durationMin: [60, [Validators.required, Validators.min(1)]],
    priceEur: [65, [Validators.required, Validators.min(0)]],
    colorHex: [''],
    categoryId: [''],
    active: [true]
  });

  constructor() {
    this.fetchCategories();
    this.fetchServices();
  }

  protected fetchCategories(): void {
    this.api.listCategories().subscribe({
      next: (items) => this.categories.set(items),
      error: () => {}
    });
  }

  protected fetchServices(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api.list().subscribe({
      next: (services) => {
        this.loading.set(false);
        this.services.set(services);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les services.');
      }
    });
  }

  protected submitCreate(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.createForm.getRawValue();

    this.api
      .create({
        name: value.name,
        description: value.description,
        durationMin: Number(value.durationMin),
        priceCents: Math.round(Number(value.priceEur) * 100),
        colorHex: value.colorHex.trim() ? value.colorHex : null,
        categoryId: value.categoryId.trim() ? value.categoryId : null,
        active: value.active
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.createForm.reset({
            name: '',
            description: '',
            durationMin: 60,
            priceEur: 65,
            colorHex: '',
            categoryId: '',
            active: true
          });
          this.fetchServices();
        },
        error: (error: { error?: { error?: string } }) => {
          this.saving.set(false);
          this.errorMessage.set(error.error?.error ?? 'Creation impossible.');
        }
      });
  }

  protected startEdit(service: AdminServiceItem): void {
    this.editingId.set(service.id);
    this.editForm.reset({
      name: service.name,
      description: service.description,
      durationMin: service.durationMin,
      priceEur: service.priceCents / 100,
      colorHex: service.colorHex ?? '',
      categoryId: service.categoryId ?? '',
      active: service.active
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected setCreateColorAuto(): void {
    this.createForm.controls.colorHex.setValue('');
  }

  protected setEditColorAuto(): void {
    this.editForm.controls.colorHex.setValue('');
  }

  protected submitEdit(): void {
    const id = this.editingId();
    if (!id || this.editForm.invalid || this.saving()) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.editForm.getRawValue();

    this.api
      .update(id, {
        name: value.name,
        description: value.description,
        durationMin: Number(value.durationMin),
        priceCents: Math.round(Number(value.priceEur) * 100),
        colorHex: value.colorHex.trim() ? value.colorHex : null,
        categoryId: value.categoryId.trim() ? value.categoryId : null,
        active: value.active
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editingId.set(null);
          this.fetchServices();
        },
        error: (error: { error?: { error?: string } }) => {
          this.saving.set(false);
          this.errorMessage.set(error.error?.error ?? 'Modification impossible.');
        }
      });
  }

  protected addCategoryForCreate(): void {
    this.categoryCreateTarget.set('create');
    this.categoryDraft.set('');
  }

  protected addCategoryForEdit(): void {
    this.categoryCreateTarget.set('edit');
    this.categoryDraft.set('');
  }

  protected setCategoryDraft(value: string): void {
    this.categoryDraft.set(value);
  }

  protected cancelCategoryCreate(): void {
    this.categoryCreateTarget.set(null);
    this.categoryDraft.set('');
  }

  protected confirmCategoryCreate(): void {
    const target = this.categoryCreateTarget();
    if (!target) {
      return;
    }
    this.addCategoryAndSelect(target);
  }

  protected deleteCategory(category: AdminServiceCategoryItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.api.deleteCategory(category.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.categories.update((items) => items.filter((item) => item.id !== category.id));

        if (this.createForm.controls.categoryId.value === category.id) {
          this.createForm.controls.categoryId.setValue('');
        }

        if (this.editForm.controls.categoryId.value === category.id) {
          this.editForm.controls.categoryId.setValue('');
        }

        this.fetchServices();
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Suppression categorie impossible.');
      }
    });
  }

  private addCategoryAndSelect(target: 'create' | 'edit'): void {
    if (this.saving()) {
      return;
    }

    const name = this.categoryDraft().trim();
    if (!name) {
      return;
    }

    const existing = this.categories().find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (target === 'create') {
        this.createForm.controls.categoryId.setValue(existing.id);
      } else {
        this.editForm.controls.categoryId.setValue(existing.id);
      }
      this.cancelCategoryCreate();
      return;
    }

    this.saving.set(true);
    this.api.createCategory(name).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.categories.update((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (target === 'create') {
          this.createForm.controls.categoryId.setValue(created.id);
        } else {
          this.editForm.controls.categoryId.setValue(created.id);
        }
        this.cancelCategoryCreate();
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Creation categorie impossible.');
      }
    });
  }

  protected deleteService(service: AdminServiceItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.api.delete(service.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.fetchServices();
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.error ?? 'Suppression impossible.');
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

  protected hasColorOption(hex: string | null | undefined): boolean {
    if (!hex) {
      return false;
    }

    return this.colorOptions.some((option) => option.hex.toUpperCase() === hex.toUpperCase());
  }
}
