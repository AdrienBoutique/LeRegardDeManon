import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../../lib/time";

type SmsAppointment = {
  clientName: string;
  startsAt: Date;
};

export const DEFAULT_SMS_TEMPLATE_CONFIRMATION =
  "{establishmentName} : bonjour {clientName}, votre rendez-vous est confirme le {date} a {time}. A bientot.";
export const DEFAULT_SMS_TEMPLATE_REMINDER_24H =
  "{establishmentName} : rappel de votre rendez-vous demain, le {date} a {time}. A bientot.";
export const DEFAULT_SMS_TEMPLATE_REMINDER_2H =
  "{establishmentName} : rappel, votre rendez-vous est dans 2h a {time}. A tout a l'heure.";
export const DEFAULT_SMS_TEMPLATE_CANCELLATION =
  "{establishmentName} : votre rendez-vous du {date} a {time} a ete annule. Merci de nous contacter si besoin.";
export const DEFAULT_SMS_TEMPLATE_RESCHEDULE =
  "{establishmentName} : votre rendez-vous a ete modifie. Nouveau creneau : {date} a {time}.";

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
  return `${shortInstituteName()} : bonjour ${appointment.clientName}, votre rendez-vous est confirme le ${formatDate(appointment.startsAt)}. A bientot.`;
}

export function buildSmsReminder24h(appointment: SmsAppointment): string {
  return `${shortInstituteName()} : rappel de votre rendez-vous demain, le ${formatDate(appointment.startsAt)}. A bientot.`;
}

export function buildSmsReminder2h(appointment: SmsAppointment): string {
  return `${shortInstituteName()} : rappel, votre rendez-vous est dans 2h a ${formatDate(appointment.startsAt)}. A tout a l'heure.`;
}

export function buildSmsCancellation(appointment: SmsAppointment): string {
  return `${shortInstituteName()} : votre rendez-vous du ${formatDate(appointment.startsAt)} a ete annule. Merci de nous contacter si besoin.`;
}

export function buildSmsReschedule(appointment: SmsAppointment): string {
  return `${shortInstituteName()} : votre rendez-vous a ete modifie. Nouveau creneau : ${formatDate(appointment.startsAt)}.`;
}
