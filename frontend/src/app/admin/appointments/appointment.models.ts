export type AppointmentStatus = 'confirmed' | 'pending' | 'blocked';

export interface AppointmentServiceItem {
  serviceId: string;
  name: string;
  durationMin: number;
  price: number;
}

export interface ClientLite {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}

export interface PractitionerLite {
  id: string;
  name: string;
}

export interface AvailabilityRuleLite {
  staffId?: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface AppointmentDraft {
  practitionerId?: string;
  startAt?: string;
  services: AppointmentServiceItem[];
  durationMin: number;
  priceTotal: number;
  clientId?: string;
  clientDraft?: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
  };
  notes?: string;
  status: AppointmentStatus;
}

export interface Appointment {
  id: string;
  practitionerId: string;
  practitionerName?: string;
  startAt: string;
  durationMin: number;
  services: AppointmentServiceItem[];
  clientId?: string;
  clientName?: string;
  notes?: string;
  status: AppointmentStatus;
}

export interface AppointmentUpsertPayload {
  practitionerId: string;
  startAt: string;
  durationMin: number;
  services: AppointmentServiceItem[];
  clientId?: string;
  clientDraft?: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
  };
  notes?: string;
  status: AppointmentStatus;
}
