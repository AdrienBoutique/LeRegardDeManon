import { PrismaClient } from "@prisma/client";

const basePrisma = new PrismaClient();

function extractStatusValue(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }

  if (typeof input === "object" && input !== null && "set" in input) {
    const value = (input as { set?: unknown }).set;
    return typeof value === "string" ? value : null;
  }

  return null;
}

export const prisma = basePrisma.$extends({
  query: {
    appointment: {
      async update({ args, query }) {
        const data = args.data as Record<string, unknown> | undefined;

        if (data) {
          if (Object.prototype.hasOwnProperty.call(data, "startsAt")) {
            data.reminder24hEmailSentAt = null;
            data.reminder24hSmsSentAt = null;
            data.reminder2hSmsSentAt = null;
          }

          const statusValue = extractStatusValue(data.status);
          if (statusValue === "CANCELLED" && !Object.prototype.hasOwnProperty.call(data, "canceledAt")) {
            data.canceledAt = new Date();
          }
        }

        return query(args);
      },
      async updateMany({ args, query }) {
        const data = args.data as Record<string, unknown> | undefined;

        if (data) {
          if (Object.prototype.hasOwnProperty.call(data, "startsAt")) {
            data.reminder24hEmailSentAt = null;
            data.reminder24hSmsSentAt = null;
            data.reminder2hSmsSentAt = null;
          }

          const statusValue = extractStatusValue(data.status);
          if (statusValue === "CANCELLED" && !Object.prototype.hasOwnProperty.call(data, "canceledAt")) {
            data.canceledAt = new Date();
          }
        }

        return query(args);
      }
    },
  },
});
