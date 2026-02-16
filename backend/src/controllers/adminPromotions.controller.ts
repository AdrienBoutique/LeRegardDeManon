import { Request, Response } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const isoDateSchema = z.string().datetime({ offset: true });

const createPromotionSchema = z
  .object({
    title: z.string().trim().min(1),
    subtitle: z.string().trim().optional(),
    description: z.string().trim().optional(),
    discountType: z.enum(["PERCENT", "FIXED"]),
    discountValueInt: z.number().int().min(0),
    startAt: isoDateSchema,
    endAt: isoDateSchema,
    active: z.boolean(),
    serviceIds: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const start = new Date(payload.startAt);
    const end = new Date(payload.endAt);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endAt must be after startAt",
        path: ["endAt"],
      });
    }
  });

const updatePromotionSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    subtitle: z.string().trim().nullable().optional(),
    description: z.string().trim().nullable().optional(),
    discountType: z.enum(["PERCENT", "FIXED"]).optional(),
    discountValueInt: z.number().int().min(0).optional(),
    startAt: isoDateSchema.optional(),
    endAt: isoDateSchema.optional(),
    active: z.boolean().optional(),
    serviceIds: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

const togglePromotionSchema = z
  .object({
    active: z.boolean(),
  })
  .strict();

function getRouteId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

async function assertServicesExist(serviceIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(serviceIds));
  const services = await prisma.service.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });

  if (services.length !== uniqueIds.length) {
    throw new Error("One or more serviceIds are invalid");
  }
}

function computeDiscountedPriceCents(
  priceCents: number,
  discountType: "PERCENT" | "FIXED",
  discountValueInt: number
): number {
  if (discountType === "PERCENT") {
    return Math.max(0, Math.round((priceCents * (100 - discountValueInt)) / 100));
  }

  return Math.max(0, priceCents - discountValueInt);
}

function computeDiscountLabel(discountType: "PERCENT" | "FIXED", discountValueInt: number): string {
  if (discountType === "PERCENT") {
    return `-${discountValueInt}%`;
  }

  const euros = discountValueInt / 100;
  const isInteger = Number.isInteger(euros);
  const value = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(euros);
  return `-${value}\u20AC`;
}

function mapPromotion(promotion: {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValueInt: number;
  startAt: Date;
  endAt: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  services: Array<{
    service: {
      id: string;
      name: string;
      priceCents: number;
      durationMin: number;
      isActive: boolean;
    };
  }>;
}) {
  const computedDiscountLabel = computeDiscountLabel(promotion.discountType, promotion.discountValueInt);

  return {
    id: promotion.id,
    title: promotion.title,
    subtitle: promotion.subtitle,
    description: promotion.description,
    discountType: promotion.discountType,
    discountValueInt: promotion.discountValueInt,
    computedDiscountLabel,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    active: promotion.active,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt,
    services: promotion.services.map((link) => {
      const discountedPriceCents = computeDiscountedPriceCents(
        link.service.priceCents,
        promotion.discountType,
        promotion.discountValueInt
      );

      return {
        id: link.service.id,
        name: link.service.name,
        priceCents: link.service.priceCents,
        durationMin: link.service.durationMin,
        active: link.service.isActive,
        discountedPriceCents,
        discountLabel: computedDiscountLabel,
      };
    }),
  };
}

async function findPromotionById(id: string) {
  return prisma.promotion.findUnique({
    where: { id },
    include: {
      services: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              priceCents: true,
              durationMin: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

export async function listAdminPromotions(_req: Request, res: Response): Promise<void> {
  try {
    const promotions = await prisma.promotion.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                durationMin: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    res.json(promotions.map(mapPromotion));
  } catch (error) {
    console.error("[adminPromotions.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createAdminPromotion(req: Request, res: Response): Promise<void> {
  try {
    const payload = parseOrThrow(createPromotionSchema, req.body);
    const uniqueServiceIds = Array.from(new Set(payload.serviceIds));
    await assertServicesExist(uniqueServiceIds);

    const created = await prisma.promotion.create({
      data: {
        title: payload.title,
        subtitle: payload.subtitle ?? null,
        description: payload.description ?? null,
        discountType: payload.discountType,
        discountValueInt: payload.discountValueInt,
        startAt: new Date(payload.startAt),
        endAt: new Date(payload.endAt),
        active: payload.active,
        services: {
          create: uniqueServiceIds.map((serviceId) => ({ serviceId })),
        },
      },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                durationMin: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(mapPromotion(created));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Error && error.message.includes("serviceIds")) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error("[adminPromotions.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateAdminPromotion(req: Request, res: Response): Promise<void> {
  try {
    const payload = parseOrThrow(updatePromotionSchema, req.body);
    const promotionId = getRouteId(req);

    const existing = await prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { id: true, startAt: true, endAt: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }

    const nextStartAt = payload.startAt ? new Date(payload.startAt) : existing.startAt;
    const nextEndAt = payload.endAt ? new Date(payload.endAt) : existing.endAt;
    if (nextStartAt >= nextEndAt) {
      res.status(400).json({ error: "endAt must be after startAt" });
      return;
    }

    const uniqueServiceIds = payload.serviceIds ? Array.from(new Set(payload.serviceIds)) : null;
    if (uniqueServiceIds !== null) {
      await assertServicesExist(uniqueServiceIds);
    }

    await prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id: promotionId },
        data: {
          title: payload.title,
          subtitle: payload.subtitle === undefined ? undefined : payload.subtitle ?? null,
          description: payload.description === undefined ? undefined : payload.description ?? null,
          discountType: payload.discountType,
          discountValueInt: payload.discountValueInt,
          startAt: payload.startAt ? new Date(payload.startAt) : undefined,
          endAt: payload.endAt ? new Date(payload.endAt) : undefined,
          active: payload.active,
        },
      });

      if (uniqueServiceIds !== null) {
        await tx.promotionService.deleteMany({ where: { promotionId } });
        if (uniqueServiceIds.length > 0) {
          await tx.promotionService.createMany({
            data: uniqueServiceIds.map((serviceId) => ({ promotionId, serviceId })),
          });
        }
      }
    });

    const updated = await findPromotionById(promotionId);
    if (!updated) {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }

    res.json(mapPromotion(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Error && error.message.includes("serviceIds")) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }

    console.error("[adminPromotions.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function toggleAdminPromotion(req: Request, res: Response): Promise<void> {
  try {
    const payload = parseOrThrow(togglePromotionSchema, req.body);
    const promotionId = getRouteId(req);

    const updated = await prisma.promotion.update({
      where: { id: promotionId },
      data: { active: payload.active },
    });

    res.json({
      id: updated.id,
      active: updated.active,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }

    console.error("[adminPromotions.toggle]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteAdminPromotion(req: Request, res: Response): Promise<void> {
  try {
    const promotionId = getRouteId(req);
    await prisma.promotion.delete({
      where: { id: promotionId },
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Promotion not found" });
      return;
    }

    console.error("[adminPromotions.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function listPublicActivePromotions(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const promotions = await prisma.promotion.findMany({
      where: {
        active: true,
        startAt: { lte: now },
        endAt: { gte: now },
      },
      orderBy: { endAt: "asc" },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                durationMin: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    res.json(promotions.map(mapPromotion));
  } catch (error) {
    console.error("[publicPromotions.active]", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
