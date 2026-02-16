import { NgStyle } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AdminServicesApiService } from '../../../core/services/admin-services-api.service';
import {
  AdminPlanningService,
  PlanningAppointmentItem,
  PlanningStaffItem
} from '../../../core/services/admin-planning.service';
import { AppointmentDrawerComponent } from '../../appointments/appointment-drawer/appointment-drawer.component';
import { AppointmentsApiService } from '../../appointments/appointments-api.service';
import { Appointment, AppointmentServiceItem, ClientLite } from '../../appointments/appointment.models';
import { AppointmentUiService } from '../../appointments/appointment-ui.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_MIN = 30;
const SLOT_HEIGHT = 40;
const TOTAL_MIN = (END_HOUR - START_HOUR) * 60;

@Component({
  selector: 'app-admin-planning',
  imports: [NgStyle, AppointmentDrawerComponent],
  templateUrl: './admin-planning.html',
  styleUrl: './admin-planning.scss'
})
export class AdminPlanning {
  private readonly planningApi = inject(AdminPlanningService);
  private readonly servicesApi = inject(AdminServicesApiService);
  private readonly appointmentUi = inject(AppointmentUiService);
  private readonly appointmentsApi = inject(AppointmentsApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly staff = signal<PlanningStaffItem[]>([]);
  protected readonly appointments = signal<PlanningAppointmentItem[]>([]);
  protected readonly timeOff = signal<
    Array<{
      id: string;
      staffId: string;
      staffName: string;
      staffColorHex: string;
      startsAt: string;
      endsAt: string;
      isAllDay: boolean;
      reason: string | null;
    }>
  >([]);
  protected readonly staffAvailability = signal<
    Array<{ staffId: string; weekday: number; startTime: string; endTime: string }>
  >([]);
  protected readonly weekStart = signal(this.getMonday(new Date()));
  protected readonly isMobile = signal(typeof window !== 'undefined' ? window.innerWidth < 900 : true);
  protected readonly mobileDayIndex = signal(0);
  protected readonly staffFilter = signal<string>('all');
  protected readonly now = signal(new Date());
  private readonly fallbackStaffColor = '#8C6A52';
  private readonly fallbackServiceColor = '#D8C5B5';

  protected readonly weekDays = computed(() => {
    const monday = this.weekStart();

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday.getTime() + index * DAY_MS);
      return {
        key: this.toYmd(date),
        date,
        label: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(date),
        shortLabel: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit' }).format(date)
      };
    });
  });

  protected readonly visibleDays = computed(() => {
    const days = this.weekDays();

    if (!this.isMobile()) {
      return days;
    }

    return [days[this.mobileDayIndex()]];
  });

  protected readonly staffFilters = computed(() => [
    { id: 'all', label: 'Toutes' },
    ...this.staff().map((item) => ({ id: item.id, label: item.name }))
  ]);

  protected readonly staffColorMap = computed(() => {
    const map: Record<string, { bg: string; border: string; text: string }> = {};

    for (const person of this.staff()) {
      const border = this.sanitizeHex(person.colorHex, this.fallbackStaffColor);
      const bg = this.hexToRgba(border, 0.2);
      map[person.id] = {
        bg,
        border,
        text: this.pickTextColor(border)
      };
    }

    return map;
  });

  protected readonly filteredAppointments = computed(() => {
    const filter = this.staffFilter();
    const all = this.appointments();

    if (filter === 'all') {
      return all;
    }

    return all.filter((item) => item.staffId === filter);
  });

  protected readonly filteredTimeOff = computed(() => {
    const filter = this.staffFilter();
    const all = this.timeOff();

    if (filter === 'all') {
      return all;
    }

    return all.filter((item) => item.staffId === filter);
  });

  protected readonly timeSlots = computed(() => {
    const slots: Array<{ minuteFromStart: number; label: string }> = [];

    for (let minute = 0; minute < TOTAL_MIN; minute += SLOT_MIN) {
      const absoluteMin = START_HOUR * 60 + minute;
      const hour = Math.floor(absoluteMin / 60);
      const mins = absoluteMin % 60;

      slots.push({
        minuteFromStart: minute,
        label: `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
      });
    }

    return slots;
  });

  constructor() {
    if (typeof window !== 'undefined') {
      const onResize = () => {
        this.isMobile.set(window.innerWidth < 900);
      };
      const timer = window.setInterval(() => this.now.set(new Date()), 30_000);

      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onResize);
        window.clearInterval(timer);
      });
    }

    this.servicesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe((services) => {
        const catalog: AppointmentServiceItem[] = services
          .filter((item) => item.active)
          .map((item) => ({
            serviceId: item.id,
            name: item.name,
            durationMin: item.durationMin,
            price: item.priceCents / 100
          }));
        this.appointmentUi.setContext({ servicesCatalog: catalog });
      });

    this.appointmentUi.saved$.pipe(takeUntilDestroyed()).subscribe(() => this.fetchPlanning());

    this.fetchPlanning();
  }

  protected previousWeek(): void {
    this.weekStart.update((current) => new Date(current.getTime() - 7 * DAY_MS));
    this.mobileDayIndex.set(0);
    this.fetchPlanning();
  }

  protected nextWeek(): void {
    this.weekStart.update((current) => new Date(current.getTime() + 7 * DAY_MS));
    this.mobileDayIndex.set(0);
    this.fetchPlanning();
  }

  protected previousMonth(): void {
    this.weekStart.update((current) => {
      const target = new Date(current);
      target.setDate(1);
      target.setMonth(target.getMonth() - 1);
      return this.getFirstMondayInMonth(target);
    });
    this.mobileDayIndex.set(0);
    this.fetchPlanning();
  }

  protected nextMonth(): void {
    this.weekStart.update((current) => {
      const target = new Date(current);
      target.setDate(1);
      target.setMonth(target.getMonth() + 1);
      return this.getFirstMondayInMonth(target);
    });
    this.mobileDayIndex.set(0);
    this.fetchPlanning();
  }

  protected goToCurrentWeek(): void {
    this.weekStart.set(this.getMonday(new Date()));
    this.mobileDayIndex.set(0);
    this.fetchPlanning();
  }

  protected previousDay(): void {
    this.mobileDayIndex.update((index) => Math.max(0, index - 1));
  }

  protected nextDay(): void {
    this.mobileDayIndex.update((index) => Math.min(6, index + 1));
  }

  protected setStaffFilter(value: string): void {
    this.staffFilter.set(value);
  }

  protected getAppointmentsForDay(dayKey: string): PlanningAppointmentItem[] {
    return this.filteredAppointments().filter((item) => {
      const local = new Date(item.startAt);
      return this.toYmd(local) === dayKey;
    });
  }

  protected getTimeOffForDay(dayKey: string): Array<{
    id: string;
    staffName: string;
    reason: string | null;
    top: string;
    height: string;
    border: string;
    bg: string;
    text: string;
  }> {
    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const gridStart = START_HOUR * 60;
    const gridEnd = END_HOUR * 60;

    return this.filteredTimeOff()
      .filter((item) => new Date(item.startsAt) < dayEnd && new Date(item.endsAt) > dayStart)
      .map((item) => {
        const start = new Date(item.startsAt) < dayStart ? dayStart : new Date(item.startsAt);
        const end = new Date(item.endsAt) > dayEnd ? dayEnd : new Date(item.endsAt);
        const startMin = start.getHours() * 60 + start.getMinutes();
        const endMin = end.getHours() * 60 + end.getMinutes();
        const fromMin = Math.max(startMin, gridStart);
        const toMin = Math.min(endMin, gridEnd);

        if (toMin <= fromMin) {
          return null;
        }

        const top = ((fromMin - gridStart) / SLOT_MIN) * SLOT_HEIGHT;
        const height = Math.max(14, ((toMin - fromMin) / SLOT_MIN) * SLOT_HEIGHT);
        const border = this.sanitizeHex(item.staffColorHex, this.fallbackStaffColor);

        return {
          id: item.id,
          staffName: item.staffName,
          reason: item.reason,
          top: `${top + 1}px`,
          height: `${height - 2}px`,
          border,
          bg: this.hexToRgba(border, 0.1),
          text: this.pickTextColor(border)
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  protected getDayShadingStyle(dayKey: string): { topHeight: string; bottomTop: string; bottomHeight: string } | null {
    const day = new Date(dayKey);
    const weekday = day.getDay();
    const filter = this.staffFilter();
    const visibleStaffIds =
      filter === 'all' ? this.staff().map((member) => member.id) : [filter];

    const matches = this.staffAvailability().filter(
      (rule) => rule.weekday === weekday && visibleStaffIds.includes(rule.staffId)
    );

    if (!matches.length) {
      return {
        topHeight: `${this.gridHeight()}px`,
        bottomTop: `${this.gridHeight()}px`,
        bottomHeight: '0px'
      };
    }

    const starts = matches.map((rule) => this.timeToMinutes(rule.startTime));
    const ends = matches.map((rule) => this.timeToMinutes(rule.endTime));

    const workStart = Math.max(START_HOUR * 60, Math.min(...starts));
    const workEnd = Math.min(END_HOUR * 60, Math.max(...ends));

    const topHeight = Math.max(0, ((workStart - START_HOUR * 60) / SLOT_MIN) * SLOT_HEIGHT);
    const bottomTop = Math.max(0, ((workEnd - START_HOUR * 60) / SLOT_MIN) * SLOT_HEIGHT);
    const bottomHeight = Math.max(0, this.gridHeight() - bottomTop);

    return {
      topHeight: `${topHeight}px`,
      bottomTop: `${bottomTop}px`,
      bottomHeight: `${bottomHeight}px`
    };
  }

  protected getAppointmentStyle(item: PlanningAppointmentItem): Record<string, string> {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);

    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();

    const fromMin = Math.max(startMin, START_HOUR * 60);
    const toMin = Math.min(endMin, END_HOUR * 60);

    const top = ((fromMin - START_HOUR * 60) / SLOT_MIN) * SLOT_HEIGHT;
    const height = Math.max(30, ((toMin - fromMin) / SLOT_MIN) * SLOT_HEIGHT);

    const border = this.sanitizeHex(item.staffColorHex, this.fallbackStaffColor);
    const bg = this.hexToRgba(border, 0.22);
    const text = this.pickTextColor(border);
    const serviceColor = this.sanitizeHex(item.serviceColorHex ?? border, this.fallbackServiceColor);

    return {
      top: `${top + 1}px`,
      height: `${height - 2}px`,
      '--apptBg': bg,
      '--apptBorder': border,
      '--apptText': text,
      '--serviceDot': serviceColor
    };
  }

  protected getStaffStyle(staffId: string): Record<string, string> {
    const colors = this.staffColorMap()[staffId] ?? {
      bg: '#efe7dd',
      border: '#b58f73',
      text: '#2a211b'
    };
    return {
      '--apptBg': colors.bg,
      '--apptBorder': colors.border,
      '--apptText': colors.text
    };
  }

  protected isToday(dayKey: string): boolean {
    return dayKey === this.toYmd(this.now());
  }

  protected statusLabel(status: PlanningAppointmentItem['status']): string {
    if (status === 'DONE') {
      return 'Termine';
    }

    if (status === 'NO_SHOW') {
      return 'Absence';
    }

    return 'Reserve';
  }

  protected statusClass(status: PlanningAppointmentItem['status']): string {
    if (status === 'DONE') {
      return 'is-done';
    }
    if (status === 'NO_SHOW') {
      return 'is-no-show';
    }
    return 'is-booked';
  }

  protected shortStatus(status: PlanningAppointmentItem['status']): string {
    if (status === 'DONE') {
      return 'Fait';
    }

    if (status === 'NO_SHOW') {
      return 'Abs';
    }

    return 'Res';
  }

  protected showNowLine(dayKey: string): boolean {
    return this.isToday(dayKey) && this.getNowLineTop() !== null;
  }

  protected getNowLineTop(): number | null {
    const current = this.now();
    const minute = current.getHours() * 60 + current.getMinutes();
    const from = START_HOUR * 60;
    const to = END_HOUR * 60;

    if (minute < from || minute > to) {
      return null;
    }

    return ((minute - from) / SLOT_MIN) * SLOT_HEIGHT;
  }

  protected gridTemplateColumns(): string {
    return `64px repeat(${this.visibleDays().length}, minmax(180px, 1fr))`;
  }

  protected gridHeight(): number {
    return (TOTAL_MIN / SLOT_MIN) * SLOT_HEIGHT;
  }

  protected openCreateDrawer(): void {
    this.appointmentUi.openCreate({
      practitionerId: this.staffFilter() !== 'all' ? this.staffFilter() : undefined,
      status: 'confirmed'
    });
  }

  protected onCellDblClick(dayKey: string, slotLabel: string): void {
    this.appointmentUi.openCreate({
      practitionerId: this.staffFilter() !== 'all' ? this.staffFilter() : undefined,
      startAt: this.slotToIso(dayKey, slotLabel),
      status: 'confirmed'
    });
  }

  protected openAppointmentEditor(item: PlanningAppointmentItem): void {
    this.appointmentUi.openEdit(this.toAppointment(item));
  }

  protected formatHour(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  protected formatRange(start: string, end: string): string {
    return `${this.formatHour(start)} - ${this.formatHour(end)}`;
  }

  protected weekLabel(): string {
    const days = this.weekDays();
    return `${days[0].label} - ${days[6].label}`;
  }

  protected monthLabel(): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.weekStart());
  }

  private fetchPlanning(): void {
    const start = this.toYmd(this.weekStart());
    const end = this.toYmd(new Date(this.weekStart().getTime() + 7 * DAY_MS));

    this.loading.set(true);
    this.errorMessage.set('');

    this.planningApi
      .getPlanning(start, end)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.staff.set(response.staff);
          this.appointments.set(response.appointments);
          this.staffAvailability.set(response.staffAvailability ?? []);
          this.timeOff.set(response.timeOff ?? []);

          const mappedAppointments = response.appointments.map((item) => this.toAppointment(item));
          this.appointmentUi.setContext({
            practitioners: response.staff.map((person) => ({ id: person.id, name: person.name })),
            appointments: mappedAppointments,
            clients: this.buildClients(mappedAppointments)
          });
          this.appointmentsApi.setFallbackAppointments(mappedAppointments);

          if (this.staffFilter() !== 'all' && !response.staff.some((item) => item.id === this.staffFilter())) {
            this.staffFilter.set('all');
          }
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Impossible de charger le planning.');
        }
      });
  }

  private getMonday(date: Date): Date {
    const copy = new Date(date);
    const day = copy.getDay();
    const shift = day === 0 ? -6 : 1 - day;
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() + shift);
    return copy;
  }

  private getFirstMondayInMonth(date: Date): Date {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monday = this.getMonday(monthStart);

    if (monday.getMonth() !== monthStart.getMonth()) {
      monday.setDate(monday.getDate() + 7);
    }

    return monday;
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toAppointment(item: PlanningAppointmentItem): Appointment {
    return {
      id: item.id,
      practitionerId: item.staffId,
      practitionerName: item.staffName,
      startAt: item.startAt,
      durationMin: this.diffMinutes(item.startAt, item.endAt),
      services: [
        {
          serviceId: item.serviceId,
          name: item.serviceName,
          durationMin: this.diffMinutes(item.startAt, item.endAt),
          price: 0
        }
      ],
      clientName: item.clientName,
      status: item.status === 'NO_SHOW' ? 'blocked' : 'confirmed'
    };
  }

  private buildClients(appointments: Appointment[]): ClientLite[] {
    const map = new Map<string, ClientLite>();
    for (const item of appointments) {
      const fullName = item.clientName?.trim();
      if (!fullName || map.has(fullName)) {
        continue;
      }

      const [firstName, ...rest] = fullName.split(/\s+/);
      map.set(fullName, {
        id: `known:${fullName.toLowerCase()}`,
        firstName: firstName || '',
        lastName: rest.join(' ')
      });
    }
    return Array.from(map.values());
  }

  private diffMinutes(startIso: string, endIso: string): number {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return Math.max(15, Math.round((end - start) / 60_000));
  }

  private slotToIso(dayKey: string, slotLabel: string): string {
    const local = new Date(`${dayKey}T${slotLabel}:00`);
    return local.toISOString();
  }

  private sanitizeHex(value: string | null | undefined, fallback: string): string {
    if (value && /^#[0-9A-Fa-f]{6}$/.test(value)) {
      return value.toUpperCase();
    }
    return fallback;
  }

  private hexToRgba(hexColor: string, alpha: number): string {
    const hex = this.sanitizeHex(hexColor, this.fallbackStaffColor).replace('#', '');
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  private timeToMinutes(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private pickTextColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
    const red = parseInt(full.slice(0, 2), 16);
    const green = parseInt(full.slice(2, 4), 16);
    const blue = parseInt(full.slice(4, 6), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

    return luminance > 0.6 ? '#2a211b' : '#f8f2ec';
  }
}
