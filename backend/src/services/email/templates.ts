import { DateTime } from "luxon";
import { BRUSSELS_TIMEZONE } from "../../lib/time";

export type InstituteEmailInfo = {
  name: string;
  address?: string | null;
  manageUrl?: string | null;
};

export type AppointmentEmailInfo = {
  appointmentId: string;
  clientName: string;
  startsAt: Date;
  staffName: string;
  serviceSummary: string;
  notes?: string | null;
};

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTimeBrussels(input: Date): string {
  return DateTime.fromJSDate(input, { zone: "utc" })
    .setZone(BRUSSELS_TIMEZONE)
    .setLocale("fr-BE")
    .toFormat("cccc d LLLL yyyy 'a' HH:mm");
}

function instituteFooter(institute: InstituteEmailInfo): { html: string; text: string } {
  const addressLine = institute.address ? `<div>${escapeHtml(institute.address)}</div>` : "";
  const textAddress = institute.address ? `${institute.address}\n` : "";

  return {
    html: `<p style="margin:24px 0 0;color:#5f5044;">A bientot,<br /><strong>${escapeHtml(institute.name)}</strong><br />${addressLine}</p>`,
    text: `\nA bientot,\n${institute.name}\n${textAddress}`,
  };
}

export function buildConfirmationEmail(
  appointment: AppointmentEmailInfo,
  institute: InstituteEmailInfo
): { subject: string; html: string; text: string } {
  const when = formatDateTimeBrussels(appointment.startsAt);
  const safeName = escapeHtml(appointment.clientName);
  const safeStaff = escapeHtml(appointment.staffName);
  const safeService = escapeHtml(appointment.serviceSummary);
  const footer = instituteFooter(institute);
  const manageLine = institute.manageUrl
    ? `<p style="margin:16px 0 0;">Annulation ou modification: <a href="${escapeHtml(institute.manageUrl)}">${escapeHtml(
        institute.manageUrl
      )}</a></p>`
    : `<p style="margin:16px 0 0;">Pour annuler ou reprogrammer, repondez a cet email.</p>`;

  return {
    subject: `Confirmation de rendez-vous - ${institute.name}`,
    html: `<div style="font-family:Arial,sans-serif;color:#2f241c;line-height:1.5;">
      <p>Bonjour ${safeName},</p>
      <p>Votre rendez-vous est bien confirme.</p>
      <p><strong>Date et heure:</strong> ${escapeHtml(when)}<br />
      <strong>Prestation:</strong> ${safeService}<br />
      <strong>Praticienne:</strong> ${safeStaff}</p>
      ${manageLine}
      ${footer.html}
    </div>`,
    text:
      `Bonjour ${appointment.clientName},\n\n` +
      `Votre rendez-vous est bien confirme.\n` +
      `Date et heure: ${when}\n` +
      `Prestation: ${appointment.serviceSummary}\n` +
      `Praticienne: ${appointment.staffName}\n\n` +
      (institute.manageUrl
        ? `Annulation ou modification: ${institute.manageUrl}\n`
        : "Pour annuler ou reprogrammer, repondez a cet email.\n") +
      footer.text,
  };
}

export function buildReminder24hEmail(
  appointment: AppointmentEmailInfo,
  institute: InstituteEmailInfo
): { subject: string; html: string; text: string } {
  const when = formatDateTimeBrussels(appointment.startsAt);
  const safeName = escapeHtml(appointment.clientName);
  const safeStaff = escapeHtml(appointment.staffName);
  const safeService = escapeHtml(appointment.serviceSummary);
  const footer = instituteFooter(institute);
  const manageLine = institute.manageUrl
    ? `<p style="margin:16px 0 0;">Besoin de deplacer le rendez-vous? <a href="${escapeHtml(
        institute.manageUrl
      )}">Gerer mon rendez-vous</a></p>`
    : `<p style="margin:16px 0 0;">Besoin de modifier? Repondez a cet email.</p>`;

  return {
    subject: `Rappel 24h - rendez-vous demain chez ${institute.name}`,
    html: `<div style="font-family:Arial,sans-serif;color:#2f241c;line-height:1.5;">
      <p>Bonjour ${safeName},</p>
      <p>Petit rappel: votre rendez-vous est prevu dans environ 24h.</p>
      <p><strong>Date et heure:</strong> ${escapeHtml(when)}<br />
      <strong>Prestation:</strong> ${safeService}<br />
      <strong>Praticienne:</strong> ${safeStaff}</p>
      ${manageLine}
      ${footer.html}
    </div>`,
    text:
      `Bonjour ${appointment.clientName},\n\n` +
      `Rappel: votre rendez-vous est prevu dans environ 24h.\n` +
      `Date et heure: ${when}\n` +
      `Prestation: ${appointment.serviceSummary}\n` +
      `Praticienne: ${appointment.staffName}\n\n` +
      (institute.manageUrl
        ? `Modifier/annuler: ${institute.manageUrl}\n`
        : "Pour modifier, repondez a cet email.\n") +
      footer.text,
  };
}
