import { BookingMode, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";

const SINGLETON_KEY = "default";
type AvailabilityDisplayMode = "dots" | "colors";

type InstituteSettingsRow = {
  id: string;
  instituteId: string | null;
  bookingMode: BookingMode | string;
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
  const insertColumns = [`"id"`, `"instituteId"`, `"bookingMode"`];
  const insertValues = [`'${id}'`, `'${SINGLETON_KEY}'`, `'${BookingMode.MANUAL}'::"BookingMode"`];
  const returnColumns = [`"id"`, `"instituteId"`, `"bookingMode"`, `"createdAt"`, `"updatedAt"`];

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

  const setClauses = [`"bookingMode" = '${bookingModeValue}'::"BookingMode"`];
  const returnColumns = [`"id"`, `"instituteId"`, `"bookingMode"`, `"createdAt"`, `"updatedAt"`];

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
