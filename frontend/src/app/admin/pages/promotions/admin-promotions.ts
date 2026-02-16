import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AdminPromotionItem,
  AdminPromotionServiceItem,
  AdminPromotionsApi
} from '../../../core/api/admin-promotions.api';
import { AdminServiceLiteItem, AdminServicesApi } from '../../../core/api/admin-services.api';

type DiscountType = 'PERCENT' | 'FIXED';

@Component({
  selector: 'app-admin-promotions',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-promotions.html',
  styleUrl: './admin-promotions.scss'
})
export class AdminPromotions {
  private readonly promotionsApi = inject(AdminPromotionsApi);
  private readonly servicesApi = inject(AdminServicesApi);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly promotions = signal<AdminPromotionItem[]>([]);
  protected readonly services = signal<AdminServiceLiteItem[]>([]);
  protected readonly createSearch = signal('');
  protected readonly editSearch = signal('');
  protected readonly editingId = signal<string | null>(null);

  protected readonly createForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required]],
    subtitle: [''],
    description: [''],
    discountType: ['PERCENT' as DiscountType, [Validators.required]],
    discountValue: [15, [Validators.required, Validators.min(1)]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    active: [true],
    serviceIds: [[] as string[]]
  });

  protected readonly editForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required]],
    subtitle: [''],
    description: [''],
    discountType: ['PERCENT' as DiscountType, [Validators.required]],
    discountValue: [15, [Validators.required, Validators.min(1)]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    active: [true],
    serviceIds: [[] as string[]]
  });

  protected readonly filteredCreateServices = computed(() => this.filterServices(this.createSearch()));
  protected readonly filteredEditServices = computed(() => this.filterServices(this.editSearch()));

  protected readonly createSelectedServices = computed(() =>
    this.services().filter((service) => this.createForm.controls.serviceIds.value.includes(service.id))
  );

  protected readonly editSelectedServices = computed(() =>
    this.services().filter((service) => this.editForm.controls.serviceIds.value.includes(service.id))
  );

  constructor() {
    this.loadServices();
    this.loadPromotions();
  }

  protected loadPromotions(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.promotionsApi.listPromotions().subscribe({
      next: (promotions) => {
        this.promotions.set(promotions);
        this.loading.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? "Impossible de charger les promotions.");
        this.loading.set(false);
      }
    });
  }

  protected loadServices(): void {
    this.servicesApi.listServices().subscribe({
      next: (services) => {
        this.services.set(services.filter((service) => service.active));
      },
      error: () => {
        this.services.set([]);
      }
    });
  }

  protected setCreateSearch(value: string): void {
    this.createSearch.set(value);
  }

  protected setEditSearch(value: string): void {
    this.editSearch.set(value);
  }

  protected toggleCreateService(serviceId: string): void {
    this.createForm.controls.serviceIds.setValue(this.toggleServiceId(this.createForm.controls.serviceIds.value, serviceId));
  }

  protected toggleEditService(serviceId: string): void {
    this.editForm.controls.serviceIds.setValue(this.toggleServiceId(this.editForm.controls.serviceIds.value, serviceId));
  }

  protected isCreateServiceSelected(serviceId: string): boolean {
    return this.createForm.controls.serviceIds.value.includes(serviceId);
  }

  protected isEditServiceSelected(serviceId: string): boolean {
    return this.editForm.controls.serviceIds.value.includes(serviceId);
  }

  protected submitCreate(): void {
    if (!this.validateForm(this.createForm.controls.serviceIds.value, this.createForm.controls.startDate.value, this.createForm.controls.endDate.value)) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const raw = this.createForm.getRawValue();
    const payload = {
      title: raw.title.trim(),
      subtitle: raw.subtitle.trim() || undefined,
      description: raw.description.trim() || undefined,
      discountType: raw.discountType,
      discountValueInt: this.toDiscountValueInt(raw.discountType, raw.discountValue),
      startAt: this.toStartIso(raw.startDate),
      endAt: this.toEndIso(raw.endDate),
      active: raw.active,
      serviceIds: raw.serviceIds
    };

    this.promotionsApi.createPromotion(payload).subscribe({
      next: (created) => {
        this.promotions.update((items) => [created, ...items]);
        this.saving.set(false);
        this.resetCreateForm();
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? "Creation impossible.");
        this.saving.set(false);
      }
    });
  }

  protected startEdit(promotion: AdminPromotionItem): void {
    this.editingId.set(promotion.id);
    this.editSearch.set('');

    this.editForm.reset({
      title: promotion.title,
      subtitle: promotion.subtitle ?? '',
      description: promotion.description ?? '',
      discountType: promotion.discountType,
      discountValue: this.fromDiscountValueInt(promotion.discountType, promotion.discountValueInt),
      startDate: this.toInputDate(promotion.startAt),
      endDate: this.toInputDate(promotion.endAt),
      active: promotion.active,
      serviceIds: promotion.services.map((service) => service.id)
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected submitEdit(): void {
    const id = this.editingId();
    if (!id) {
      return;
    }

    if (!this.validateForm(this.editForm.controls.serviceIds.value, this.editForm.controls.startDate.value, this.editForm.controls.endDate.value)) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const raw = this.editForm.getRawValue();
    const payload = {
      title: raw.title.trim(),
      subtitle: raw.subtitle.trim() || null,
      description: raw.description.trim() || null,
      discountType: raw.discountType,
      discountValueInt: this.toDiscountValueInt(raw.discountType, raw.discountValue),
      startAt: this.toStartIso(raw.startDate),
      endAt: this.toEndIso(raw.endDate),
      active: raw.active,
      serviceIds: raw.serviceIds
    };

    this.promotionsApi.updatePromotion(id, payload).subscribe({
      next: (updated) => {
        this.promotions.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        this.saving.set(false);
        this.editingId.set(null);
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Modification impossible.');
        this.saving.set(false);
      }
    });
  }

  protected togglePromotion(promotion: AdminPromotionItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.promotionsApi.togglePromotion(promotion.id, !promotion.active).subscribe({
      next: () => {
        this.promotions.update((items) =>
          items.map((item) => (item.id === promotion.id ? { ...item, active: !item.active } : item))
        );
        this.saving.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Mise a jour impossible.');
        this.saving.set(false);
      }
    });
  }

  protected deletePromotion(promotion: AdminPromotionItem): void {
    if (this.saving()) {
      return;
    }

    const ok = window.confirm(`Supprimer l'offre \"${promotion.title}\" ?`);
    if (!ok) {
      return;
    }

    this.saving.set(true);
    this.promotionsApi.deletePromotion(promotion.id).subscribe({
      next: () => {
        this.promotions.update((items) => items.filter((item) => item.id !== promotion.id));
        this.saving.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Suppression impossible.');
        this.saving.set(false);
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

  protected formatPeriod(startAt: string, endAt: string): string {
    const start = new Date(startAt);
    const end = new Date(endAt);
    return `Du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;
  }

  protected discountUnitLabel(form: 'create' | 'edit'): string {
    const type = form === 'create' ? this.createForm.controls.discountType.value : this.editForm.controls.discountType.value;
    return type === 'PERCENT' ? '%' : 'EUR';
  }

  protected discountHint(form: 'create' | 'edit'): string {
    const type = form === 'create' ? this.createForm.controls.discountType.value : this.editForm.controls.discountType.value;
    return type === 'PERCENT' ? '1 a 90%' : 'Montant en euros';
  }

  protected previewDiscountLabel(form: 'create' | 'edit'): string {
    const raw = form === 'create' ? this.createForm.getRawValue() : this.editForm.getRawValue();
    if (raw.discountType === 'PERCENT') {
      return `-${Math.round(raw.discountValue)}%`;
    }

    return `-${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(raw.discountValue)}EUR`;
  }

  protected previewDiscountedPrice(service: AdminServiceLiteItem, form: 'create' | 'edit'): number {
    const raw = form === 'create' ? this.createForm.getRawValue() : this.editForm.getRawValue();
    if (raw.discountType === 'PERCENT') {
      return Math.max(0, Math.round((service.priceCents * (100 - Math.round(raw.discountValue))) / 100));
    }

    return Math.max(0, service.priceCents - Math.round(raw.discountValue * 100));
  }

  private filterServices(termRaw: string): AdminServiceLiteItem[] {
    const term = termRaw.trim().toLowerCase();
    if (!term) {
      return this.services();
    }

    return this.services().filter((service) => service.name.toLowerCase().includes(term));
  }

  private toggleServiceId(current: string[], serviceId: string): string[] {
    return current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId];
  }

  private validateForm(serviceIds: string[], startDate: string, endDate: string): boolean {
    if (serviceIds.length === 0) {
      this.errorMessage.set('Selectionnez au moins un service.');
      return false;
    }

    if (!startDate || !endDate) {
      this.errorMessage.set('Selectionnez une date de debut et de fin.');
      return false;
    }

    if (new Date(`${startDate}T00:00:00`).getTime() > new Date(`${endDate}T00:00:00`).getTime()) {
      this.errorMessage.set('La date de fin doit etre apres la date de debut.');
      return false;
    }

    this.errorMessage.set('');
    return true;
  }

  private toDiscountValueInt(type: DiscountType, value: number): number {
    if (type === 'PERCENT') {
      return Math.min(90, Math.max(1, Math.round(value)));
    }

    return Math.max(0, Math.round(value * 100));
  }

  private fromDiscountValueInt(type: DiscountType, valueInt: number): number {
    if (type === 'PERCENT') {
      return valueInt;
    }

    return valueInt / 100;
  }

  private toStartIso(date: string): string {
    return `${date}T00:00:00.000Z`;
  }

  private toEndIso(date: string): string {
    return `${date}T23:59:59.999Z`;
  }

  private toInputDate(iso: string): string {
    const date = new Date(iso);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private resetCreateForm(): void {
    this.createForm.reset({
      title: '',
      subtitle: '',
      description: '',
      discountType: 'PERCENT',
      discountValue: 15,
      startDate: '',
      endDate: '',
      active: true,
      serviceIds: []
    });
    this.createSearch.set('');
  }
}
