import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize, firstValueFrom } from 'rxjs';
import { AdminInstituteApiService, AdminStaffItem, AdminTimeOffItem } from '../../../core/services/admin-institute-api.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-timeoff',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-timeoff.html',
  styleUrl: './admin-timeoff.scss'
})
export class AdminTimeOff {
  private readonly api = inject(AdminInstituteApiService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loadingStaff = signal(false);
  protected readonly loadingTimeOff = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly toastMessage = signal('');
  protected readonly staff = signal<AdminStaffItem[]>([]);
  protected readonly selectedStaffId = signal<string | null>('institut');
  protected readonly timeOff = signal<AdminTimeOffItem[]>([]);
  protected readonly globalTimeOff = signal<AdminTimeOffItem[]>([]);

  protected readonly hasStaff = computed(() => this.staff().length > 0 || this.selectedStaffId() === 'institut');
  protected readonly isStaffUser = computed(() => this.authService.getCurrentUser()?.role === 'STAFF');
  protected readonly upcomingTimeOff = computed(() => {
    const now = Date.now();
    return this.timeOff()
      .filter((item) => new Date(item.endsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    isAllDay: [true],
    startDate: [''],
    endDate: [''],
    startsAt: [''],
    endsAt: [''],
    reason: ['']
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
    });

    if (this.isStaffUser()) {
      this.selectedStaffId.set('institut');
      this.fetchTimeOff('institut');
    } else {
      this.fetchStaff();
    }
  }

  protected selectStaff(staffId: string): void {
    if (this.selectedStaffId() === staffId || this.loadingTimeOff()) {
      return;
    }

    this.selectedStaffId.set(staffId);
    this.fetchTimeOff(staffId);
  }

  protected submit(): void {
    const staffId = this.selectedStaffId();
    if (this.saving()) {
      return;
    }

    const raw = this.form.getRawValue();
    const reason = raw.reason.trim() || undefined;
    const global = staffId === 'institut';
    if (!global && !staffId) {
      this.errorMessage.set('Veuillez selectionner une praticienne.');
      return;
    }
    this.errorMessage.set('');

    if (raw.isAllDay) {
      const startDate = raw.startDate;
      const endDate = raw.endDate || raw.startDate;

      if (!startDate || !endDate) {
        this.errorMessage.set('Veuillez choisir une date de debut et de fin.');
        return;
      }

      if (endDate < startDate) {
        this.errorMessage.set('La date de fin doit etre apres la date de debut.');
        return;
      }

      const today = this.toYmd(new Date());
      if (startDate < today) {
        this.errorMessage.set('Veuillez choisir des conges a venir.');
        return;
      }

      const days = this.expandDates(startDate, endDate);
      this.saving.set(true);

      Promise.all(
        days.map((date) =>
          global
            ? firstValueFrom(
                this.api.createGlobalTimeOff({
                  isAllDay: true,
                  date,
                  reason
                })
              )
            : firstValueFrom(
                this.api.createTimeOff(staffId!, {
                  isAllDay: true,
                  date,
                  reason
                })
              )
        )
      )
        .then(() => {
          this.form.reset({
            isAllDay: true,
            startDate: '',
            endDate: '',
            startsAt: '',
            endsAt: '',
            reason: ''
          });
          this.showToast(global ? 'Fermeture institut enregistree.' : 'Conges enregistres.');
          if (staffId) {
            this.fetchTimeOff(staffId);
          }
        })
        .catch((error: { error?: { error?: string } }) => {
          this.errorMessage.set(error?.error?.error ?? 'Creation conge impossible.');
        })
        .finally(() => this.saving.set(false));
      return;
    }

    if (!raw.startsAt || !raw.endsAt) {
      this.errorMessage.set('Veuillez choisir un debut et une fin.');
      return;
    }

    const start = new Date(raw.startsAt);
    const end = new Date(raw.endsAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      this.errorMessage.set('Plage horaire invalide.');
      return;
    }

    if (start.getTime() < Date.now()) {
      this.errorMessage.set('Veuillez choisir un creneau futur.');
      return;
    }

    this.saving.set(true);
    if (global) {
      this.api
        .createGlobalTimeOff({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          reason
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.form.reset({
              isAllDay: true,
              startDate: '',
              endDate: '',
              startsAt: '',
              endsAt: '',
              reason: ''
            });
            this.showToast('Fermeture institut enregistree.');
            if (staffId && staffId !== 'institut') {
              this.fetchTimeOff(staffId);
            } else {
              this.fetchTimeOff('institut');
            }
          },
          error: (error: { error?: { error?: string } }) => {
            this.errorMessage.set(error.error?.error ?? 'Creation conge impossible.');
          }
        });
      return;
    }

    this.api
      .createTimeOff(staffId!, {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        reason
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.form.reset({
            isAllDay: true,
            startDate: '',
            endDate: '',
            startsAt: '',
            endsAt: '',
            reason: ''
          });
          this.showToast('Conge enregistre.');
          if (staffId) {
            this.fetchTimeOff(staffId);
          }
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Creation conge impossible.');
        }
      });
  }

