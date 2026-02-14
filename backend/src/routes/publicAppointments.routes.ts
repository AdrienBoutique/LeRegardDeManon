import { AppointmentStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  buildDateTimeForDay,
  subtractIntervals,
  TimeInterval,
} from "../lib/time";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value))
  .optional();

const createAppointmentSchema = z.object({
  serviceId: z.string().min(1),
  staffId: optionalString,
  startAt: z.string().datetime({ offset: true }),
  client: z
    .object({
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      email: optionalString.pipe(z.string().email().optional()),
      phone: optionalString,
    })
    .superRefine((value, ctx) => {
      if (!value.email && !value.phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "email or phone is required",
          path: ["email"],
        });
      }
    }),
  notes: optionalString,
});

type CandidateStaff = {
  id: string;
  firstName: string;
  lastName: string;
  effectivePriceCents: number;
};

function computeEffectivePrice(
  basePriceCents: number,
  priceCentsOverride: number | null,
  discountPercentOverride: number | null
): number {
  if (priceCentsOverride !== null) {
    return priceCentsOverride;
  }

  if (discountPercentOverride !== null) {
    return Math.max(0, Math.round(basePriceCents * (1 - discountPercentOverride / 100)));
  }

  return basePriceCents;
}

export const publicAppointmentsRouter = Router();

