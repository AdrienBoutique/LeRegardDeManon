import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AdminClientItem, AdminClientStats, AdminClientsApiService } from '../../../core/services/admin-clients-api.service';

function contactValidator(control: AbstractControl): ValidationErrors | null {
  const email = (control.get('email')?.value as string | null)?.trim();
  const phone = (control.get('phone')?.value as string | null)?.trim();
  return email || phone ? null : { contactRequired: true };
}

@Component({
  selector: 'app-admin-clients',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-clients.html',
  styleUrl: './admin-clients.scss'
})
export class AdminClients {
  private readonly api = inject(AdminClientsApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly clients = signal<AdminClientItem[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly pendingDeleteId = signal<string | null>(null);
  protected readonly statsOpen = signal(false);
  protected readonly statsLoading = signal(false);
  protected readonly statsError = signal('');
  protected readonly activeStatsClient = signal<AdminClientItem | null>(null);
  protected readonly clientStats = signal<AdminClientStats | null>(null);

  protected readonly form = this.formBuilder.group(
    {
      firstName: this.formBuilder.nonNullable.control('', [Validators.required]),
      lastName: this.formBuilder.nonNullable.control('', [Validators.required]),
      email: this.formBuilder.nonNullable.control('', [Validators.email]),
      phone: this.formBuilder.nonNullable.control(''),
      notes: this.formBuilder.nonNullable.control('')
    },
    { validators: [contactValidator] }
  );

  protected readonly filteredClients = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.clients();
    }

    return this.clients().filter((client) => {
      const haystack = `${client.firstName} ${client.lastName} ${client.email ?? ''} ${client.phone ?? ''} ${client.notes ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  constructor() {
    this.fetchClients();
  }

  protected fetchClients(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.api
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.clients.set(items),
        error: () => this.errorMessage.set('Impossible de charger les clientes.')
      });
  }

  protected setSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected openCreateModal(): void {
    this.editingId.set(null);
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      notes: ''
    });
    this.errorMessage.set('');
    this.modalOpen.set(true);
  }

  protected openEditModal(client: AdminClientItem): void {
    this.editingId.set(client.id);
    this.form.reset({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email ?? '',
      phone: client.phone ?? '',
      notes: client.notes ?? ''
    });
    this.errorMessage.set('');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected openStats(client: AdminClientItem): void {
    this.activeStatsClient.set(client);
    this.clientStats.set(null);
    this.statsError.set('');
    this.statsOpen.set(true);
    this.statsLoading.set(true);

    this.api
      .getStats(client.id)
      .pipe(finalize(() => this.statsLoading.set(false)))
      .subscribe({
        next: (stats) => this.clientStats.set(stats),
        error: () => this.statsError.set('Impossible de charger les statistiques de la cliente.')
      });
  }

  protected closeStats(): void {
    this.statsOpen.set(false);
    this.statsError.set('');
    this.clientStats.set(null);
  }

  protected requestDelete(clientId: string): void {
    this.pendingDeleteId.set(clientId);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  protected deleteClient(client: AdminClientItem): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    this.api
      .delete(client.id)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.pendingDeleteId.set(null);
          this.fetchClients();
        },
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Suppression impossible.');
        }
      });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim() || null,
      phone: raw.phone.trim() || null,
      notes: raw.notes.trim() || null
    };

    this.saving.set(true);
    this.errorMessage.set('');

    const editingId = this.editingId();
    const request$ = editingId ? this.api.update(editingId, payload) : this.api.create(payload);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.closeModal();
        this.fetchClients();
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage.set(error.error?.error ?? 'Enregistrement impossible.');
      }
    });
  }

  protected fullName(client: AdminClientItem): string {
    return `${client.firstName} ${client.lastName}`.trim();
  }

  protected formatCurrency(value: number): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value ?? 0);
  }

  protected formatDate(dateIso: string | null | undefined): string {
    if (!dateIso) {
      return '-';
    }
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  protected formatPercent(ratio: number): string {
    return `${Math.round((ratio ?? 0) * 100)}%`;
  }

  protected mapStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'CONFIRMED':
        return 'Confirme';
      case 'COMPLETED':
        return 'Termine';
      case 'CANCELLED':
        return 'Annule';
      case 'NO_SHOW':
        return 'Absence';
      case 'REJECTED':
        return 'Refuse';
      default:
        return status;
    }
  }
}
