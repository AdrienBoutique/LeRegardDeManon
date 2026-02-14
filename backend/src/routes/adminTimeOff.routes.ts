import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const createTimeOffSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    isAllDay: z.boolean().optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .superRefine((payload, ctx) => {
    const isAllDay = payload.isAllDay ?? false;

    if (isAllDay) {
      if (!payload.date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["date"],
          message: "date is required for all-day time off",
        });
      }

      if (payload.startsAt || payload.endsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startsAt"],
          message: "startsAt/endsAt must be omitted for all-day time off",
        });
      }

      return;
    }

    if (!payload.startsAt || !payload.endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startsAt"],
        message: "startsAt and endsAt are required",
      });
      return;
    }

    const startsAt = DateTime.fromISO(payload.startsAt, { setZone: true });
    const endsAt = DateTime.fromISO(payload.endsAt, { setZone: true });

    if (!startsAt.isValid || !endsAt.isValid || endsAt <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "endsAt must be after startsAt",
      });
    }
  });

export const adminTimeOffRouter = Router();

adminTimeOffRouter.use(authAdmin);

function encodeGlobalTimeOffId(startsAt: Date, endsAt: Date, reason: string | null): string {
  const key = `${startsAt.toISOString()}|${endsAt.toISOString()}|${reason ?? ""}`;
  return Buffer.from(key, "utf8").toString("base64url");
}

function decodeGlobalTimeOffId(encoded: string): { startsAt: Date; endsAt: Date; reason: string } {
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  const [startsAtRaw, endsAtRaw, ...reasonParts] = decoded.split("|");
  const reason = reasonParts.join("|");
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Invalid global timeoff id");
  }

  return { startsAt, endsAt, reason };
}

function resolveTimeOffDates(payload: z.infer<typeof createTimeOffSchema>): { startsAt: Date; endsAt: Date; isAllDay: boolean } {
  const isAllDay = payload.isAllDay ?? false;

  if (isAllDay) {
    const day = DateTime.fromISO(payload.date!, { zone: BRUSSELS_TIMEZONE });
    if (!day.isValid || day.toFormat("yyyy-MM-dd") !== payload.date) {
      throw new Error("date must be a valid YYYY-MM-DD");
    }

    return {
      startsAt: day.startOf("day").toUTC().toJSDate(),
      endsAt: day.plus({ days: 1 }).startOf("day").toUTC().toJSDate(),
      isAllDay: true,
    };
  }

  const start = DateTime.fromISO(payload.startsAt!, { setZone: true });
  const end = DateTime.fromISO(payload.endsAt!, { setZone: true });

  return {
    startsAt: start.toUTC().toJSDate(),
    endsAt: end.toUTC().toJSDate(),
    isAllDay: false,
  };
}

adminTimeOffRouter.get("/staff/:id/timeoff", async (req, res) => {
  try {
    const items = await prisma.timeOff.findMany({
      where: { staffMemberId: req.params.id },
      orderBy: { startsAt: "asc" },
    });

    res.json(
      items.map((item) => ({
        id: item.id,
        staffId: item.staffMemberId,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        isAllDay: item.isAllDay,
        reason: item.reason,
        createdAt: item.createdAt,
      }))
    );
  } catch (error) {
    console.error("[adminTimeOff.listByStaff]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminTimeOffRouter.get("/timeoff/global", async (_req, res) => {
  try {
    const items = await prisma.timeOff.findMany({
      where: {
        reason: {
          startsWith: "[GLOBAL]",
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const grouped = new Map<
      string,
      {
        id: string;
        startsAt: Date;
        endsAt: Date;
        isAllDay: boolean;
        reason: string | null;
        createdAt: Date;
      }
    >();

    for (const item of items) {
      const id = encodeGlobalTimeOffId(item.startsAt, item.endsAt, item.reason);
      if (!grouped.has(id)) {
        grouped.set(id, {
          id,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          isAllDay: item.isAllDay,
          reason: item.reason,
          createdAt: item.createdAt,
        });
      }
    }

    res.json(Array.from(grouped.values()));
  } catch (error) {
    console.error("[adminTimeOff.listGlobal]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminTimeOffRouter.post("/staff/:id/timeoff", async (req, res) => {
  try {
    const payload = parseOrThrow(createTimeOffSchema, req.body);
    const { startsAt, endsAt, isAllDay } = resolveTimeOffDates(payload);

    const created = await prisma.timeOff.create({
      data: {
        staffMemberId: req.params.id,
        startsAt,
        endsAt,
        isAllDay,
        reason: payload.reason,
      },
    });

    res.status(201).json({
      id: created.id,
      staffId: created.staffMemberId,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      isAllDay: created.isAllDay,
      reason: created.reason,
      createdAt: created.createdAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("date must be a valid")) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminTimeOff.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminTimeOffRouter.post("/timeoff/global", async (req, res) => {
  try {
    const payload = parseOrThrow(createTimeOffSchema, req.body);
    const { startsAt, endsAt, isAllDay } = resolveTimeOffDates(payload);

    const activeStaff = await prisma.staffMember.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    if (!activeStaff.length) {
      res.status(400).json({ error: "No active staff" });
      return;
    }

    const created = await prisma.$transaction(
      activeStaff.map((member) =>
        prisma.timeOff.create({
          data: {
            staffMemberId: member.id,
            startsAt,
            endsAt,
            isAllDay,
            reason: payload.reason ? `[GLOBAL] ${payload.reason}` : "[GLOBAL] Fermeture institut",
          },
        })
      )
    );

    res.status(201).json({
      ok: true,
      createdCount: created.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("date must be a valid")) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminTimeOff.createGlobal]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminTimeOffRouter.delete("/timeoff/:id", async (req, res) => {
  try {
    await prisma.timeOff.delete({
      where: { id: req.params.id },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminTimeOff.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminTimeOffRouter.delete("/timeoff/global/:id", async (req, res) => {
  try {
    const decoded = decodeGlobalTimeOffId(req.params.id);
    await prisma.timeOff.deleteMany({
      where: {
        startsAt: decoded.startsAt,
        endsAt: decoded.endsAt,
        reason: decoded.reason || null,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminTimeOff.deleteGlobal]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
