import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { catchError, combineLatest, finalize, of, startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SectionTitle } from '../../shared/ui/section-title/section-title';
import {
  BookingApiService,
  BookingServiceItem,
  BookingStaffItem,
  FreeStartItem,
  EligibleServiceItem,
  CreateAppointmentResponse,
  MonthDayMeta
} from '../../core/services/booking-api.service';
import { BookingCalendar } from './components/booking-calendar/booking-calendar';

type Step = 1 | 2 | 3 | 4 | 5;

type StaffChoice = {
  id: string;
  label: string;
};

type CategoryChoice = {
  id: string;
  label: string;
};

function contactValidator(control: AbstractControl): ValidationErrors | null {
  const email = (control.get('email')?.value as string | null)?.trim();
  const phone = (control.get('phone')?.value as string | null)?.trim();

  return email || phone ? null : { contactRequired: true };
}

@Component({
  selector: 'app-booking',
  imports: [SectionTitle, ReactiveFormsModule, BookingCalendar],
  templateUrl: './booking.html',
  styleUrl: './booking.scss'
})
export class Booking {
  private readonly bookingApi = inject(BookingApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly step = signal<Step>(1);
  protected readonly monthDate = signal(this.startOfMonth(new Date()));

  protected readonly loadingStaff = signal(false);
  protected readonly loadingCatalog = signal(false);
  protected readonly loadingStarts = signal(false);
  protected readonly loadingMonthMeta = signal(false);
  protected readonly loadingEligibleServices = signal(false);
  protected readonly submitting = signal(false);

  protected readonly startsError = signal('');
  protected readonly eligibleError = signal('');
  protected readonly submitError = signal('');

  protected readonly staffMembers = signal<BookingStaffItem[]>([]);
  protected readonly catalogServices = signal<BookingServiceItem[]>([]);
  protected readonly freeStarts = signal<FreeStartItem[]>([]);
  protected readonly eligibleServices = signal<EligibleServiceItem[]>([]);
  protected readonly dayMeta = signal<MonthDayMeta>({});
  protected readonly searchTerm = signal('');
  protected readonly selectedCategoryId = signal<string>('all');
  protected readonly confirmation = signal<CreateAppointmentResponse | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group(
    {
      staffId: [''],
      date: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
      startAt: ['', [Validators.required]],
      serviceId: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.email]],
      phone: [''],
      notes: ['']
    },
    { validators: [contactValidator] }
  );

  protected readonly staffChoices = computed<StaffChoice[]>(() => {
    const staff = this.staffMembers().map((member) => {
      const roleLabel = member.role.toLowerCase().includes('stagiaire') ? 'Stagiaire' : 'Praticienne';
      return {
        id: member.id,
        label: `${member.firstName} (${roleLabel})`
      };
    });

    return [{ id: '', label: 'Peu importe' }, ...staff];
  });

  protected readonly selectedStart = computed(() => {
    const startAt = this.form.controls.startAt.value;
    return this.freeStarts().find((entry) => entry.startAt === startAt);
  });

  protected readonly selectedService = computed(() => {
    const serviceId = this.form.controls.serviceId.value;
    return this.eligibleServices().find((service) => service.id === serviceId);
  });

  protected readonly filteredEligibleServices = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const categoryId = this.selectedCategoryId();
    const catalogById = new Map(this.catalogServices().map((service) => [service.id, service]));

    return this.eligibleServices().filter((service) => {
      const extra = catalogById.get(service.id);
      const haystack = `${service.name} ${extra?.description ?? ''}`.toLowerCase();
      const categoryMatch = categoryId === 'all' || service.categoryId === categoryId;
      const textMatch = term.length === 0 || haystack.includes(term);
      return categoryMatch && textMatch;
    });
  });

  protected readonly categoryChoices = computed<CategoryChoice[]>(() => {
    const map = new Map<string, string>();
    for (const service of this.eligibleServices()) {
      if (service.categoryId && service.categoryName) {
        map.set(service.categoryId, service.categoryName);
      }
    }

    const choices = Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [{ id: 'all', label: 'Toutes categories' }, ...choices];
  });

  constructor() {
    this.loadStaff();
    this.loadCatalog();

    combineLatest([
      this.form.controls.staffId.valueChanges.pipe(startWith(this.form.controls.staffId.value)),
      this.form.controls.date.valueChanges.pipe(startWith(this.form.controls.date.value))
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([staffId, date]) => {
        this.resetAfterDateOrStaffChange();

        if (date) {
          this.loadFreeStarts(date, staffId || undefined);
        }
      });

    this.form.controls.staffId.valueChanges
      .pipe(startWith(this.form.controls.staffId.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((staffId) => {
        this.loadMonthMeta(this.monthDate(), staffId || undefined);
      });

    this.loadMonthMeta(this.monthDate());

    this.form.controls.startAt.valueChanges
      .pipe(startWith(this.form.controls.startAt.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((startAt) => {
        this.resetAfterStartChange();

        if (startAt) {
          this.loadEligibleServices(startAt, this.form.controls.staffId.value || undefined);
        }
      });
  }

  protected selectStaff(staffId: string): void {
    this.form.controls.staffId.setValue(staffId);
  }

  protected onMonthChange(direction: 'prev' | 'next'): void {
    const next = new Date(this.monthDate());
    next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1));
    this.monthDate.set(this.startOfMonth(next));
    this.loadMonthMeta(this.monthDate(), this.form.controls.staffId.value || undefined);
  }

  protected onDaySelect(dayYmd: string): void {
    this.form.controls.date.setValue(dayYmd);
    const selectedDate = new Date(dayYmd);
    if (
      selectedDate.getFullYear() !== this.monthDate().getFullYear() ||
      selectedDate.getMonth() !== this.monthDate().getMonth()
    ) {
      this.monthDate.set(this.startOfMonth(selectedDate));
      this.loadMonthMeta(this.monthDate(), this.form.controls.staffId.value || undefined);
    }
  }

  protected selectStart(startAt: string): void {
    this.form.controls.startAt.setValue(startAt);
    this.step.set(3);
  }

  protected selectService(service: EligibleServiceItem): void {
    if (!service.eligible) {
      return;
    }

    this.form.controls.serviceId.setValue(service.id);
    this.step.set(4);
  }

  protected setSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected selectCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set('');

    const raw = this.form.getRawValue();
    const selectedService = this.selectedService();

    const resolvedStaffId =
      raw.staffId ||
      selectedService?.bestStaffId ||
      this.selectedStart()?.staffIds[0] ||
      undefined;

    this.bookingApi
      .createAppointment({
        serviceId: raw.serviceId,
        staffId: resolvedStaffId,
        startAt: raw.startAt,
        client: {
          firstName: raw.firstName.trim(),
          lastName: raw.lastName.trim(),
          email: raw.email.trim() || undefined,
          phone: raw.phone.trim() || undefined
        },
        notes: raw.notes.trim() || undefined
      })
      .pipe(
        finalize(() => {
          this.submitting.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (result) => {
          this.confirmation.set(result);
          this.step.set(5);
        },
        error: (error: { error?: { error?: string } }) => {
          this.submitError.set(error.error?.error ?? 'Impossible de creer le rendez-vous.');
        }
      });
  }

  protected canShowStep2(): boolean {
    return this.form.controls.date.valid;
  }

  protected canShowStep3(): boolean {
    return this.canShowStep2() && Boolean(this.form.controls.startAt.value);
  }

  protected canShowStep4(): boolean {
    return this.canShowStep3() && Boolean(this.form.controls.serviceId.value);
  }

  protected canSubmit(): boolean {
    return (
      this.canShowStep4() &&
      this.form.controls.firstName.valid &&
      this.form.controls.lastName.valid &&
      !this.form.hasError('contactRequired') &&
      !this.form.controls.email.hasError('email')
    );
  }

  protected isSelectedStaff(staffId: string): boolean {
    return this.form.controls.staffId.value === staffId;
  }

  protected isSelectedStart(startAt: string): boolean {
    return this.form.controls.startAt.value === startAt;
  }

  protected isSelectedService(serviceId: string): boolean {
    return this.form.controls.serviceId.value === serviceId;
  }

  protected formatPrice(priceCents: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(priceCents / 100);
  }

  protected isDiscountedService(service: EligibleServiceItem): boolean {
    return service.effectivePriceCents < service.basePriceCents;
  }

  protected discountPercent(service: EligibleServiceItem): number {
    if (!this.isDiscountedService(service) || service.basePriceCents <= 0) {
      return 0;
    }

    const ratio = (service.basePriceCents - service.effectivePriceCents) / service.basePriceCents;
    return Math.max(1, Math.round(ratio * 100));
  }

  protected formatHour(startAt: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(startAt));
  }

  protected formatDateTime(startAt: string): string {
    return new Intl.DateTimeFormat('fr-BE', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(new Date(startAt));
  }

  protected startAvailabilityLabel(maxFreeMin: number): string {
    if (maxFreeMin >= 180) {
      return 'Large choix de soins';
    }

    if (maxFreeMin >= 90) {
      return 'Bon choix de soins';
    }

    if (maxFreeMin >= 45) {
      return 'Soins rapides';
    }

    return 'Soins courts uniquement';
  }

  protected getServiceDescription(serviceId: string): string {
    return (
      this.catalogServices().find((service) => service.id === serviceId)?.description ??
      'Soin du regard'
    );
  }

  protected getServiceCategoryLabel(service: EligibleServiceItem): string {
    if (service.categoryName) {
      return service.categoryName;
    }

    return (
      this.catalogServices().find((item) => item.id === service.id)?.categoryName ??
      'Sans categorie'
    );
  }

  protected resetBooking(): void {
    const currentDate = this.form.controls.date.value;
    const currentStaff = this.form.controls.staffId.value;

    this.form.reset({
      staffId: currentStaff,
      date: currentDate,
      startAt: '',
      serviceId: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      notes: ''
    });

    this.confirmation.set(null);
    this.submitError.set('');
    this.step.set(currentDate ? 2 : 1);
  }

  private loadStaff(): void {
    this.loadingStaff.set(true);

    this.bookingApi
      .listStaff()
      .pipe(
        finalize(() => {
          this.loadingStaff.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (staff) => {
          this.staffMembers.set(staff);
        },
        error: () => {
          this.staffMembers.set([]);
        }
      });
  }

  private loadCatalog(): void {
    this.loadingCatalog.set(true);

    this.bookingApi
      .listServices()
      .pipe(
        finalize(() => {
          this.loadingCatalog.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (services) => {
          this.catalogServices.set(services.filter((service) => service.active !== false));
        },
        error: () => {
          this.catalogServices.set([]);
        }
      });
  }

  private loadFreeStarts(date: string, staffId?: string): void {
    this.loadingStarts.set(true);
    this.startsError.set('');

    this.bookingApi
      .getFreeStarts(date, staffId)
      .pipe(
        finalize(() => {
          this.loadingStarts.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.freeStarts.set(response.starts);
          this.step.set(2);

          if (response.starts.length === 0) {
            this.startsError.set('Aucun horaire disponible pour cette date.');
          }
        },
        error: (error: { error?: { error?: string } }) => {
          this.freeStarts.set([]);
          this.startsError.set(error.error?.error ?? 'Impossible de charger les horaires.');
        }
      });
  }

  private loadEligibleServices(startAt: string, staffId?: string): void {
    this.loadingEligibleServices.set(true);
    this.eligibleError.set('');

    this.bookingApi
      .getEligibleServices(startAt, staffId)
      .pipe(
        finalize(() => {
          this.loadingEligibleServices.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.eligibleServices.set(response.services);
          this.step.set(3);

          if (response.services.length === 0) {
            this.eligibleError.set('Aucun soin disponible sur ce depart.');
          }
        },
        error: (error: { error?: { error?: string } }) => {
          this.eligibleServices.set([]);
          this.eligibleError.set(error.error?.error ?? 'Impossible de charger les soins disponibles.');
        }
      });
  }

  private loadMonthMeta(monthDate: Date, staffId?: string): void {
    const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    this.loadingMonthMeta.set(true);

    this.bookingApi
      .getMonthlyAvailability(month, staffId)
      .pipe(
        catchError(() => of(this.buildMockMonthMeta(monthDate))),
        finalize(() => {
          this.loadingMonthMeta.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((meta) => {
        this.dayMeta.set(meta);
      });
  }

  private resetAfterDateOrStaffChange(): void {
    this.freeStarts.set([]);
    this.startsError.set('');
    this.eligibleServices.set([]);
    this.eligibleError.set('');
    this.searchTerm.set('');
    this.selectedCategoryId.set('all');
    this.confirmation.set(null);
    this.submitError.set('');

    this.form.patchValue(
      {
        startAt: '',
        serviceId: '',
        notes: ''
      },
      { emitEvent: false }
    );

    this.step.set(this.form.controls.date.value ? 2 : 1);
  }

  private resetAfterStartChange(): void {
    this.eligibleServices.set([]);
    this.eligibleError.set('');
    this.searchTerm.set('');
    this.selectedCategoryId.set('all');
    this.confirmation.set(null);
    this.submitError.set('');

    this.form.patchValue({ serviceId: '' }, { emitEvent: false });

    if (this.form.controls.startAt.value) {
      this.step.set(3);
      return;
    }

    this.step.set(this.form.controls.date.value ? 2 : 1);
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private buildMockMonthMeta(monthDate: Date): MonthDayMeta {
    const result: MonthDayMeta = {};
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= end.getDate(); day += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), day);
      const ymd = this.toYmd(date);

      if (date < today) {
        result[ymd] = { level: 'none' };
        continue;
      }

      const weekday = date.getDay();
      if (weekday === 0) {
        result[ymd] = { level: 'none' };
        continue;
      }

      if (weekday === 6) {
        result[ymd] = { level: 'low' };
        continue;
      }

      result[ymd] = day % 3 === 0 ? { level: 'high' } : { level: 'mid' };
    }

    return result;
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
