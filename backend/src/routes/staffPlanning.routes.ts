import { AppointmentStatus, Role } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { BRUSSELS_TIMEZONE } from "../lib/time";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { AuthenticatedRequest, authRequired, requireRole } from "../middlewares/auth";

const staffPlanningQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  practitionerId: z.string().min(1).optional(),
});

export const staffPlanningRouter = Router();

staffPlanningRouter.get("/staff/me/planning", authRequired, requireRole(Role.STAFF, Role.ADMIN), async (req, res) => {
  try {
    const query = parseOrThrow(staffPlanningQuerySchema, req.query);
    const auth = (req as AuthenticatedRequest).user;

    const targetDate = query.date ?? DateTime.now().setZone(BRUSSELS_TIMEZONE).toFormat("yyyy-MM-dd");
    const dayStart = DateTime.fromISO(targetDate, { zone: BRUSSELS_TIMEZONE }).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });

    if (!dayStart.isValid) {
      res.status(400).json({ error: "date must be a valid YYYY-MM-DD" });
      return;
    }

    let practitionerId: string | null = null;

    if (auth.role === Role.ADMIN) {
      practitionerId = query.practitionerId ?? null;
      if (!practitionerId) {
        res.status(400).json({ error: "practitionerId is required for admin on this endpoint" });
        return;
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: auth.id },
        select: {
          practitioner: { select: { id: true } },
        },
      });
      practitionerId = user?.practitioner?.id ?? null;
      if (!practitionerId) {
        res.status(404).json({ error: "No practitioner linked to current user" });
        return;
      }
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        staffMemberId: practitionerId,
        startsAt: {
          gte: dayStart.toUTC().toJSDate(),
          lt: dayEnd.toUTC().toJSDate(),
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
        notes: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        items: {
          orderBy: { order: "asc" },
          select: {
            serviceId: true,
            durationMin: true,
            priceCents: true,
            order: true,
            service: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    res.json({
      date: targetDate,
      practitionerId,
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        startAt: appointment.startsAt,
        endAt: appointment.endsAt,
        status: appointment.status,
        notes: appointment.notes,
        client: {
          id: appointment.client.id,
          name: `${appointment.client.firstName} ${appointment.client.lastName}`.trim(),
          email: appointment.client.email,
          phone: appointment.client.phone,
        },
        items: appointment.items.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.service.name,
          durationMin: item.durationMin,
          priceCents: item.priceCents,
          order: item.order,
        })),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[staffPlanning.me]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
