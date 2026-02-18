import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../../lib/time";

type SmsAppointment = {
  clientName: string;
  startsAt: Date;
};

function formatDate(input: Date): string {
  return DateTime.fromJSDate(input, { zone: "utc" }).setZone(BRUSSELS_TIMEZONE).toFormat("dd/MM 'a' HH:mm");
}

function shortInstituteName(): string {
  return process.env.INSTITUTE_NAME?.trim() || "Le Regard de Manon";
}

function shortInfoUrl(): string {
  return process.env.BOOKING_MANAGE_URL?.trim() || "leregarddemanon.com";
}

export function buildSmsConfirmation(appointment: SmsAppointment): string {
  return `${shortInstituteName()}: RDV confirme le ${formatDate(appointment.startsAt)}. Infos: ${shortInfoUrl()}`;
}

export function buildSmsReminder24h(appointment: SmsAppointment): string {
  return `${shortInstituteName()}: rappel RDV demain a ${formatDate(appointment.startsAt)}. Infos: ${shortInfoUrl()}`;
}

export function buildSmsReminder2h(appointment: SmsAppointment): string {
  return `${shortInstituteName()}: rappel RDV dans ~2h a ${formatDate(appointment.startsAt)}. Infos: ${shortInfoUrl()}`;
}
