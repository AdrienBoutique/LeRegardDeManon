import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminPractitionersApiService } from '../../core/services/admin-practitioners-api.service';
import { AuthService } from '../../core/services/auth.service';
import { StaffPlanningService } from '../../core/services/staff-planning.service';

@Component({
  selector: 'app-staff-planning',
  imports: [ReactiveFormsModule],
  templateUrl: './staff-planning.html',
  styleUrl: './staff-planning.scss'
})
export class StaffPlanning {
  private readonly planningApi = inject(StaffPlanningService);
  private readonly practitionersApi = inject(AdminPractitionersApiService);
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly date = signal(this.todayYmd());
  protected readonly appointments = signal<Array<{
    id: string;
    startAt: string;
    endAt: string;
    clientName: string;
    services: string;
    status: string;
  }>>([]);
  protected readonly practitioners = signal<Array<{ id: string; name: string }>>([]);

  protected readonly filterForm = this.formBuilder.nonNullable.group({
    practitionerId: ['']
  });

  protected readonly isAdmin = computed(() => this.authService.getCurrentUser()?.role === 'ADMIN');

  constructor() {
    if (this.isAdmin()) {
      this.loadPractitioners();
    }
    this.fetch();
  }

  protected setDate(value: string): void {
    this.date.set(value);
    this.fetch();
  }

  protected fetch(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    const practitionerId =
      this.isAdmin() ? this.filterForm.controls.practitionerId.value || undefined : undefined;

    this.planningApi
      .getMyPlanning(this.date(), practitionerId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.appointments.set(
            response.appointments.map((item) => ({
              id: item.id,
              startAt: item.startAt,
              endAt: item.endAt,
              clientName: item.client.name,
              services: item.items.map((service) => service.serviceName).join(', '),
              status: item.status
            }))
          );
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Impossible de charger le planning.');
          this.appointments.set([]);
        }
      });
  }

  protected onPractitionerChange(value: string): void {
    this.filterForm.controls.practitionerId.setValue(value);
    this.fetch();
  }

  protected formatHour(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private todayYmd(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private loadPractitioners(): void {
    this.practitionersApi.listPractitioners().subscribe({
      next: (items) => {
        const activeItems = items.filter((item) => item.status !== 'inactive');
        this.practitioners.set(activeItems.map((item) => ({ id: item.id, name: item.name })));

        if (activeItems.length > 0 && !this.filterForm.controls.practitionerId.value) {
          this.filterForm.controls.practitionerId.setValue(activeItems[0].id);
          this.fetch();
        }
      },
      error: () => {
        this.practitioners.set([]);
      }
    });
  }
}
