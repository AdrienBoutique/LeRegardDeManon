import { AvailabilityMode, Role } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest, authRequired, requireRole } from "../middlewares/auth";
import { authAdmin } from "../middlewares/authAdmin";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function parseYmd(date: string): DateTime | null {
  const parsed = DateTime.fromISO(date, { zone: BRUSSELS_TIMEZONE }).startOf("day");
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd") !== date) {
    return null;
  }

  return parsed;
}

function validateSlots(slots: Array<{ startTime: string; endTime: string }>): string | null {
  const sorted = [...slots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (timeToMinutes(current.endTime) <= timeToMinutes(current.startTime)) {
      return "endTime must be after startTime";
    }

    const previous = sorted[index - 1];
    if (previous && timeToMinutes(current.startTime) < timeToMinutes(previous.endTime)) {
      return "Time slots must not overlap";
    }
  }

  return null;
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

const updatePlanningModeSchema = z.object({
  availabilityMode: z.nativeEnum(AvailabilityMode),
});

const customTimeSlotSchema = z
  .object({
    startTime: z.string().regex(timeRegex),
    endTime: z.string().regex(timeRegex),
  })
  .refine((payload) => timeToMinutes(payload.endTime) > timeToMinutes(payload.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

const customWorkingDayBodySchema = z
  .object({
    isClosed: z.boolean().optional(),
    slots: z.array(customTimeSlotSchema).optional(),
  })
  .superRefine((payload, context) => {
    if (payload.isClosed) {
      return;
    }

    if (!payload.slots || payload.slots.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: "At least one time slot is required when the day is open",
      });
      return;
    }

    const overlapError = validateSlots(payload.slots);
    if (overlapError) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: overlapError,
      });
    }
  });

const customDayQuerySchema = z.object({
  start: z.string().regex(dateRegex),
  end: z.string().regex(dateRegex),
});

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

function formatCustomWorkingDay(day: {
  id: string;
  staffMemberId: string;
  workingDate: string;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
  timeSlots: Array<{ id: string; startTime: string; endTime: string }>;
}): {
  id: string;
  staffId: string;
  date: string;
  isClosed: boolean;
  slots: Array<{ id: string; startTime: string; endTime: string }>;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: day.id,
    staffId: day.staffMemberId,
    date: day.workingDate,
    isClosed: day.isClosed,
    slots: day.timeSlots
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot) => ({
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    createdAt: day.createdAt,
    updatedAt: day.updatedAt,
  };
}

export const adminAvailabilityRouter = Router();

async function getLinkedPractitionerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { practitioner: { select: { id: true } } },
  });
  return user?.practitioner?.id ?? null;
}

