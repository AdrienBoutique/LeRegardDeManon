import { AppointmentStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  BRUSSELS_TIMEZONE,
  subtractIntervals,
  TimeInterval,
} from "../lib/time";
import { buildInstituteIntervals, buildStaffWorkIntervals } from "../lib/availability";
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

const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : undefined))
  .transform((value) => (value && value.length > 0 ? value : undefined));

const createAppointmentSchema = z.object({
  staffId: optionalNullableString,
  startAt: z.string().datetime({ offset: true }),
  services: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        priceCents: z.number().int().min(0).optional(),
      })
    )
    .min(1)
    .optional(),
  serviceId: z.string().min(1).optional(),
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
}).superRefine((value, ctx) => {
  if ((!value.services || value.services.length === 0) && !value.serviceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "services or serviceId is required",
      path: ["services"],
    });
  }
});

type ServiceLinkRow = {
  staffMemberId: string;
  priceCentsOverride: number | null;
  discountPercentOverride: number | null;
  staffMember: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

type ServiceWithLinks = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  serviceLinks: ServiceLinkRow[];
};

type ItemSnapshot = {
  serviceId: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  order: number;
};

type CandidateStaff = {
  id: string;
  firstName: string;
  lastName: string;
  maxFreeMin: number;
  totalDurationMin: number;
  totalPriceCents: number;
  itemSnapshots: ItemSnapshot[];
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

publicAppointmentsRouter.post(["/appointments", "/public/appointments"], async (req, res) => {
  try {
    const payload = parseOrThrow(createAppointmentSchema, req.body);
    const requestedServices =
      payload.services && payload.services.length > 0
        ? payload.services
        : payload.serviceId
          ? [{ serviceId: payload.serviceId }]
          : [];

    const startAtRaw = DateTime.fromISO(payload.startAt, { setZone: true });
    if (!startAtRaw.isValid) {
      res.status(400).json({ error: "startAt must be a valid ISO datetime" });
      return;
    }

    const startAtLocal = startAtRaw.setZone(BRUSSELS_TIMEZONE);

    const created = await prisma.$transaction(
      async (tx) => {
        const uniqueServiceIds = Array.from(new Set(requestedServices.map((service) => service.serviceId)));

        const services = await tx.service.findMany({
          where: {
            id: { in: uniqueServiceIds },
            isActive: true,
          },
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

        const serviceById = new Map<string, ServiceWithLinks>(services.map((service) => [service.id, service]));
        const missingServiceIds = uniqueServiceIds.filter((serviceId) => !serviceById.has(serviceId));

        if (missingServiceIds.length > 0) {
          throw new HttpError(404, "One or more services not found");
        }

        const candidateStaffIds = payload.staffId
          ? [payload.staffId]
          : uniqueServiceIds.reduce<string[] | null>((acc, serviceId) => {
              const service = serviceById.get(serviceId)!;
              const staffIds = service.serviceLinks.map((link) => link.staffMemberId);

              if (acc === null) {
                return staffIds;
              }

              const current = new Set(staffIds);
              return acc.filter((id) => current.has(id));
            }, null) ?? [];

        if (candidateStaffIds.length === 0) {
          throw new HttpError(
            400,
            payload.staffId
              ? "Selected staff cannot perform all selected services"
              : "No active staff can perform the selected services"
          );
        }

        const candidateById = new Map<string, CandidateStaff>();
        for (const staffId of candidateStaffIds) {
          const snapshots: ItemSnapshot[] = [];
          let totalDurationMin = 0;
          let totalPriceCents = 0;
          let firstName = "";
          let lastName = "";

          for (let index = 0; index < requestedServices.length; index += 1) {
            const requested = requestedServices[index];
            const service = serviceById.get(requested.serviceId)!;
            const link = service.serviceLinks.find((entry) => entry.staffMemberId === staffId);
            if (!link) {
              throw new HttpError(400, "Selected staff cannot perform all selected services");
            }

            if (index === 0) {
              firstName = link.staffMember.firstName;
              lastName = link.staffMember.lastName;
            }

            const snapshotPrice =
              requested.priceCents ??
              computeEffectivePrice(
                service.priceCents,
                link.priceCentsOverride,
                link.discountPercentOverride
              );

            snapshots.push({
              serviceId: service.id,
              serviceName: service.name,
              durationMin: service.durationMin,
              priceCents: snapshotPrice,
              order: index,
            });
            totalDurationMin += service.durationMin;
            totalPriceCents += snapshotPrice;
          }

          candidateById.set(staffId, {
            id: staffId,
            firstName,
            lastName,
            maxFreeMin: 0,
            totalDurationMin,
            totalPriceCents,
            itemSnapshots: snapshots,
          });
        }

        const dayStartLocal = startAtLocal.startOf("day");
        const dayEndLocal = dayStartLocal.plus({ days: 1 });
        const dayStartUtc = dayStartLocal.toUTC().toJSDate();
        const dayEndUtc = dayEndLocal.toUTC().toJSDate();
        const weekday = dayStartLocal.weekday % 7;
        const dateIso = dayStartLocal.toFormat("yyyy-MM-dd");
        const startAtMs = startAtLocal.toUTC().toMillis();

        const [rules, instituteRules, timeOffs, appointments] = await Promise.all([
          tx.availabilityRule.findMany({
            where: {
              staffMemberId: { in: candidateStaffIds },
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
          tx.instituteAvailabilityRule.findMany({
            where: {
              dayOfWeek: weekday,
              isActive: true,
            },
            select: {
              startTime: true,
              endTime: true,
            },
          }),
          tx.timeOff.findMany({
            where: {
              staffMemberId: { in: candidateStaffIds },
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
              staffMemberId: { in: candidateStaffIds },
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

        const instituteIntervals = buildInstituteIntervals(dateIso, dayStartLocal, instituteRules);
        const workIntervalsByStaff = buildStaffWorkIntervals(
          dateIso,
          dayStartLocal,
          rules,
          instituteIntervals
        );
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

        const eligibleCandidates = Array.from(candidateById.values())
          .map((candidate) => {
            const freeIntervals = subtractIntervals(
              workIntervalsByStaff.get(candidate.id) ?? [],
              blockedIntervalsByStaff.get(candidate.id) ?? []
            );
            const containingInterval = freeIntervals.find(
              (interval) => startAtMs >= interval.startMs && startAtMs < interval.endMs
            );
            const maxFreeMin = containingInterval
              ? Math.floor((containingInterval.endMs - startAtMs) / 60_000)
              : 0;

            return {
              ...candidate,
              maxFreeMin,
              eligible: maxFreeMin >= candidate.totalDurationMin,
            };
          })
          .filter((candidate) => candidate.eligible);

        if (eligibleCandidates.length === 0) {
          throw new HttpError(409, "Selected slot is no longer available");
        }

        const selectedStaff = payload.staffId
          ? eligibleCandidates.find((candidate) => candidate.id === payload.staffId)
          : eligibleCandidates.sort((a, b) => {
              if (a.totalPriceCents !== b.totalPriceCents) {
                return a.totalPriceCents - b.totalPriceCents;
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
        const endAtUtc = startAtUtc.plus({ minutes: selectedStaff.totalDurationMin });
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

        await tx.appointmentItem.createMany({
          data: selectedStaff.itemSnapshots.map((item) => ({
            appointmentId: appointment.id,
            serviceId: item.serviceId,
            order: item.order,
            durationMin: item.durationMin,
            priceCents: item.priceCents,
          })),
        });

        return {
          appointment,
          staffName: `${selectedStaff.firstName} ${selectedStaff.lastName}`.trim(),
          serviceName: selectedStaff.itemSnapshots.map((item) => item.serviceName).join(" + "),
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