  protected remove(itemId: string): void {
    const staffId = this.selectedStaffId();
    if (!staffId || this.saving()) {
      return;
    }

    this.saving.set(true);
    const item = this.timeOff().find((entry) => entry.id === itemId);
    const request = this.isGlobalReason(item?.reason ?? null)
      ? this.api.deleteGlobalTimeOff(itemId)
      : this.api.deleteTimeOff(itemId);
    request
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.showToast('Conge supprime.');
          this.fetchTimeOff(staffId);
        },
        error: () => {
          this.errorMessage.set('Suppression conge impossible.');
        }
      });
  }

  protected formatRange(item: AdminTimeOffItem): string {
    if (item.isAllDay) {
      const start = new Date(item.startsAt);
      return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'full' }).format(start);
    }

    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    return `${new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(start)} - ${new Intl.DateTimeFormat('fr-BE', { timeStyle: 'short' }).format(end)}`;
  }

  protected isGlobalReason(reason: string | null): boolean {
    return Boolean(reason && reason.trim().startsWith('[GLOBAL]'));
  }

  protected sourceLabel(item: AdminTimeOffItem): string {
    if (this.isGlobalReason(item.reason)) {
      return 'Institut';
    }

    const selected = this.selectedStaffId();
    if (selected && selected !== 'institut') {
      return this.staff().find((member) => member.id === selected)?.name ?? 'Praticienne';
    }

    return 'Praticienne';
  }

  protected displayReason(reason: string | null): string {
    if (!reason) {
      return 'Sans motif';
    }

    return reason.replace(/^\[GLOBAL\]\s*/i, '');
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
            this.selectedStaffId.set('institut');
            this.timeOff.set([]);
            return;
          }

          this.selectedStaffId.set('institut');
          this.fetchTimeOff('institut');
        },
        error: () => {
          this.staff.set([]);
          this.selectedStaffId.set('institut');
          this.fetchTimeOff('institut');
          this.errorMessage.set("Liste praticiennes indisponible. Affichage des conges institut uniquement.");
        }
      });
  }

  private fetchTimeOff(staffId: string): void {
    this.loadingTimeOff.set(true);
    this.errorMessage.set('');

    if (staffId === 'institut') {
      this.api
        .listGlobalTimeOff()
        .pipe(finalize(() => this.loadingTimeOff.set(false)))
        .subscribe({
          next: (items) => {
            this.globalTimeOff.set(items);
            this.timeOff.set(items);
          },
          error: () => {
            this.globalTimeOff.set([]);
            this.timeOff.set([]);
            this.errorMessage.set('Impossible de charger les conges.');
          }
        });
      return;
    }

    Promise.all([firstValueFrom(this.api.listTimeOff(staffId)), firstValueFrom(this.api.listGlobalTimeOff())])
      .then(([staffItems, globalItems]) => {
        const personalOnly = (staffItems ?? []).filter((item) => !this.isGlobalReason(item.reason));
        const merged = [...(globalItems ?? []), ...personalOnly].sort(
          (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        );
        this.globalTimeOff.set(globalItems ?? []);
        this.timeOff.set(merged);
      })
      .catch(() => {
        this.globalTimeOff.set([]);
        this.timeOff.set([]);
        this.errorMessage.set('Impossible de charger les conges.');
      })
      .finally(() => this.loadingTimeOff.set(false));
  }

  private expandDates(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    while (cursor <= end) {
      dates.push(this.toYmd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  private toYmd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 2600);
  }
}
