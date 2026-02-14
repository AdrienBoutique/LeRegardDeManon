import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

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

const pricingOverrideSchema = z
  .object({
    priceCentsOverride: z.int().nonnegative().nullable().optional(),
    discountPercentOverride: z.int().min(0).max(100).nullable().optional(),
  })
  .refine(
    (payload) =>
      !(
        payload.priceCentsOverride !== undefined &&
        payload.discountPercentOverride !== undefined &&
        payload.priceCentsOverride !== null &&
        payload.discountPercentOverride !== null
      ),
    { message: "Use either priceCentsOverride or discountPercentOverride, not both" }
  );

const createServiceStaffSchema = pricingOverrideSchema.extend({
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
});

const updateServiceStaffSchema = pricingOverrideSchema
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

export const adminServiceStaffRouter = Router();

adminServiceStaffRouter.use(authAdmin);

adminServiceStaffRouter.get("/", async (_req, res) => {
  try {
    const links = await prisma.serviceStaff.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        serviceId: true,
        staffMemberId: true,
        priceCentsOverride: true,
        discountPercentOverride: true,
        createdAt: true,
        service: {
          select: {
            name: true,
            priceCents: true,
            isActive: true,
          },
        },
        staffMember: {
          select: {
            firstName: true,
            lastName: true,
            isActive: true,
          },
        },
      },
    });

    res.json(
      links.map((link) => ({
        id: link.id,
        serviceId: link.serviceId,
        staffId: link.staffMemberId,
        priceCentsOverride: link.priceCentsOverride,
        discountPercentOverride: link.discountPercentOverride,
        basePriceCents: link.service.priceCents,
        effectivePriceCents: computeEffectivePrice(
          link.service.priceCents,
          link.priceCentsOverride,
          link.discountPercentOverride
        ),
        serviceName: link.service.name,
        serviceActive: link.service.isActive,
        staffName: `${link.staffMember.firstName} ${link.staffMember.lastName}`.trim(),
        staffActive: link.staffMember.isActive,
        createdAt: link.createdAt,
      }))
    );
  } catch (error) {
    console.error("[adminServiceStaff.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServiceStaffRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createServiceStaffSchema, req.body);

    const created = await prisma.serviceStaff.create({
      data: {
        serviceId: payload.serviceId,
        staffMemberId: payload.staffId,
        priceCentsOverride: payload.priceCentsOverride ?? null,
        discountPercentOverride: payload.discountPercentOverride ?? null,
      },
      select: {
        id: true,
        serviceId: true,
        staffMemberId: true,
        priceCentsOverride: true,
        discountPercentOverride: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      id: created.id,
      serviceId: created.serviceId,
      staffId: created.staffMemberId,
      priceCentsOverride: created.priceCentsOverride,
      discountPercentOverride: created.discountPercentOverride,
      createdAt: created.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminServiceStaff.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServiceStaffRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updateServiceStaffSchema, req.body);

    const updated = await prisma.serviceStaff.update({
      where: { id: req.params.id },
      data: {
        priceCentsOverride: payload.priceCentsOverride,
        discountPercentOverride: payload.discountPercentOverride,
      },
      select: {
        id: true,
        serviceId: true,
        staffMemberId: true,
        priceCentsOverride: true,
        discountPercentOverride: true,
      },
    });

    res.json({
      id: updated.id,
      serviceId: updated.serviceId,
      staffId: updated.staffMemberId,
      priceCentsOverride: updated.priceCentsOverride,
      discountPercentOverride: updated.discountPercentOverride,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminServiceStaff.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServiceStaffRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.serviceStaff.delete({
      where: { id: req.params.id },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminServiceStaff.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