async function assertStaffAccess(req: unknown, staffId: string): Promise<boolean> {
  const auth = (req as AuthenticatedRequest).user;
  if (auth.role !== Role.STAFF) {
    return true;
  }

  const linkedPractitionerId = await getLinkedPractitionerId(auth.id);
  return Boolean(linkedPractitionerId && linkedPractitionerId === staffId);
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

adminAvailabilityRouter.get("/staff/:id/planning-settings", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (auth.role === Role.STAFF) {
      const allowed = await assertStaffAccess(req, staffId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const settings = await prisma.practitionerScheduleSettings.findUnique({
      where: { staffMemberId: staffId },
      select: {
        staffMemberId: true,
        availabilityMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      staffId,
      availabilityMode: settings?.availabilityMode ?? AvailabilityMode.WEEKLY,
      createdAt: settings?.createdAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("[adminAvailability.getPlanningSettings]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.put("/staff/:id/planning-settings", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(updatePlanningModeSchema, req.body);

    if (auth.role === Role.STAFF) {
      const allowed = await assertStaffAccess(req, staffId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const updated = await prisma.practitionerScheduleSettings.upsert({
      where: { staffMemberId: staffId },
      update: { availabilityMode: payload.availabilityMode },
      create: {
        staffMemberId: staffId,
        availabilityMode: payload.availabilityMode,
      },
      select: {
        staffMemberId: true,
        availabilityMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      staffId: updated.staffMemberId,
      availabilityMode: updated.availabilityMode,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.updatePlanningSettings]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.get("/staff/:id/custom-days", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const query = parseOrThrow(customDayQuerySchema, req.query);

    if (auth.role === Role.STAFF) {
      const allowed = await assertStaffAccess(req, staffId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const startLocal = parseYmd(query.start);
    const endLocal = parseYmd(query.end);

    if (!startLocal || !endLocal || startLocal > endLocal) {
      res.status(400).json({ error: "start and end must be valid YYYY-MM-DD values" });
      return;
    }

    const days = await prisma.practitionerCustomWorkingDay.findMany({
      where: {
        staffMemberId: staffId,
        workingDate: {
          gte: query.start,
          lte: query.end,
        },
      },
      orderBy: { workingDate: "asc" },
      select: {
        id: true,
        staffMemberId: true,
        workingDate: true,
        isClosed: true,
        createdAt: true,
        updatedAt: true,
        timeSlots: {
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    res.json({
      staffId,
      start: query.start,
      end: query.end,
      days: days.map(formatCustomWorkingDay),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.listCustomDays]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function upsertCustomDayHandler(req: unknown, res: any) {
  const auth = (req as AuthenticatedRequest).user;
  const staffId = Array.isArray((req as { params: { id?: string | string[] } }).params.id)
    ? ((req as { params: { id?: string | string[] } }).params.id as string[])[0]
    : ((req as { params: { id?: string | string[] } }).params.id as string);
  const date = Array.isArray((req as { params: { date?: string | string[] } }).params.date)
    ? ((req as { params: { date?: string | string[] } }).params.date as string[])[0]
    : ((req as { params: { date?: string | string[] } }).params.date as string);
  const payload = parseOrThrow(customWorkingDayBodySchema, (req as { body: unknown }).body);

  if (auth.role === Role.STAFF) {
    const allowed = await assertStaffAccess(req, staffId);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const dayLocal = parseYmd(date);
  if (!dayLocal) {
    res.status(400).json({ error: "date must be a valid YYYY-MM-DD" });
    return;
  }

  const slotError = payload.isClosed ? null : validateSlots(payload.slots ?? []);
  if (slotError) {
    res.status(400).json({ error: slotError });
    return;
  }

  const workingDay = await prisma.practitionerCustomWorkingDay.upsert({
    where: {
      staffMemberId_workingDate: {
        staffMemberId: staffId,
        workingDate: date,
      },
    },
    update: {
      isClosed: payload.isClosed ?? false,
    },
    create: {
      staffMemberId: staffId,
      workingDate: date,
      isClosed: payload.isClosed ?? false,
    },
    select: {
      id: true,
      staffMemberId: true,
      workingDate: true,
      isClosed: true,
      createdAt: true,
      updatedAt: true,
      timeSlots: {
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  if (!payload.isClosed) {
    await prisma.practitionerCustomTimeSlot.deleteMany({
      where: {
        customWorkingDayId: workingDay.id,
      },
    });

    if ((payload.slots ?? []).length > 0) {
      await prisma.practitionerCustomTimeSlot.createMany({
        data: (payload.slots ?? []).map((slot) => ({
          customWorkingDayId: workingDay.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      });
    }
  } else {
    await prisma.practitionerCustomTimeSlot.deleteMany({
      where: {
        customWorkingDayId: workingDay.id,
      },
    });
  }

  const refreshed = await prisma.practitionerCustomWorkingDay.findUnique({
    where: {
      id: workingDay.id,
    },
    select: {
      id: true,
      staffMemberId: true,
      workingDate: true,
      isClosed: true,
      createdAt: true,
      updatedAt: true,
      timeSlots: {
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  res.status(200).json({
    day: refreshed ? formatCustomWorkingDay(refreshed) : null,
  });
}

adminAvailabilityRouter.post("/staff/:id/custom-days/:date", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    await upsertCustomDayHandler(req, res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.createCustomDay]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.put("/staff/:id/custom-days/:date", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    await upsertCustomDayHandler(req, res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAvailability.updateCustomDay]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.delete("/staff/:id/custom-days/:date", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const date = Array.isArray(req.params.date) ? req.params.date[0] : req.params.date;

    if (auth.role === Role.STAFF) {
      const allowed = await assertStaffAccess(req, staffId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const dayLocal = parseYmd(date);
    if (!dayLocal) {
      res.status(400).json({ error: "date must be a valid YYYY-MM-DD" });
      return;
    }

    await prisma.practitionerCustomWorkingDay.deleteMany({
      where: {
        staffMemberId: staffId,
        workingDate: date,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminAvailability.deleteCustomDay]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminAvailabilityRouter.delete("/staff/:id/custom-days/:date/slots/:slotId", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (req, res) => {
  try {
    const auth = (req as AuthenticatedRequest).user;
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const slotId = Array.isArray(req.params.slotId) ? req.params.slotId[0] : req.params.slotId;

    if (auth.role === Role.STAFF) {
      const allowed = await assertStaffAccess(req, staffId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const slot = await prisma.practitionerCustomTimeSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        customWorkingDay: {
          select: {
            staffMemberId: true,
          },
        },
      },
    });

    if (!slot || slot.customWorkingDay.staffMemberId !== staffId) {
      res.status(404).json({ error: "Time slot not found" });
      return;
    }

    await prisma.practitionerCustomTimeSlot.delete({
      where: { id: slotId },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminAvailability.deleteCustomSlot]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
