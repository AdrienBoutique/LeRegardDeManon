import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminInstituteApiService, AdminStaffItem } from '../../../core/services/admin-institute-api.service';

type EditableDay = {
  weekday: number;
  label: string;
  off: boolean;
  startTime: string;
  endTime: string;
};

type HoursTarget = 'institute' | 'staff';

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
  selector: 'app-admin-hours',
  templateUrl: './admin-hours.html',
  styleUrl: './admin-hours.scss'
})
export class AdminHours {
  private readonly api = inject(AdminInstituteApiService);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loadingStaff = signal(false);
  protected readonly loadingInstitute = signal(false);
  protected readonly loadingAvailability = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingInstitute = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly target = signal<HoursTarget>('institute');

  protected readonly staff = signal<AdminStaffItem[]>([]);
  protected readonly selectedStaffId = signal<string | null>(null);
  protected readonly days = signal<EditableDay[]>(this.getDefaultDays());
  protected readonly instituteDays = signal<EditableDay[]>(this.getDefaultDays());

  protected readonly hasStaff = computed(() => this.staff().length > 0);

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
    });

    this.fetchInstituteAvailability();
    this.fetchStaff();
  }

  protected setTarget(target: HoursTarget): void {
    this.target.set(target);
  }

  protected selectStaff(staffId: string): void {
    if (this.selectedStaffId() === staffId || this.loadingAvailability()) {
      return;
    }

    this.selectedStaffId.set(staffId);
    this.fetchAvailability(staffId);
  }

  protected toggleOff(weekday: number, off: boolean): void {
    this.toggleOffOnState(this.target() === 'institute' ? this.instituteDays : this.days, weekday, off);
  }

  protected updateTime(weekday: number, key: 'startTime' | 'endTime', value: string): void {
    this.updateTimeOnState(this.target() === 'institute' ? this.instituteDays : this.days, weekday, key, value);
  }

  protected save(): void {
    if (this.target() === 'institute') {
      this.saveInstitute();
      return;
    }

    const staffId = this.selectedStaffId();
    if (!staffId || this.saving()) {
      return;
    }

    const validationError = this.validateDays(this.days());
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    const payload = this.days().map((day) => ({
      weekday: day.weekday,
      off: day.off,
      startTime: day.off ? undefined : day.startTime,
      endTime: day.off ? undefined : day.endTime
    }));

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .updateAvailability(staffId, payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          this.applyAvailability(response.days);
          this.showToast('Sauvegarde reussie.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Impossible de sauvegarder les horaires.');
        }
      });
  }

  private saveInstitute(): void {
    if (this.savingInstitute()) {
      return;
    }

    const validationError = this.validateDays(this.instituteDays());
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    const payload = this.instituteDays().map((day) => ({
      weekday: day.weekday,
      off: day.off,
      startTime: day.off ? undefined : day.startTime,
      endTime: day.off ? undefined : day.endTime
    }));

    this.savingInstitute.set(true);
    this.errorMessage.set('');

    this.api
      .updateInstituteAvailability(payload)
      .pipe(finalize(() => this.savingInstitute.set(false)))
      .subscribe({
        next: (response) => {
          this.applyInstituteAvailability(response.days);
          this.showToast('Horaires institut sauvegardes.');
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? "Impossible de sauvegarder l'horaire institut.");
        }
      });
  }

  private toggleOffOnState(
    state: { update: (callback: (items: EditableDay[]) => EditableDay[]) => void },
    weekday: number,
    off: boolean
  ): void {
    state.update((items) =>
      items.map((item) =>
        item.weekday === weekday
          ? {
              ...item,
              off,
              startTime: off ? item.startTime : item.startTime || '09:00',
              endTime: off ? item.endTime : item.endTime || '18:00'
            }
          : item
      )
    );
  }

  private updateTimeOnState(
    state: { update: (callback: (items: EditableDay[]) => EditableDay[]) => void },
    weekday: number,
    key: 'startTime' | 'endTime',
    value: string
  ): void {
    state.update((items) =>
      items.map((item) => (item.weekday === weekday ? { ...item, [key]: value } : item))
    );
  }

  private fetchStaff(): void {
    this.loadingStaff.set(true);
    this.errorMessage.set('');

    this.api
      .listStaff()
      .pipe(finalize(() => this.loadingStaff.set(false)))
      .subscribe({
        next: (items) => {
          const active = items.filter((member) => member.active);
          this.staff.set(active);

          if (!active.length) {
            this.selectedStaffId.set(null);
            this.days.set(this.getDefaultDays());
            return;
          }

          const first = active[0];
          this.selectedStaffId.set(first.id);
          this.fetchAvailability(first.id);
        },
        error: () => {
          this.errorMessage.set('Impossible de charger les praticiennes.');
        }
      });
  }

  private fetchInstituteAvailability(): void {
    this.loadingInstitute.set(true);
    this.errorMessage.set('');

    this.api
      .getInstituteAvailability()
      .pipe(finalize(() => this.loadingInstitute.set(false)))
      .subscribe({
        next: (items) => this.applyInstituteAvailability(items),
        error: () => {
          this.instituteDays.set(this.getDefaultDays());
          this.errorMessage.set("Impossible de charger l'horaire institut.");
        }
      });
  }

  private fetchAvailability(staffId: string): void {
    this.loadingAvailability.set(true);
    this.errorMessage.set('');

    this.api
      .getAvailability(staffId)
      .pipe(finalize(() => this.loadingAvailability.set(false)))
      .subscribe({
        next: (items) => this.applyAvailability(items),
        error: () => {
          this.days.set(this.getDefaultDays());
          this.errorMessage.set('Impossible de charger les horaires.');
        }
      });
  }

  private applyInstituteAvailability(
    items: Array<{ weekday: number; off?: boolean; startTime: string | null; endTime: string | null }>
  ): void {
    this.instituteDays.set(this.toEditableDays(items));
  }

  private applyAvailability(
    items: Array<{ weekday: number; off?: boolean; startTime: string | null; endTime: string | null }>
  ): void {
    this.days.set(this.toEditableDays(items));
  }

  private toEditableDays(
    items: Array<{ weekday: number; off?: boolean; startTime: string | null; endTime: string | null }>
  ): EditableDay[] {
    const byWeekday = new Map(items.map((day) => [day.weekday, day]));
    return DAYS.map((day) => {
      const item = byWeekday.get(day.weekday);
      return {
        weekday: day.weekday,
        label: day.label,
        off: item ? Boolean(item.off) : true,
        startTime: item?.startTime ?? '09:00',
        endTime: item?.endTime ?? '18:00'
      };
    });
  }

  private validateDays(days: EditableDay[]): string | null {
    for (const day of days) {
      if (day.off) {
        continue;
      }

      if (!day.startTime || !day.endTime) {
        return `Veuillez renseigner les heures pour ${day.label}.`;
      }

      if (day.startTime >= day.endTime) {
        return `Horaire invalide pour ${day.label} (debut avant fin).`;
      }
    }

    return null;
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 2600);
  }

  private getDefaultDays(): EditableDay[] {
    return DAYS.map((day) => ({
      weekday: day.weekday,
      label: day.label,
      off: true,
      startTime: '09:00',
      endTime: '18:00'
    }));
  }
}
