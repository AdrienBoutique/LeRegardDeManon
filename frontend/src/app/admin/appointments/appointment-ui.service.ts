import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  Appointment,
  AppointmentDraft,
  AppointmentServiceItem,
  ClientLite,
  PractitionerLite
} from './appointment.models';

function createDefaultDraft(): AppointmentDraft {
  return {
    services: [],
    durationMin: 30,
    priceTotal: 0,
    status: 'confirmed'
  };
}

@Injectable({ providedIn: 'root' })
export class AppointmentUiService {
  readonly isOpen$ = new BehaviorSubject<boolean>(false);
  readonly mode$ = new BehaviorSubject<'create' | 'edit'>('create');
  readonly draft$ = new BehaviorSubject<AppointmentDraft>(createDefaultDraft());
  readonly editingId$ = new BehaviorSubject<string | null>(null);

  readonly practitioners$ = new BehaviorSubject<PractitionerLite[]>([]);
  readonly servicesCatalog$ = new BehaviorSubject<AppointmentServiceItem[]>([]);
  readonly clients$ = new BehaviorSubject<ClientLite[]>([]);
  readonly appointments$ = new BehaviorSubject<Appointment[]>([]);

  readonly saved$ = new Subject<void>();

  openCreate(prefill?: Partial<AppointmentDraft>): void {
    this.mode$.next('create');
    this.editingId$.next(null);
    this.draft$.next({
      ...createDefaultDraft(),
      ...prefill,
      services: prefill?.services ?? [],
      durationMin: prefill?.durationMin ?? this.sumDuration(prefill?.services ?? []),
      priceTotal: prefill?.priceTotal ?? this.sumPrice(prefill?.services ?? [])
    });
    this.isOpen$.next(true);
  }

  openEdit(appointment: Appointment): void {
    this.mode$.next('edit');
    this.editingId$.next(appointment.id);
    this.draft$.next({
      practitionerId: appointment.practitionerId,
      startAt: appointment.startAt,
      services: appointment.services ?? [],
      durationMin: appointment.durationMin,
      priceTotal: this.sumPrice(appointment.services ?? []),
      clientId: appointment.clientId,
      clientDraft: this.nameToClientDraft(appointment.clientName),
      notes: appointment.notes,
      status: appointment.status
    });
    this.isOpen$.next(true);
  }

  close(): void {
    this.isOpen$.next(false);
    this.mode$.next('create');
    this.editingId$.next(null);
    this.draft$.next(createDefaultDraft());
  }

  setPartial(patch: Partial<AppointmentDraft>): void {
    const nextDraft = {
      ...this.draft$.value,
      ...patch
    };

    if (patch.services) {
      nextDraft.durationMin = this.sumDuration(patch.services);
      nextDraft.priceTotal = this.sumPrice(patch.services);
    }

    this.draft$.next(nextDraft);
  }

  setContext(input: {
    practitioners?: PractitionerLite[];
    servicesCatalog?: AppointmentServiceItem[];
    clients?: ClientLite[];
    appointments?: Appointment[];
  }): void {
    if (input.practitioners) {
      this.practitioners$.next(input.practitioners);
    }
    if (input.servicesCatalog) {
      this.servicesCatalog$.next(input.servicesCatalog);
    }
    if (input.clients) {
      this.clients$.next(input.clients);
    }
    if (input.appointments) {
      this.appointments$.next(input.appointments);
    }
  }

  notifySaved(): void {
    this.saved$.next();
  }

  private sumDuration(services: AppointmentServiceItem[]): number {
    return services.reduce((sum, item) => sum + item.durationMin, 0);
  }

  private sumPrice(services: AppointmentServiceItem[]): number {
    return services.reduce((sum, item) => sum + item.price, 0);
  }

  private nameToClientDraft(fullName?: string): AppointmentDraft['clientDraft'] {
    if (!fullName) {
      return undefined;
    }

    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    return {
      firstName: firstName || '',
      lastName: rest.join(' ')
    };
  }
}

