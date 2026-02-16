import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Appointment, AppointmentUpsertPayload } from './appointment.models';

export function hasOverlap(
  aStartIso: string,
  aEndIso: string,
  bStartIso: string,
  bEndIso: string
): boolean {
  const aStart = new Date(aStartIso).getTime();
  const aEnd = new Date(aEndIso).getTime();
  const bStart = new Date(bStartIso).getTime();
  const bEnd = new Date(bEndIso).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function addMinutes(iso: string, minutes: number): string {
  const start = new Date(iso).getTime();
  return new Date(start + minutes * 60_000).toISOString();
}

@Injectable({ providedIn: 'root' })
export class AppointmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly adminBaseUrl = `${environment.apiBaseUrl}/api/admin/appointments`;
  private readonly publicBaseUrl = `${environment.apiBaseUrl}/api/appointments`;

  private fallbackAppointments: Appointment[] = [];

  setFallbackAppointments(appointments: Appointment[]): void {
    this.fallbackAppointments = appointments.slice();
  }

  checkConflict(
    practitionerId: string,
    startAtIso: string,
    durationMin: number,
    excludeAppointmentId?: string
  ): Observable<{ conflict: boolean; conflictWith?: Appointment }> {
    const params = new HttpParams({
      fromObject: {
        practitionerId,
        startAt: startAtIso,
        durationMin: String(durationMin),
        ...(excludeAppointmentId ? { excludeAppointmentId } : {})
      }
    });

    return this.http
      .get<{ conflict: boolean; conflictWith?: Appointment }>(`${this.adminBaseUrl}/conflicts`, { params })
      .pipe(catchError(() => of(this.checkConflictFromFallback(practitionerId, startAtIso, durationMin, excludeAppointmentId))));
  }

  createAppointment(payload: AppointmentUpsertPayload): Observable<Appointment> {
    return this.http.post<Appointment>(this.adminBaseUrl, payload).pipe(
      catchError(() => {
        const firstService = payload.services[0];
        const client = payload.clientDraft;

        if (!firstService || !client?.firstName || !client?.lastName) {
          return throwError(() => new Error('Informations insuffisantes pour creer le rendez-vous.'));
        }

        return this.http
          .post<{
            appointmentId: string;
            startAt: string;
            endAt: string;
            staffName: string;
            serviceName: string;
          }>(this.publicBaseUrl, {
            serviceId: firstService.serviceId,
            staffId: payload.practitionerId,
            startAt: payload.startAt,
            notes: payload.notes,
            client: {
              firstName: client.firstName,
              lastName: client.lastName,
              email: client.email,
              phone: client.phone
            }
          })
          .pipe(
            map((result) => ({
              id: result.appointmentId,
              practitionerId: payload.practitionerId,
              practitionerName: result.staffName,
              startAt: result.startAt,
              durationMin: payload.durationMin,
              services: payload.services,
              clientName: `${client.firstName} ${client.lastName}`.trim(),
              notes: payload.notes,
              status: payload.status
            }))
          );
      })
    );
  }

  updateAppointment(id: string, payload: AppointmentUpsertPayload): Observable<Appointment> {
    return this.http.patch<Appointment>(`${this.adminBaseUrl}/${id}`, payload).pipe(
      catchError(() => {
        // TODO: brancher endpoint backend d'edition admin des RDV.
        const existing = this.fallbackAppointments.find((item) => item.id === id);
        if (!existing) {
          return throwError(() => new Error("Edition impossible: rendez-vous introuvable."));
        }

        const updated: Appointment = {
          ...existing,
          practitionerId: payload.practitionerId,
          startAt: payload.startAt,
          durationMin: payload.durationMin,
          services: payload.services,
          clientId: payload.clientId,
          clientName: payload.clientDraft ? `${payload.clientDraft.firstName} ${payload.clientDraft.lastName}`.trim() : existing.clientName,
          notes: payload.notes,
          status: payload.status
        };

        return of(updated);
      })
    );
  }

  private checkConflictFromFallback(
    practitionerId: string,
    startAtIso: string,
    durationMin: number,
    excludeAppointmentId?: string
  ): { conflict: boolean; conflictWith?: Appointment } {
    const endAtIso = addMinutes(startAtIso, durationMin);
    const conflictWith = this.fallbackAppointments.find((item) => {
      if (item.practitionerId !== practitionerId) {
        return false;
      }
      if (excludeAppointmentId && item.id === excludeAppointmentId) {
        return false;
      }
      const existingEnd = addMinutes(item.startAt, item.durationMin);
      return hasOverlap(startAtIso, endAtIso, item.startAt, existingEnd);
    });

    return {
      conflict: Boolean(conflictWith),
      conflictWith
    };
  }
}