publicAppointmentsRouter.post("/appointments", async (req, res) => {
  try {
    const payload = parseOrThrow(createAppointmentSchema, req.body);

    const startAtRaw = DateTime.fromISO(payload.startAt, { setZone: true });
    if (!startAtRaw.isValid) {
      res.status(400).json({ error: "startAt must be a valid ISO datetime" });
      return;
    }

    const startAtLocal = startAtRaw.setZone(BRUSSELS_TIMEZONE);

    const created = await prisma.$transaction(
      async (tx) => {
        const service = await tx.service.findFirst({
          where: { id: payload.serviceId, isActive: true },
          select: {
            id: true,
            name: true,
            durationMin: true,
            priceCents: true,
            serviceLinks: {
              where: {
                staffMember: {
                  isActive: true,
                  ...(payload.staffId ? { id: payload.staffId } : {}),
                },
              },
              select: {
                staffMemberId: true,
                priceCentsOverride: true,
                discountPercentOverride: true,
                staffMember: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        });

        if (!service) {
          throw new HttpError(404, "Service not found");
        }

        const candidateStaff: CandidateStaff[] = service.serviceLinks.map((link) => ({
          id: link.staffMember.id,
          firstName: link.staffMember.firstName,
          lastName: link.staffMember.lastName,
          effectivePriceCents: computeEffectivePrice(
            service.priceCents,
            link.priceCentsOverride,
            link.discountPercentOverride
          ),
        }));

        if (candidateStaff.length === 0) {
          throw new HttpError(
            400,
            payload.staffId
              ? "Selected staff cannot perform this service"
              : "No active staff can perform this service"
          );
        }

        const staffIds = candidateStaff.map((staff) => staff.id);

        const dayStartLocal = startAtLocal.startOf("day");
        const dayEndLocal = dayStartLocal.plus({ days: 1 });
        const dayStartUtc = dayStartLocal.toUTC().toJSDate();
        const dayEndUtc = dayEndLocal.toUTC().toJSDate();
        const weekday = dayStartLocal.weekday % 7;
        const dateIso = dayStartLocal.toFormat("yyyy-MM-dd");
        const startAtMs = startAtLocal.toUTC().toMillis();

        const [rules, timeOffs, appointments] = await Promise.all([
          tx.availabilityRule.findMany({
            where: {
              staffMemberId: { in: staffIds },
              dayOfWeek: weekday,
              isActive: true,
            },
            select: {
              staffMemberId: true,
              startTime: true,
              endTime: true,
              effectiveFrom: true,
              effectiveTo: true,
            },
          }),
          tx.timeOff.findMany({
            where: {
              staffMemberId: { in: staffIds },
              startsAt: { lt: dayEndUtc },
              endsAt: { gt: dayStartUtc },
            },
            select: {
              staffMemberId: true,
              startsAt: true,
              endsAt: true,
            },
          }),
          tx.appointment.findMany({
            where: {
              staffMemberId: { in: staffIds },
              startsAt: { lt: dayEndUtc },
              endsAt: { gt: dayStartUtc },
              status: { not: AppointmentStatus.CANCELLED },
            },
            select: {
              staffMemberId: true,
              startsAt: true,
              endsAt: true,
            },
          }),
        ]);

        const workIntervalsByStaff = new Map<string, TimeInterval[]>();

        for (const rule of rules) {
          const effectiveFrom = rule.effectiveFrom
            ? DateTime.fromJSDate(rule.effectiveFrom, { zone: BRUSSELS_TIMEZONE }).startOf("day")
            : null;
          const effectiveTo = rule.effectiveTo
            ? DateTime.fromJSDate(rule.effectiveTo, { zone: BRUSSELS_TIMEZONE }).endOf("day")
            : null;

          const isApplicable =
            (!effectiveFrom || dayStartLocal >= effectiveFrom) &&
            (!effectiveTo || dayStartLocal <= effectiveTo);

          if (!isApplicable) {
            continue;
          }

          const start = buildDateTimeForDay(dateIso, rule.startTime);
          const end = buildDateTimeForDay(dateIso, rule.endTime);

          if (end <= start) {
            continue;
          }

          const intervals = workIntervalsByStaff.get(rule.staffMemberId) ?? [];
          intervals.push({ startMs: start.toUTC().toMillis(), endMs: end.toUTC().toMillis() });
          workIntervalsByStaff.set(rule.staffMemberId, intervals);
        }

        const blockedIntervalsByStaff = new Map<string, TimeInterval[]>();

        for (const timeOff of timeOffs) {
          const intervals = blockedIntervalsByStaff.get(timeOff.staffMemberId) ?? [];
          intervals.push({
            startMs: timeOff.startsAt.getTime(),
            endMs: timeOff.endsAt.getTime(),
          });
          blockedIntervalsByStaff.set(timeOff.staffMemberId, intervals);
        }

        for (const appointment of appointments) {
          const intervals = blockedIntervalsByStaff.get(appointment.staffMemberId) ?? [];
          intervals.push({
            startMs: appointment.startsAt.getTime(),
            endMs: appointment.endsAt.getTime(),
          });
          blockedIntervalsByStaff.set(appointment.staffMemberId, intervals);
        }

        const eligibleCandidates = candidateStaff
          .map((staff) => {
            const freeIntervals = subtractIntervals(
              workIntervalsByStaff.get(staff.id) ?? [],
              blockedIntervalsByStaff.get(staff.id) ?? []
            );
            const containingInterval = freeIntervals.find(
              (interval) => startAtMs >= interval.startMs && startAtMs < interval.endMs
            );
            const maxFreeMin = containingInterval
              ? Math.floor((containingInterval.endMs - startAtMs) / 60_000)
              : 0;

            return {
              ...staff,
              maxFreeMin,
              eligible: maxFreeMin >= service.durationMin,
            };
          })
          .filter((candidate) => candidate.eligible);

        if (eligibleCandidates.length === 0) {
          throw new HttpError(409, "Selected slot is no longer available");
        }

        const selectedStaff = payload.staffId
          ? eligibleCandidates.find((candidate) => candidate.id === payload.staffId)
          : eligibleCandidates.sort((a, b) => {
              if (a.effectivePriceCents !== b.effectivePriceCents) {
                return a.effectivePriceCents - b.effectivePriceCents;
              }

              if (a.maxFreeMin !== b.maxFreeMin) {
                return b.maxFreeMin - a.maxFreeMin;
              }

              return a.id.localeCompare(b.id);
            })[0];

        if (!selectedStaff) {
          throw new HttpError(409, "Selected slot is no longer available");
        }

        const startAtUtc = startAtLocal.toUTC();
        const endAtUtc = startAtUtc.plus({ minutes: service.durationMin });
        const startAt = startAtUtc.toJSDate();
        const endAt = endAtUtc.toJSDate();

        const email = payload.client.email?.toLowerCase();
        const phone = payload.client.phone;

        const [clientByEmail, clientByPhone] = await Promise.all([
          email ? tx.client.findUnique({ where: { email } }) : Promise.resolve(null),
          phone ? tx.client.findUnique({ where: { phone } }) : Promise.resolve(null),
        ]);

        if (clientByEmail && clientByPhone && clientByEmail.id !== clientByPhone.id) {
          throw new HttpError(409, "Client identity conflict between email and phone");
        }

        let client = clientByEmail ?? clientByPhone;

        if (!client) {
          client = await tx.client.create({
            data: {
              firstName: payload.client.firstName,
              lastName: payload.client.lastName,
              email,
              phone,
            },
          });
        } else {
          client = await tx.client.update({
            where: { id: client.id },
            data: {
              firstName: payload.client.firstName,
              lastName: payload.client.lastName,
              email: email ?? client.email,
              phone: phone ?? client.phone,
            },
          });
        }

        const appointment = await tx.appointment.create({
          data: {
            clientId: client.id,
            serviceId: service.id,
            staffMemberId: selectedStaff.id,
            startsAt: startAt,
            endsAt: endAt,
            status: AppointmentStatus.CONFIRMED,
            notes: payload.notes,
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
          },
        });

        return {
          appointment,
          staffName: `${selectedStaff.firstName} ${selectedStaff.lastName}`.trim(),
          serviceName: service.name,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    res.status(201).json({
      appointmentId: created.appointment.id,
      startAt: created.appointment.startsAt,
      endAt: created.appointment.endsAt,
      staffName: created.staffName,
      serviceName: created.serviceName,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    console.error("[publicAppointments.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
