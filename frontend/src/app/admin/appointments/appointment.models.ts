export type AppointmentStatus = 'confirmed' | 'pending' | 'blocked' | 'cancelled';

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
  clientPhone?: string;
  clientEmail?: string;
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

export interface AppointmentHistoryItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  deletedAt?: string | null;
  canceledAt?: string | null;
  totalPrice: number;
  notes?: string | null;
  createdAt: string;
  client: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  staff: {
    id: string;
    name: string;
  };
  services: string[];
}

export interface AppointmentHistoryResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: AppointmentHistoryItem[];
}
