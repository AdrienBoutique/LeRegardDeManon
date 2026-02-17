import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest, authRequired, requireRole } from "../middlewares/auth";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

const createAvailabilitySchema = z
  .object({
    weekday: z.int().min(0).max(6),
    startTime: z.string().regex(timeRegex),
    endTime: z.string().regex(timeRegex),
  })
  .refine((payload) => timeToMinutes(payload.endTime) > timeToMinutes(payload.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

const updateAvailabilitySchema = z
  .object({
    weekday: z.int().min(0).max(6).optional(),
    startTime: z.string().regex(timeRegex).optional(),
    endTime: z.string().regex(timeRegex).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(
    (payload) => {
      if (!payload.startTime || !payload.endTime) {
        return true;
      }

      return timeToMinutes(payload.endTime) > timeToMinutes(payload.startTime);
    },
    {
      message: "endTime must be after startTime",
      path: ["endTime"],
    }
  );

const weeklyDaySchema = z
  .object({
    weekday: z.int().min(0).max(6),
    off: z.boolean(),
    startTime: z.string().regex(timeRegex).optional(),
    endTime: z.string().regex(timeRegex).optional(),
  })
  .superRefine((value, context) => {
    if (value.off) {
      return;
    }

    if (!value.startTime || !value.endTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "startTime/endTime are required when off=false",
      });
      return;
    }

    if (timeToMinutes(value.endTime) <= timeToMinutes(value.startTime)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "endTime must be after startTime",
      });
    }
  });

const putWeeklyAvailabilitySchema = z
  .object({
    days: z.array(weeklyDaySchema).length(7),
  })
  .superRefine((payload, context) => {
    const seen = new Set<number>();
    for (const [index, day] of payload.days.entries()) {
      if (seen.has(day.weekday)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days", index, "weekday"],
          message: "weekday values must be unique",
        });
      }
      seen.add(day.weekday);
    }

    for (let weekday = 0; weekday <= 6; weekday += 1) {
      if (!seen.has(weekday)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days"],
          message: "days must include weekday 0..6",
        });
        break;
      }
    }
  });

function formatWeeklyDays(
  rules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>
): Array<{
  weekday: number;
  off: boolean;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
}> {
  const ruleByWeekday = new Map(rules.map((rule) => [rule.dayOfWeek, rule]));
  return Array.from({ length: 7 }, (_, weekday) => {
    const rule = ruleByWeekday.get(weekday);
    return {
      weekday,
      off: !rule,
      startTime: rule?.startTime ?? null,
      endTime: rule?.endTime ?? null,
      active: rule?.isActive ?? false,
    };
  });
}

export const adminAvailabilityRouter = Router();

async function getLinkedPractitionerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { practitioner: { select: { id: true } } },
  });
  return user?.practitioner?.id ?? null;
}

