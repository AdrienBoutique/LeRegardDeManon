import { BookingMode, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";

const SINGLETON_KEY = "default";

type InstituteSettingsRow = {
  id: string;
  instituteId: string | null;
  bookingMode: BookingMode | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  showAvailabilityDots?: boolean | null;
};

type InstituteSettingsModel = {
  id: string;
  instituteId: string | null;
  bookingMode: BookingMode;
  showAvailabilityDots: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let showAvailabilityDotsColumnExists: boolean | null = null;

function normalizeBookingMode(value: BookingMode | string): BookingMode {
  return value === BookingMode.AUTO_INTELLIGENT ? BookingMode.AUTO_INTELLIGENT : BookingMode.MANUAL;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toInstituteSettingsModel(row: InstituteSettingsRow): InstituteSettingsModel {
  return {
    id: row.id,
    instituteId: row.instituteId,
    bookingMode: normalizeBookingMode(row.bookingMode),
    showAvailabilityDots: row.showAvailabilityDots ?? true,
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

async function findFirstSettings(withShowDots: boolean): Promise<InstituteSettingsRow | null> {
  const query = withShowDots
    ? Prisma.sql`
        SELECT
          "id",
          "instituteId",
          "bookingMode",
          "createdAt",
          "updatedAt",
          "showAvailabilityDots"
        FROM "InstituteSettings"
        ORDER BY "createdAt" ASC
        LIMIT 1
      `
    : Prisma.sql`
        SELECT
          "id",
          "instituteId",
          "bookingMode",
          "createdAt",
          "updatedAt"
        FROM "InstituteSettings"
        ORDER BY "createdAt" ASC
        LIMIT 1
      `;

  const rows = await prisma.$queryRaw<InstituteSettingsRow[]>(query);
  return rows[0] ?? null;
}

async function createDefaultSettings(withShowDots: boolean): Promise<InstituteSettingsRow> {
  const id = randomUUID();
  const query = withShowDots
    ? `INSERT INTO "InstituteSettings" ("id", "instituteId", "bookingMode", "showAvailabilityDots", "createdAt", "updatedAt")
       VALUES ('${id}', '${SINGLETON_KEY}', '${BookingMode.MANUAL}'::"BookingMode", true, NOW(), NOW())
       RETURNING "id", "instituteId", "bookingMode", "createdAt", "updatedAt", "showAvailabilityDots"`
    : `INSERT INTO "InstituteSettings" ("id", "instituteId", "bookingMode", "createdAt", "updatedAt")
       VALUES ('${id}', '${SINGLETON_KEY}', '${BookingMode.MANUAL}'::"BookingMode", NOW(), NOW())
       RETURNING "id", "instituteId", "bookingMode", "createdAt", "updatedAt"`;

  const rows = await prisma.$queryRawUnsafe<InstituteSettingsRow[]>(query);
  return rows[0];
}

export async function getInstituteSettings(): Promise<InstituteSettingsModel> {
  const withShowDots = await hasShowAvailabilityDotsColumn();
  const existing = await findFirstSettings(withShowDots);
  if (existing) {
    return toInstituteSettingsModel(existing);
  }

  const created = await createDefaultSettings(withShowDots);
  return toInstituteSettingsModel(created);
}

export async function setInstituteSettings(input: {
  bookingMode?: BookingMode;
  showAvailabilityDots?: boolean;
}): Promise<InstituteSettingsModel> {
  const current = await getInstituteSettings();
  const withShowDots = await hasShowAvailabilityDotsColumn();

  const nextBookingMode = input.bookingMode ?? current.bookingMode;
  const bookingModeValue = normalizeBookingMode(nextBookingMode);
  const nextShowDots = withShowDots ? (input.showAvailabilityDots ?? current.showAvailabilityDots) : true;

  const query = withShowDots
    ? `UPDATE "InstituteSettings"
       SET
         "bookingMode" = '${bookingModeValue}'::"BookingMode",
         "showAvailabilityDots" = ${nextShowDots ? "true" : "false"},
         "updatedAt" = NOW()
       WHERE "id" = '${current.id}'
       RETURNING "id", "instituteId", "bookingMode", "createdAt", "updatedAt", "showAvailabilityDots"`
    : `UPDATE "InstituteSettings"
       SET
         "bookingMode" = '${bookingModeValue}'::"BookingMode",
         "updatedAt" = NOW()
       WHERE "id" = '${current.id}'
       RETURNING "id", "instituteId", "bookingMode", "createdAt", "updatedAt"`;

  const rows = await prisma.$queryRawUnsafe<InstituteSettingsRow[]>(query);
  const updated = rows[0];
  if (!updated) {
    return current;
  }

  return toInstituteSettingsModel(updated);
}
