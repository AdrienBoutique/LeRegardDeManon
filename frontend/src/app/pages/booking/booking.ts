import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { catchError, combineLatest, finalize, map, of, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { PublicPromotionItem, PublicPromotionsApi } from '../../core/api/public-promotions.api';

type Step = 1 | 2 | 3 | 4;

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

type PromoBookingContext = {
  promoId: string;
  title: string;
  startYmd: string;
  endYmd: string;
  serviceIds: string[];
  lockMode: 'fixed' | 'auto';
  minDurationMin: number;
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
  private readonly publicPromotionsApi = inject(PublicPromotionsApi);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentStep = signal<Step>(1);
  protected readonly maxStep = 4;
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
  protected readonly promoContext = signal<PromoBookingContext | null>(null);
  protected readonly promoError = signal('');
  protected readonly maxSelectedServices = 4;
  protected readonly stepItems = [
    { id: 1, label: 'Praticienne, date & horaire' },
    { id: 2, label: 'Soin' },
    { id: 3, label: 'Coordonnees' },
    { id: 4, label: 'Confirmation' }
  ] as const;

  protected readonly form = this.formBuilder.nonNullable.group(
    {
      staffId: [''],
      date: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
      startAt: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.email]],
      phone: [''],
      smsConsent: [false],
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
  protected readonly isPromoBooking = computed(() => this.promoContext() !== null);
  protected readonly promoRangeLabel = computed(() => {
    const context = this.promoContext();
    if (!context) {
      return '';
    }

    return `Offre valable du ${this.formatYmd(context.startYmd)} au ${this.formatYmd(context.endYmd)}`;
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

  protected readonly slotCompatibilityByStart = computed(() => {
    const requiredMin = this.requiredDurationMinForSlots();
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
  protected readonly requiredDurationMinForSlots = computed(() => {
    const selectedDuration = this.totalDurationMin();
    if (selectedDuration > 0) {
      return selectedDuration;
    }

    return this.promoContext()?.minDurationMin ?? 0;
  });

  protected readonly completedSteps = computed(() => {
    const done = new Set<number>();
    if (this.isStep1Valid()) {
      done.add(1);
    }
    if (this.isStep2Valid()) {
      done.add(2);
    }
    if (this.isStep3Valid()) {
      done.add(3);
    }
    if (this.confirmation()) {
      done.add(4);
    }
    return done;
  });

  constructor() {
    this.bindPromoContextFromQuery();
    this.loadStaff();
    this.loadCatalog();

    combineLatest([
      this.form.controls.staffId.valueChanges.pipe(startWith(this.form.controls.staffId.value)),
      this.form.controls.date.valueChanges.pipe(startWith(this.form.controls.date.value))
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([staffId, date]) => {
        this.resetAfterDateOrStaffChange();

        if (date && this.isDateAllowedByPromo(date)) {
          this.loadFreeStarts(date, staffId || undefined);
        } else if (date) {
          this.startsError.set('Cette date est hors periode de promotion.');
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

    this.ensureInitialDateSelected();
  }

  protected selectStaff(staffId: string): void {
    this.form.controls.staffId.setValue(staffId);
  }

  protected onMonthChange(direction: 'prev' | 'next'): void {
    const next = new Date(this.monthDate());
    next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1));

    if (!this.isMonthAllowedByPromo(next)) {
      return;
    }

    this.monthDate.set(this.startOfMonth(next));
    this.loadMonthMeta(this.monthDate(), this.form.controls.staffId.value || undefined);
  }

  protected onDaySelect(dayYmd: string): void {
    if (!this.isDateAllowedByPromo(dayYmd)) {
      return;
    }

    this.form.controls.date.setValue(dayYmd);
    const selectedDate = this.parseYmdToLocalDate(dayYmd);
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
    if (start && !this.isStartSelectable(start)) {
      return;
    }

    this.form.controls.startAt.setValue(startAt);
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

  }

  protected removeService(serviceId: string): void {
    if (this.isPromoBooking()) {
      return;
    }

    this.selectedServices.update((services) => services.filter((service) => service.id !== serviceId));
    this.selectionError.set('');
    if (this.selectedServices().length === 0 && this.currentStep() > 2) {
      this.goToStep(2);
    }
  }

  protected goToStep(step: number): void {
    const normalized = Math.max(1, Math.min(this.maxStep, step)) as Step;
    if (!this.canAccessStep(normalized)) {
      return;
    }
    this.currentStep.set(normalized);
    this.scrollToTop();
  }

  protected nextStep(): void {
    if (!this.canGoNext()) {
      return;
    }
    if (this.currentStep() >= this.maxStep) {
      return;
    }
    this.currentStep.set((this.currentStep() + 1) as Step);
    this.scrollToTop();
  }

  protected prevStep(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.currentStep.set((this.currentStep() - 1) as Step);
    this.scrollToTop();
  }

  protected canGoNext(): boolean {
    const step = this.currentStep();
    switch (step) {
      case 1:
        return this.isStep1Valid();
      case 2:
        return this.isStep2Valid();
      case 3:
        return this.isStep3Valid();
      case 4:
      default:
        return false;
    }
  }

  protected canGoPrev(): boolean {
    return this.currentStep() > 1;
  }

  protected canAccessStep(step: number): boolean {
    return step <= this.currentStep();
  }

  protected handleStepSubmit(): void {
    if (this.currentStep() < this.maxStep) {
      this.nextStep();
      return;
    }
    this.submit();
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
    const promoNotes = this.promoContext()
      ? `Promotion: ${this.promoContext()!.title} (${this.promoContext()!.promoId})`
      : '';
    const mergedNotes = [notes, basketNotes, promoNotes].filter((value) => value.length > 0).join('\n');

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
        smsConsent: raw.smsConsent === true,
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
          this.currentStep.set(4);
          this.scrollToTop();
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

  protected isStepCurrent(step: number): boolean {
    return this.currentStep() === step;
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

  protected isStartInPast(start: FreeStartItem): boolean {
    const startMs = Date.parse(start.startAt);
    if (Number.isNaN(startMs)) {
      return false;
    }

    return startMs <= Date.now();
  }

  protected isStartSelectable(start: FreeStartItem): boolean {
    return this.isStartCompatible(start) && !this.isStartInPast(start);
  }

  protected startCompatibilityLabel(start: FreeStartItem): string {
    if (this.isStartInPast(start)) {
      return 'Heure passee';
    }

    const requiredMin = this.totalDurationMin();
    if (requiredMin <= 0) {
      return '';
    }

    return this.slotCompatibilityByStart().get(start.startAt)?.label ?? '';
  }

  protected canAddService(service: EligibleServiceItem): boolean {
    return (
      !this.isPromoBooking() &&
      service.eligible &&
      !this.isServiceInSelection(service.id) &&
      this.selectedServices().length < this.maxSelectedServices
    );
  }

  protected selectedServicesSummary(): string {
    return this.selectedServices()
      .map((service) => service.name)
      .join(', ');
  }

  protected selectedStaffLabel(): string {
    const staffId = this.form.controls.staffId.value;
    if (!staffId) {
      return 'Peu importe';
    }
    const staff = this.staffMembers().find((member) => member.id === staffId);
    return staff ? `${staff.firstName} ${staff.lastName}` : 'Praticienne';
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
      smsConsent: false,
      notes: ''
    });

    this.confirmation.set(null);
    this.submitError.set('');
    this.selectedServices.set([]);
    this.currentStep.set(1);
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
    if (!this.isDateAllowedByPromo(date)) {
      this.freeStarts.set([]);
      this.startsError.set('Cette date est hors periode de promotion.');
      return;
    }

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
          this.applyPromoSelection(response.services);

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
        const constrainedMeta = this.applyPromoWindowToMeta(meta);
        this.dayMeta.set(constrainedMeta);
        this.ensureDateSelectionFromMeta(constrainedMeta, monthDate);
      });
  }

  private ensureInitialDateSelected(): void {
    const currentValue = this.form.controls.date.value;
    if (currentValue && this.isDateAllowedByPromo(currentValue)) {
      return;
    }

    const fallback = this.getPreferredPromoDate() ?? this.toYmd(new Date());
    this.form.controls.date.setValue(fallback);
  }

  private ensureDateSelectionFromMeta(meta: MonthDayMeta, monthDate: Date): void {
    const current = this.form.controls.date.value;
    const currentLevel = current ? meta[current]?.level ?? 'none' : 'none';

    if (current && currentLevel !== 'none') {
      return;
    }

    const monthPrefix = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-`;
    const todayYmd = this.toYmd(new Date());
    const promo = this.promoContext();
    const availableDays = Object.entries(meta)
      .filter(([ymd, item]) => ymd.startsWith(monthPrefix) && item.level !== 'none')
      .filter(([ymd]) => !promo || this.isDateInsidePromoWindow(ymd, promo))
      .map(([ymd]) => ymd)
      .sort((a, b) => a.localeCompare(b));

    if (availableDays.length === 0) {
      return;
    }

    const preferred = availableDays.find((ymd) => ymd >= todayYmd) ?? availableDays[0];

    if (preferred !== current) {
      this.form.controls.date.setValue(preferred);
    }
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

    this.currentStep.set(1);
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

    this.currentStep.set(1);
  }

  private isStep1Valid(): boolean {
    const staffId = this.form.controls.staffId.value;
    const hasValidStaff =
      staffId === '' || this.staffMembers().some((member) => member.id === staffId);
    return hasValidStaff && this.form.controls.date.valid && Boolean(this.form.controls.startAt.value);
  }

  private isStep2Valid(): boolean {
    return this.canShowStep3() && this.selectedServices().length > 0 && this.isPromoSelectionComplete();
  }

  private isStep3Valid(): boolean {
    return this.canSubmit();
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  private bindPromoContextFromQuery(): void {
    this.route.queryParamMap
      .pipe(
        map((params) => ({
          promoId: (params.get('promoId') || '').trim(),
          serviceId: (params.get('serviceId') || '').trim()
        })),
        switchMap(({ promoId, serviceId }) => {
          if (!promoId) {
            this.promoError.set('');
            return of<PromoBookingContext | null>(null);
          }

          return this.publicPromotionsApi.getActivePromotions().pipe(
            map((promotions) => {
              const context = this.toPromoContext(promotions, promoId, serviceId);
              this.promoError.set(context ? '' : "Cette promotion n'est plus disponible.");
              return context;
            }),
            catchError(() => {
              this.promoError.set("Impossible de charger la promotion selectionnee.");
              return of<PromoBookingContext | null>(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((context) => {
        this.promoContext.set(context);
        this.ensureInitialDateSelected();
        const preferredDate = this.form.controls.date.value;
        if (preferredDate) {
          this.monthDate.set(this.startOfMonth(this.parseYmdToLocalDate(preferredDate)));
          this.loadMonthMeta(this.monthDate(), this.form.controls.staffId.value || undefined);
        }
      });
  }

  private toPromoContext(
    promotions: PublicPromotionItem[],
    promoId: string,
    requestedServiceId: string
  ): PromoBookingContext | null {
    const promo = promotions.find((item) => item.id === promoId);
    if (!promo) {
      return null;
    }

    const promoServiceIds = promo.services.map((service) => service.id);
    const hasFixedService = requestedServiceId && promoServiceIds.includes(requestedServiceId);
    const targetServiceIds = hasFixedService ? [requestedServiceId] : promoServiceIds;

    return {
      promoId: promo.id,
      title: promo.title,
      startYmd: this.toYmd(new Date(promo.startAt)),
      endYmd: this.toYmd(new Date(promo.endAt)),
      serviceIds: targetServiceIds,
      lockMode: hasFixedService ? 'fixed' : 'auto',
      minDurationMin: Math.min(
        ...promo.services
          .filter((service) => targetServiceIds.includes(service.id))
          .map((service) => service.durationMin)
      )
    };
  }

  private applyPromoSelection(services: EligibleServiceItem[]): void {
    const context = this.promoContext();
    if (!context) {
      return;
    }

    const byId = new Map(services.map((service) => [service.id, service]));
    let chosen: EligibleServiceItem | null = null;

    if (context.lockMode === 'fixed') {
      const fixed = byId.get(context.serviceIds[0]);
      if (fixed?.eligible) {
        chosen = fixed;
      }
    } else {
      chosen =
        context.serviceIds
          .map((id) => byId.get(id))
          .find((service): service is EligibleServiceItem => Boolean(service?.eligible)) ?? null;
    }

    if (!chosen) {
      this.selectedServices.set([]);
      this.selectionError.set(
        "L'offre selectionnee est indisponible sur cet horaire. Choisissez un autre creneau dans la periode de promotion."
      );
      return;
    }

    this.selectionError.set('');
    this.selectedServices.set([
      {
        id: chosen.id,
        name: chosen.name,
        durationMin: chosen.durationMin,
        priceCents: chosen.effectivePriceCents,
        staffPricingVariant: this.isDiscountedService(chosen) ? 'trainee' : 'standard'
      }
    ]);
  }

  private applyPromoWindowToMeta(meta: MonthDayMeta): MonthDayMeta {
    const context = this.promoContext();
    if (!context) {
      return meta;
    }

    const constrained: MonthDayMeta = {};
    for (const [ymd, value] of Object.entries(meta)) {
      constrained[ymd] = this.isDateInsidePromoWindow(ymd, context) ? value : { level: 'none' };
    }

    return constrained;
  }

  private isDateAllowedByPromo(ymd: string): boolean {
    const context = this.promoContext();
    if (!context) {
      return true;
    }

    return this.isDateInsidePromoWindow(ymd, context);
  }

  private isDateInsidePromoWindow(ymd: string, context: PromoBookingContext): boolean {
    return ymd >= context.startYmd && ymd <= context.endYmd;
  }

  private isMonthAllowedByPromo(monthDate: Date): boolean {
    const context = this.promoContext();
    if (!context) {
      return true;
    }

    const monthKey = monthDate.getFullYear() * 12 + monthDate.getMonth();
    const minDate = this.parseYmdToLocalDate(context.startYmd);
    const maxDate = this.parseYmdToLocalDate(context.endYmd);
    const minKey = minDate.getFullYear() * 12 + minDate.getMonth();
    const maxKey = maxDate.getFullYear() * 12 + maxDate.getMonth();
    return monthKey >= minKey && monthKey <= maxKey;
  }

  private getPreferredPromoDate(): string | null {
    const context = this.promoContext();
    if (!context) {
      return null;
    }

    const todayYmd = this.toYmd(new Date());
    if (todayYmd < context.startYmd) {
      return context.startYmd;
    }
    if (todayYmd > context.endYmd) {
      return context.endYmd;
    }
    return todayYmd;
  }

  private isPromoSelectionComplete(): boolean {
    const context = this.promoContext();
    if (!context) {
      return true;
    }

    if (context.lockMode === 'fixed') {
      const selected = this.selectedServices();
      return selected.length === 1 && selected[0]?.id === context.serviceIds[0];
    }

    const selected = this.selectedServices();
    return selected.length === 1 && context.serviceIds.includes(selected[0]?.id ?? '');
  }

  private formatYmd(ymd: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(this.parseYmdToLocalDate(ymd));
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseYmdToLocalDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
