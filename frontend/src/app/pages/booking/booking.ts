import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { catchError, combineLatest, finalize, of, startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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

type BookingSelectedService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  staffPricingVariant?: 'standard' | 'trainee';
};

type BookingState = {
  selectedServices: BookingSelectedService[];
  totalDurationMin: number;
  totalPriceCents: number;
};

function contactValidator(control: AbstractControl): ValidationErrors | null {
  const email = (control.get('email')?.value as string | null)?.trim();
  const phone = (control.get('phone')?.value as string | null)?.trim();

  return email || phone ? null : { contactRequired: true };
}

@Component({
  selector: 'app-booking',
  imports: [SectionTitle, ReactiveFormsModule, BookingCalendar, RouterLink],
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
  protected readonly selectionError = signal('');
  protected readonly submitError = signal('');

  protected readonly staffMembers = signal<BookingStaffItem[]>([]);
  protected readonly catalogServices = signal<BookingServiceItem[]>([]);
  protected readonly freeStarts = signal<FreeStartItem[]>([]);
  protected readonly eligibleServices = signal<EligibleServiceItem[]>([]);
  protected readonly dayMeta = signal<MonthDayMeta>({});
  protected readonly searchTerm = signal('');
  protected readonly selectedCategoryId = signal<string>('all');
  protected readonly confirmation = signal<CreateAppointmentResponse | null>(null);
  protected readonly selectedServices = signal<BookingSelectedService[]>([]);
  protected readonly maxSelectedServices = 4;

  protected readonly form = this.formBuilder.nonNullable.group(
    {
      staffId: [''],
      date: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
      startAt: ['', [Validators.required]],
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
    if (!startAt) {
      return undefined;
    }

    const exactMatch = this.freeStarts().find((entry) => entry.startAt === startAt);
    if (exactMatch) {
      return exactMatch;
    }

    const selectedMs = Date.parse(startAt);
    if (Number.isNaN(selectedMs)) {
      return undefined;
    }

    return this.freeStarts().find((entry) => Date.parse(entry.startAt) === selectedMs);
  });

  protected readonly bookingState = computed<BookingState>(() => {
    const services = this.selectedServices();
    const totalDurationMin = services.reduce((sum, service) => sum + service.durationMin, 0);
    const totalPriceCents = services.reduce((sum, service) => sum + service.priceCents, 0);

    return {
      selectedServices: services,
      totalDurationMin,
      totalPriceCents
    };
  });

  protected readonly totalDurationMin = computed(() => this.bookingState().totalDurationMin);
  protected readonly totalPriceCents = computed(() => this.bookingState().totalPriceCents);

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

  protected readonly slotCompatibilityByStart = computed(() => {
    const requiredMin = this.totalDurationMin();
    const map = new Map<string, { compatible: boolean; label: string }>();

    for (const start of this.freeStarts()) {
      const compatible = this.isSlotCompatibleForDuration(start, requiredMin);

      map.set(start.startAt, {
        compatible,
        label: compatible ? `OK pour ${requiredMin} min` : 'Trop court'
      });
    }

    return map;
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
    const start = this.freeStarts().find((item) => item.startAt === startAt);
    if (start && !this.isStartCompatible(start)) {
      return;
    }

    this.form.controls.startAt.setValue(startAt);
    this.step.set(3);
  }

  protected addService(service: EligibleServiceItem): void {
    if (!service.eligible) {
      this.selectionError.set('Ce soin est indisponible pour ce depart.');
      return;
    }

    if (this.isServiceInSelection(service.id)) {
      this.selectionError.set('Ce soin est deja dans votre selection.');
      return;
    }

    if (this.selectedServices().length >= this.maxSelectedServices) {
      this.selectionError.set(`Maximum ${this.maxSelectedServices} soins.`);
      return;
    }

    const currentStart = this.selectedStart();
    if (!currentStart && !this.form.controls.startAt.value) {
      this.selectionError.set("Selectionnez d'abord une heure de depart.");
      return;
    }

    const projectedDuration = this.totalDurationMin() + service.durationMin;
    if (currentStart && !this.isSlotCompatibleForDuration(currentStart, projectedDuration)) {
      this.selectionError.set('Ce soin ne rentre pas dans le creneau choisi.');
      return;
    }

    this.selectionError.set('');

    this.selectedServices.update((selected) => [
      ...selected,
      {
        id: service.id,
        name: service.name,
        durationMin: service.durationMin,
        priceCents: service.effectivePriceCents,
        staffPricingVariant: this.isDiscountedService(service) ? 'trainee' : 'standard'
      }
    ]);

    this.step.set(4);
  }

  protected removeService(serviceId: string): void {
    this.selectedServices.update((services) => services.filter((service) => service.id !== serviceId));
    this.selectionError.set('');
    if (this.selectedServices().length === 0 && this.step() > 3) {
      this.step.set(3);
    }
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
    const basket = this.selectedServices();
    const primaryService = basket[0];
    if (!primaryService) {
      this.submitting.set(false);
      this.submitError.set('Ajoutez au moins un soin.');
      return;
    }

    const selectedService = this.eligibleServices().find((service) => service.id === primaryService.id);

    const resolvedStaffId =
      raw.staffId ||
      selectedService?.bestStaffId ||
      this.selectedStart()?.staffIds[0] ||
      undefined;

    const notes = raw.notes.trim();
    const basketNotes =
      basket.length > 1
        ? `Panier soins: ${basket.map((service) => `${service.name} (${service.durationMin} min)`).join(', ')}`
        : '';
    const mergedNotes = [notes, basketNotes].filter((value) => value.length > 0).join('\n');

    this.bookingApi
      .createAppointment({
        serviceId: primaryService.id,
        staffId: resolvedStaffId,
        startAt: raw.startAt,
        client: {
          firstName: raw.firstName.trim(),
          lastName: raw.lastName.trim(),
          email: raw.email.trim() || undefined,
          phone: raw.phone.trim() || undefined
        },
        notes: mergedNotes || undefined
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
    return this.canShowStep3() && this.selectedServices().length > 0;
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
    const selected = this.form.controls.startAt.value;
    if (!selected) {
      return false;
    }

    if (selected === startAt) {
      return true;
    }

    const selectedMs = Date.parse(selected);
    const startMs = Date.parse(startAt);
    return !Number.isNaN(selectedMs) && !Number.isNaN(startMs) && selectedMs === startMs;
  }

  protected isSelectedService(serviceId: string): boolean {
    return this.isServiceInSelection(serviceId);
  }

  protected isStartCompatible(start: FreeStartItem): boolean {
    return this.slotCompatibilityByStart().get(start.startAt)?.compatible ?? true;
  }

  protected startCompatibilityLabel(start: FreeStartItem): string {
    return this.slotCompatibilityByStart().get(start.startAt)?.label ?? 'OK';
  }

  protected canAddService(service: EligibleServiceItem): boolean {
    return service.eligible && !this.isServiceInSelection(service.id) && this.selectedServices().length < this.maxSelectedServices;
  }

  protected selectedServicesSummary(): string {
    return this.selectedServices()
      .map((service) => service.name)
      .join(', ');
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
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      notes: ''
    });

    this.confirmation.set(null);
    this.submitError.set('');
    this.selectedServices.set([]);
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
    this.selectionError.set('');
    this.confirmation.set(null);
    this.submitError.set('');
    this.selectedServices.set([]);

    this.form.patchValue(
      {
        startAt: '',
        notes: ''
      },
      { emitEvent: false }
    );

    this.step.set(this.form.controls.date.value ? 2 : 1);
  }

  private resetAfterStartChange(): void {
    this.eligibleServices.set([]);
    this.eligibleError.set('');
    this.selectionError.set('');
    this.searchTerm.set('');
    this.selectedCategoryId.set('all');
    this.confirmation.set(null);
    this.submitError.set('');
    this.selectedServices.set([]);

    if (this.form.controls.startAt.value) {
      this.step.set(3);
      return;
    }

    this.step.set(this.form.controls.date.value ? 2 : 1);
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private isServiceInSelection(serviceId: string): boolean {
    return this.selectedServices().some((service) => service.id === serviceId);
  }

  private addMinutesToTime(date: Date, minutes: number): Date {
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutes);
    return next;
  }

  private minutesBetween(a: Date, b: Date): number {
    return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));
  }

  private mockWorkdayEndFor(start: Date): Date {
    const end = new Date(start);
    const weekday = start.getDay();

    if (weekday === 6) {
      end.setHours(16, 0, 0, 0);
      return end;
    }

    end.setHours(19, 0, 0, 0);
    return end;
  }

  private isSlotCompatibleForDuration(start: FreeStartItem, requiredMin: number): boolean {
    const startTime = new Date(start.startAt);
    const endTime = this.addMinutesToTime(startTime, requiredMin);
    const workdayEnd = this.mockWorkdayEndFor(startTime);
    const freeToCloseMin = this.minutesBetween(startTime, workdayEnd);

    const fitsInWorkday = requiredMin <= freeToCloseMin && endTime.getTime() <= workdayEnd.getTime();
    const noConflictMock = requiredMin <= start.maxFreeMin;
    return fitsInWorkday && noConflictMock;
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