adminAvailabilityRouter.get("/staff/:id/availability", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (auth.role === Role.STAFF) {
      const linkedPractitionerId = await getLinkedPractitionerId(auth.id);
      if (!linkedPractitionerId || linkedPractitionerId !== staffId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const rules = await prisma.availabilityRule.findMany({
      where: { staffMemberId: staffId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    const ruleByWeekday = new Map(rules.map((rule) => [rule.dayOfWeek, rule]));
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const rule = ruleByWeekday.get(weekday);
      return {
        id: rule?.id ?? null,
        staffId,
        weekday,
        off: !rule,
        startTime: rule?.startTime ?? null,
        endTime: rule?.endTime ?? null,
        active: rule?.isActive ?? false,
        createdAt: rule?.createdAt ?? null,
        updatedAt: rule?.updatedAt ?? null,
      };
    });

    res.json(days);
  } catch (error) {
    console.error("[adminAvailability.listByStaff]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.put("/staff/:id/availability", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const payload = parseOrThrow(putWeeklyAvailabilitySchema, req.body);
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (auth.role === Role.STAFF) {
      const linkedPractitionerId = await getLinkedPractitionerId(auth.id);
      if (!linkedPractitionerId || linkedPractitionerId !== staffId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const byWeekday = new Map(payload.days.map((day) => [day.weekday, day]));

    await prisma.$transaction(async (tx) => {
      for (let weekday = 0; weekday <= 6; weekday += 1) {
        const day = byWeekday.get(weekday);
        if (!day || day.off) {
          await tx.availabilityRule.deleteMany({
            where: {
              staffMemberId: staffId,
              dayOfWeek: weekday,
            },
          });
          continue;
        }

        await tx.availabilityRule.upsert({
          where: {
            staffMemberId_dayOfWeek: {
              staffMemberId: staffId,
              dayOfWeek: weekday,
            },
          },
          update: {
            startTime: day.startTime!,
            endTime: day.endTime!,
            isActive: true,
          },
          create: {
            staffMemberId: staffId,
            dayOfWeek: weekday,
            startTime: day.startTime!,
            endTime: day.endTime!,
            isActive: true,
          },
        });
      }
    });

    const updatedRules = await prisma.availabilityRule.findMany({
      where: { staffMemberId: staffId },
      orderBy: { dayOfWeek: "asc" },
    });

    res.json({
      staffId,
      days: formatWeeklyDays(updatedRules),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.putWeekly]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.post("/staff/:id/availability", ...authAdmin, async (req, res) => {
  try {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(createAvailabilitySchema, req.body);

    const created = await prisma.availabilityRule.create({
      data: {
        staffMemberId: staffId,
        dayOfWeek: payload.weekday,
        startTime: payload.startTime,
        endTime: payload.endTime,
        isActive: true,
      },
    });

    res.status(201).json({
      id: created.id,
      staffId: created.staffMemberId,
      weekday: created.dayOfWeek,
      startTime: created.startTime,
      endTime: created.endTime,
      active: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.get("/availability/institute", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (_req, res) => {
  try {
    const rules = await prisma.instituteAvailabilityRule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    const ruleByWeekday = new Map(rules.map((rule) => [rule.dayOfWeek, rule]));
    const days = Array.from({ length: 7 }, (_, weekday) => {
      const rule = ruleByWeekday.get(weekday);
      return {
        id: rule?.id ?? null,
        weekday,
        off: !rule,
        startTime: rule?.startTime ?? null,
        endTime: rule?.endTime ?? null,
        active: rule?.isActive ?? false,
        createdAt: rule?.createdAt ?? null,
        updatedAt: rule?.updatedAt ?? null,
      };
    });

    res.json(days);
  } catch (error) {
    console.error("[adminAvailability.listInstitute]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.put("/availability/institute", ...authAdmin, async (req, res) => {
  try {
    const payload = parseOrThrow(putWeeklyAvailabilitySchema, req.body);
    const byWeekday = new Map(payload.days.map((day) => [day.weekday, day]));

    await prisma.$transaction(async (tx) => {
      for (let weekday = 0; weekday <= 6; weekday += 1) {
        const day = byWeekday.get(weekday);
        if (!day || day.off) {
          await tx.instituteAvailabilityRule.deleteMany({
            where: { dayOfWeek: weekday },
          });
          continue;
        }

        await tx.instituteAvailabilityRule.upsert({
          where: { dayOfWeek: weekday },
          update: {
            startTime: day.startTime!,
            endTime: day.endTime!,
            isActive: true,
          },
          create: {
            dayOfWeek: weekday,
            startTime: day.startTime!,
            endTime: day.endTime!,
            isActive: true,
          },
        });
      }
    });

    const updatedRules = await prisma.instituteAvailabilityRule.findMany({
      where: { isActive: true },
      orderBy: { dayOfWeek: "asc" },
    });

    res.json({
      days: formatWeeklyDays(updatedRules),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.putInstitute]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.patch("/availability/:id", ...authAdmin, async (req, res) => {
  try {
    const availabilityId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(updateAvailabilitySchema, req.body);

    const existing = await prisma.availabilityRule.findUnique({
      where: { id: availabilityId },
      select: { startTime: true, endTime: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Availability rule not found" });
      return;
    }

    const nextStart = payload.startTime ?? existing.startTime;
    const nextEnd = payload.endTime ?? existing.endTime;

    if (timeToMinutes(nextEnd) <= timeToMinutes(nextStart)) {
      res.status(400).json({ error: "endTime must be after startTime" });
      return;
    }

    const updated = await prisma.availabilityRule.update({
      where: { id: availabilityId },
      data: {
        dayOfWeek: payload.weekday,
        startTime: payload.startTime,
        endTime: payload.endTime,
      },
    });

    res.json({
      id: updated.id,
      staffId: updated.staffMemberId,
      weekday: updated.dayOfWeek,
      startTime: updated.startTime,
      endTime: updated.endTime,
      active: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.delete("/availability/:id", ...authAdmin, async (req, res) => {
  try {
    const availabilityId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await prisma.availabilityRule.delete({
      where: { id: availabilityId },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminAvailability.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
