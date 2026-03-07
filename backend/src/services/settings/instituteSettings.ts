import { BookingMode, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import {
  DEFAULT_SMS_TEMPLATE_CANCELLATION,
  DEFAULT_SMS_TEMPLATE_CONFIRMATION,
  DEFAULT_SMS_TEMPLATE_REMINDER_24H,
  DEFAULT_SMS_TEMPLATE_REMINDER_2H,
  DEFAULT_SMS_TEMPLATE_RESCHEDULE,
} from "../sms/templates";

const SINGLETON_KEY = "default";
type AvailabilityDisplayMode = "dots" | "colors";
type NullableString = string | null;

type InstituteSettingsRow = {
  id: string;
  instituteId: string | null;
  bookingMode: BookingMode | string;
  smsEnabled: boolean;
  smsConfirmationEnabled: boolean;
  smsReminder24hEnabled: boolean;
  smsReminder2hEnabled: boolean;
  smsCancellationEnabled: boolean;
  smsRescheduleEnabled: boolean;
  smsSender: string | null;
  smsTemplateConfirmation: string | null;
  smsTemplateReminder24h: string | null;
  smsTemplateReminder2h: string | null;
  smsTemplateCancellation: string | null;
  smsTemplateReschedule: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  showAvailabilityDots?: boolean | null;
  availabilityDisplayMode?: string | null;
};

type InstituteSettingsModel = {
  id: string;
  instituteId: string | null;
  bookingMode: BookingMode;
  showAvailabilityDots: boolean;
  availabilityDisplayMode: AvailabilityDisplayMode;
  smsEnabled: boolean;
  smsConfirmationEnabled: boolean;
  smsReminder24hEnabled: boolean;
  smsReminder2hEnabled: boolean;
  smsCancellationEnabled: boolean;
  smsRescheduleEnabled: boolean;
  smsSender: string | null;
  smsTemplateConfirmation: string | null;
  smsTemplateReminder24h: string | null;
  smsTemplateReminder2h: string | null;
  smsTemplateCancellation: string | null;
  smsTemplateReschedule: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let showAvailabilityDotsColumnExists: boolean | null = null;
let availabilityDisplayModeColumnExists: boolean | null = null;

function normalizeBookingMode(value: BookingMode | string): BookingMode {
  return value === BookingMode.AUTO_INTELLIGENT ? BookingMode.AUTO_INTELLIGENT : BookingMode.MANUAL;
}

function normalizeAvailabilityDisplayMode(value: string | null | undefined): AvailabilityDisplayMode {
  return value === "colors" ? "colors" : "dots";
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeNullableString(value: string | null | undefined): NullableString {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toSqlNullableString(value: string | null | undefined): string {
  const normalized = normalizeNullableString(value);
  if (normalized === null) {
    return "NULL";
  }
  return `'${normalized.replace(/'/g, "''")}'`;
}

function toInstituteSettingsModel(row: InstituteSettingsRow): InstituteSettingsModel {
  const availabilityDisplayMode = row.availabilityDisplayMode
    ? normalizeAvailabilityDisplayMode(row.availabilityDisplayMode)
    : row.showAvailabilityDots === false
      ? "colors"
      : "dots";

  return {
    id: row.id,
    instituteId: row.instituteId,
    bookingMode: normalizeBookingMode(row.bookingMode),
    showAvailabilityDots: availabilityDisplayMode === "dots",
    availabilityDisplayMode,
    smsEnabled: row.smsEnabled,
    smsConfirmationEnabled: row.smsConfirmationEnabled,
    smsReminder24hEnabled: row.smsReminder24hEnabled,
    smsReminder2hEnabled: row.smsReminder2hEnabled,
    smsCancellationEnabled: row.smsCancellationEnabled,
    smsRescheduleEnabled: row.smsRescheduleEnabled,
    smsSender: normalizeNullableString(row.smsSender) ?? "Manon",
    smsTemplateConfirmation: normalizeNullableString(row.smsTemplateConfirmation),
    smsTemplateReminder24h: normalizeNullableString(row.smsTemplateReminder24h),
    smsTemplateReminder2h: normalizeNullableString(row.smsTemplateReminder2h),
    smsTemplateCancellation: normalizeNullableString(row.smsTemplateCancellation),
    smsTemplateReschedule: normalizeNullableString(row.smsTemplateReschedule),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

async function hasShowAvailabilityDotsColumn(): Promise<boolean> {
  if (showAvailabilityDotsColumnExists !== null) {
    return showAvailabilityDotsColumnExists;
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'InstituteSettings'
        AND column_name = 'showAvailabilityDots'
    )::boolean AS "exists"
  `;

  showAvailabilityDotsColumnExists = Boolean(rows[0]?.exists);
  return showAvailabilityDotsColumnExists;
}

async function hasAvailabilityDisplayModeColumn(): Promise<boolean> {
  if (availabilityDisplayModeColumnExists !== null) {
    return availabilityDisplayModeColumnExists;
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'InstituteSettings'
        AND column_name = 'availabilityDisplayMode'
    )::boolean AS "exists"
  `;

  availabilityDisplayModeColumnExists = Boolean(rows[0]?.exists);
  return availabilityDisplayModeColumnExists;
}

async function findFirstSettings(withShowDots: boolean, withDisplayMode: boolean): Promise<InstituteSettingsRow | null> {
  const showDotsSelect = withShowDots ? Prisma.sql`,"showAvailabilityDots"` : Prisma.empty;
  const displayModeSelect = withDisplayMode ? Prisma.sql`,"availabilityDisplayMode"` : Prisma.empty;
  const query = Prisma.sql`
    SELECT
      "id",
      "instituteId",
      "bookingMode",
      "smsEnabled",
      "smsConfirmationEnabled",
      "smsReminder24hEnabled",
      "smsReminder2hEnabled",
      "smsCancellationEnabled",
      "smsRescheduleEnabled",
      "smsSender",
      "smsTemplateConfirmation",
      "smsTemplateReminder24h",
      "smsTemplateReminder2h",
      "smsTemplateCancellation",
      "smsTemplateReschedule",
      "createdAt",
      "updatedAt"
      ${showDotsSelect}
      ${displayModeSelect}
    FROM "InstituteSettings"
    ORDER BY "createdAt" ASC
    LIMIT 1
  `;

  const rows = await prisma.$queryRaw<InstituteSettingsRow[]>(query);
  return rows[0] ?? null;
}

async function createDefaultSettings(withShowDots: boolean, withDisplayMode: boolean): Promise<InstituteSettingsRow> {
  const id = randomUUID();
  const insertColumns = [
    `"id"`,
    `"instituteId"`,
    `"bookingMode"`,
    `"smsEnabled"`,
    `"smsConfirmationEnabled"`,
    `"smsReminder24hEnabled"`,
    `"smsReminder2hEnabled"`,
    `"smsCancellationEnabled"`,
    `"smsRescheduleEnabled"`,
    `"smsSender"`,
    `"smsTemplateConfirmation"`,
    `"smsTemplateReminder24h"`,
    `"smsTemplateReminder2h"`,
    `"smsTemplateCancellation"`,
    `"smsTemplateReschedule"`,
  ];
  const insertValues = [
    `'${id}'`,
    `'${SINGLETON_KEY}'`,
    `'${BookingMode.MANUAL}'::"BookingMode"`,
    `true`,
    `true`,
    `true`,
    `false`,
    `true`,
    `true`,
    `'Manon'`,
    toSqlNullableString(DEFAULT_SMS_TEMPLATE_CONFIRMATION),
    toSqlNullableString(DEFAULT_SMS_TEMPLATE_REMINDER_24H),
    toSqlNullableString(DEFAULT_SMS_TEMPLATE_REMINDER_2H),
    toSqlNullableString(DEFAULT_SMS_TEMPLATE_CANCELLATION),
    toSqlNullableString(DEFAULT_SMS_TEMPLATE_RESCHEDULE),
  ];
  const returnColumns = [
    `"id"`,
    `"instituteId"`,
    `"bookingMode"`,
    `"smsEnabled"`,
    `"smsConfirmationEnabled"`,
    `"smsReminder24hEnabled"`,
    `"smsReminder2hEnabled"`,
    `"smsCancellationEnabled"`,
    `"smsRescheduleEnabled"`,
    `"smsSender"`,
    `"smsTemplateConfirmation"`,
    `"smsTemplateReminder24h"`,
    `"smsTemplateReminder2h"`,
    `"smsTemplateCancellation"`,
    `"smsTemplateReschedule"`,
    `"createdAt"`,
    `"updatedAt"`,
  ];

  if (withShowDots) {
    insertColumns.push(`"showAvailabilityDots"`);
    insertValues.push(`true`);
    returnColumns.push(`"showAvailabilityDots"`);
  }

  if (withDisplayMode) {
    insertColumns.push(`"availabilityDisplayMode"`);
    insertValues.push(`'dots'`);
    returnColumns.push(`"availabilityDisplayMode"`);
  }

  const query = `INSERT INTO "InstituteSettings" (${insertColumns.join(", ")}, "createdAt", "updatedAt")
     VALUES (${insertValues.join(", ")}, NOW(), NOW())
     RETURNING ${returnColumns.join(", ")}`;

  const rows = await prisma.$queryRawUnsafe<InstituteSettingsRow[]>(query);
  return rows[0];
}

export async function getInstituteSettings(): Promise<InstituteSettingsModel> {
  const withShowDots = await hasShowAvailabilityDotsColumn();
  const withDisplayMode = await hasAvailabilityDisplayModeColumn();
  const existing = await findFirstSettings(withShowDots, withDisplayMode);
  if (existing) {
    return toInstituteSettingsModel(existing);
  }

  const created = await createDefaultSettings(withShowDots, withDisplayMode);
  return toInstituteSettingsModel(created);
}

export async function setInstituteSettings(input: {
  bookingMode?: BookingMode;
  showAvailabilityDots?: boolean;
  availabilityDisplayMode?: AvailabilityDisplayMode;
  smsEnabled?: boolean;
  smsConfirmationEnabled?: boolean;
  smsReminder24hEnabled?: boolean;
  smsReminder2hEnabled?: boolean;
  smsCancellationEnabled?: boolean;
  smsRescheduleEnabled?: boolean;
  smsSender?: string | null;
  smsTemplateConfirmation?: string | null;
  smsTemplateReminder24h?: string | null;
  smsTemplateReminder2h?: string | null;
  smsTemplateCancellation?: string | null;
  smsTemplateReschedule?: string | null;
}): Promise<InstituteSettingsModel> {
  const current = await getInstituteSettings();
  const withShowDots = await hasShowAvailabilityDotsColumn();
  const withDisplayMode = await hasAvailabilityDisplayModeColumn();

  const nextBookingMode = input.bookingMode ?? current.bookingMode;
  const bookingModeValue = normalizeBookingMode(nextBookingMode);
  const nextAvailabilityDisplayMode = input.availabilityDisplayMode
    ? normalizeAvailabilityDisplayMode(input.availabilityDisplayMode)
    : input.showAvailabilityDots === undefined
      ? current.availabilityDisplayMode
      : input.showAvailabilityDots
        ? "dots"
        : "colors";
  const nextShowDots = nextAvailabilityDisplayMode === "dots";
  const nextSmsEnabled = input.smsEnabled ?? current.smsEnabled;
  const nextSmsConfirmationEnabled = input.smsConfirmationEnabled ?? current.smsConfirmationEnabled;
  const nextSmsReminder24hEnabled = input.smsReminder24hEnabled ?? current.smsReminder24hEnabled;
  const nextSmsReminder2hEnabled = input.smsReminder2hEnabled ?? current.smsReminder2hEnabled;
  const nextSmsCancellationEnabled = input.smsCancellationEnabled ?? current.smsCancellationEnabled;
  const nextSmsRescheduleEnabled = input.smsRescheduleEnabled ?? current.smsRescheduleEnabled;
  const nextSmsSender = normalizeNullableString(input.smsSender ?? current.smsSender);
  const nextSmsTemplateConfirmation = normalizeNullableString(
    input.smsTemplateConfirmation ?? current.smsTemplateConfirmation
  );
  const nextSmsTemplateReminder24h = normalizeNullableString(
    input.smsTemplateReminder24h ?? current.smsTemplateReminder24h
  );
  const nextSmsTemplateReminder2h = normalizeNullableString(
    input.smsTemplateReminder2h ?? current.smsTemplateReminder2h
  );
  const nextSmsTemplateCancellation = normalizeNullableString(
    input.smsTemplateCancellation ?? current.smsTemplateCancellation
  );
  const nextSmsTemplateReschedule = normalizeNullableString(
    input.smsTemplateReschedule ?? current.smsTemplateReschedule
  );

  const setClauses = [
    `"bookingMode" = '${bookingModeValue}'::"BookingMode"`,
    `"smsEnabled" = ${nextSmsEnabled ? "true" : "false"}`,
    `"smsConfirmationEnabled" = ${nextSmsConfirmationEnabled ? "true" : "false"}`,
    `"smsReminder24hEnabled" = ${nextSmsReminder24hEnabled ? "true" : "false"}`,
    `"smsReminder2hEnabled" = ${nextSmsReminder2hEnabled ? "true" : "false"}`,
    `"smsCancellationEnabled" = ${nextSmsCancellationEnabled ? "true" : "false"}`,
    `"smsRescheduleEnabled" = ${nextSmsRescheduleEnabled ? "true" : "false"}`,
    `"smsSender" = ${toSqlNullableString(nextSmsSender)}`,
    `"smsTemplateConfirmation" = ${toSqlNullableString(nextSmsTemplateConfirmation)}`,
    `"smsTemplateReminder24h" = ${toSqlNullableString(nextSmsTemplateReminder24h)}`,
    `"smsTemplateReminder2h" = ${toSqlNullableString(nextSmsTemplateReminder2h)}`,
    `"smsTemplateCancellation" = ${toSqlNullableString(nextSmsTemplateCancellation)}`,
    `"smsTemplateReschedule" = ${toSqlNullableString(nextSmsTemplateReschedule)}`,
  ];
  const returnColumns = [
    `"id"`,
    `"instituteId"`,
    `"bookingMode"`,
    `"smsEnabled"`,
    `"smsConfirmationEnabled"`,
    `"smsReminder24hEnabled"`,
    `"smsReminder2hEnabled"`,
    `"smsCancellationEnabled"`,
    `"smsRescheduleEnabled"`,
    `"smsSender"`,
    `"smsTemplateConfirmation"`,
    `"smsTemplateReminder24h"`,
    `"smsTemplateReminder2h"`,
    `"smsTemplateCancellation"`,
    `"smsTemplateReschedule"`,
    `"createdAt"`,
    `"updatedAt"`,
  ];

  if (withShowDots) {
    setClauses.push(`"showAvailabilityDots" = ${nextShowDots ? "true" : "false"}`);
    returnColumns.push(`"showAvailabilityDots"`);
  }

  if (withDisplayMode) {
    setClauses.push(`"availabilityDisplayMode" = '${nextAvailabilityDisplayMode}'`);
    returnColumns.push(`"availabilityDisplayMode"`);
  }

  const query = `UPDATE "InstituteSettings"
     SET
       ${setClauses.join(",\n       ")},
       "updatedAt" = NOW()
     WHERE "id" = '${current.id}'
     RETURNING ${returnColumns.join(", ")}`;

  const rows = await prisma.$queryRawUnsafe<InstituteSettingsRow[]>(query);
  const updated = rows[0];
  if (!updated) {
    return current;
  }

  return toInstituteSettingsModel(updated);
}
