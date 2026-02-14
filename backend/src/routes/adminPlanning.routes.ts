import { AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const planningQuerySchema = z
  .object({
    weekStart: z.string().regex(dateRegex).optional(),
    staffId: z.string().min(1).optional(),
    start: z.string().regex(dateRegex).optional(),
    end: z.string().regex(dateRegex).optional(),
  })
  .superRefine((query, context) => {
    if (query.weekStart) {
      return;
    }

    if (!query.start || !query.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "weekStart or start/end are required",
        path: ["weekStart"],
      });
      return;
    }

    if (query.start >= query.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end must be after start",
        path: ["end"],
      });
    }
  });

function mapStatus(status: AppointmentStatus): "BOOKED" | "DONE" | "NO_SHOW" {
  if (status === AppointmentStatus.COMPLETED) {
    return "DONE";
  }

  if (status === AppointmentStatus.NO_SHOW) {
    return "NO_SHOW";
  }

  return "BOOKED";
}

export const adminPlanningRouter = Router();

adminPlanningRouter.use(authAdmin);

adminPlanningRouter.get("/planning", async (req, res) => {
  try {
    const query = parseOrThrow(planningQuerySchema, req.query);

    const startYmd = query.weekStart ?? query.start!;
    const endYmd =
      query.weekStart
        ? DateTime.fromISO(query.weekStart, { zone: BRUSSELS_TIMEZONE }).plus({ days: 7 }).toFormat("yyyy-MM-dd")
        : query.end!;
    const startLocal = DateTime.fromISO(startYmd, { zone: BRUSSELS_TIMEZONE }).startOf("day");
    const endLocal = DateTime.fromISO(endYmd, { zone: BRUSSELS_TIMEZONE }).startOf("day");

    if (
      !startLocal.isValid ||
      !endLocal.isValid ||
      startLocal.toFormat("yyyy-MM-dd") !== startYmd ||
      endLocal.toFormat("yyyy-MM-dd") !== endYmd
    ) {
      res.status(400).json({ error: "weekStart/start/end must be valid YYYY-MM-DD" });
      return;
    }

    const staffWhere = query.staffId
      ? { isActive: true, id: query.staffId }
      : { isActive: true };

    const [staffMembers, appointments, staffAvailability, timeOff] = await Promise.all([
      prisma.staffMember.findMany({
        where: staffWhere,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          colorHex: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          ...(query.staffId ? { staffMemberId: query.staffId } : {}),
          startsAt: {
            gte: startLocal.toUTC().toJSDate(),
            lt: endLocal.toUTC().toJSDate(),
          },
          status: {
            in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW],
          },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          service: {
            select: {
              id: true,
              name: true,
              colorHex: true,
            },
          },
          client: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          staffMember: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              colorHex: true,
            },
          },
        },
      }),
      prisma.availabilityRule.findMany({
        where: {
          ...(query.staffId
            ? { staffMemberId: query.staffId }
            : { staffMember: { isActive: true } }),
          isActive: true,
        },
        orderBy: [{ staffMemberId: "asc" }, { dayOfWeek: "asc" }],
        select: {
          staffMemberId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.timeOff.findMany({
        where: {
          ...(query.staffId ? { staffMemberId: query.staffId } : { staffMember: { isActive: true } }),
          startsAt: {
            lt: endLocal.toUTC().toJSDate(),
          },
          endsAt: {
            gt: startLocal.toUTC().toJSDate(),
          },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          isAllDay: true,
          reason: true,
          staffMember: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              colorHex: true,
            },
          },
        },
      }),
    ]);

    res.json({
      staff: staffMembers.map((member) => ({
        id: member.id,
        name: `${member.firstName} ${member.lastName}`.trim(),
        colorHex: member.colorHex,
      })),
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        startAt: appointment.startsAt,
        endAt: appointment.endsAt,
        status: mapStatus(appointment.status),
        serviceId: appointment.service.id,
        serviceName: appointment.service.name,
        serviceColorHex: appointment.service.colorHex,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
        staffId: appointment.staffMember.id,
        staffName: `${appointment.staffMember.firstName} ${appointment.staffMember.lastName}`.trim(),
        staffColorHex: appointment.staffMember.colorHex,
      })),
      staffAvailability: staffAvailability.map((rule) => ({
        staffId: rule.staffMemberId,
        weekday: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      })),
      timeOff: timeOff.map((item) => ({
        id: item.id,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        isAllDay: item.isAllDay,
        reason: item.reason,
        staffId: item.staffMember.id,
        staffName: `${item.staffMember.firstName} ${item.staffMember.lastName}`.trim(),
        staffColorHex: item.staffMember.colorHex,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminPlanning.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
