import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole } from "../middlewares/auth";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");

  return { firstName, lastName };
}

const createStaffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  active: z.boolean().optional(),
  isTrainee: z.boolean().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  defaultDiscountPercent: z.int().min(0).max(100).nullable().optional(),
  phone: z.string().min(1).optional(),
});

const updateStaffSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    active: z.boolean().optional(),
    isTrainee: z.boolean().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    defaultDiscountPercent: z.int().min(0).max(100).nullable().optional(),
    phone: z.string().min(1).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

const assignStaffServiceSchema = z
  .object({
    serviceId: z.string().min(1),
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

export const adminStaffRouter = Router();

adminStaffRouter.get("/", authRequired, requireRole(Role.ADMIN, Role.STAFF), async (_req, res) => {
  try {
    const staff = await prisma.staffMember.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json(
      staff.map((member) => ({
        id: member.id,
        name: `${member.firstName} ${member.lastName}`.trim(),
        email: member.email,
        active: member.isActive,
        isTrainee: member.isTrainee,
        colorHex: member.colorHex,
        defaultDiscountPercent: member.defaultDiscountPercent,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      }))
    );
  } catch (error) {
    console.error("[adminStaff.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminStaffRouter.post("/", ...authAdmin, async (req, res) => {
  try {
    const payload = parseOrThrow(createStaffSchema, req.body);
    const { firstName, lastName } = splitName(payload.name);

    const created = await prisma.staffMember.create({
      data: {
        firstName,
        lastName,
        email: payload.email.toLowerCase(),
        phone: payload.phone,
        role: payload.isTrainee ? "Stagiaire" : "Staff",
        isActive: payload.active ?? true,
        isTrainee: payload.isTrainee ?? false,
        colorHex: payload.colorHex,
        defaultDiscountPercent: payload.defaultDiscountPercent ?? null,
      },
    });

    res.status(201).json({
      id: created.id,
      name: `${created.firstName} ${created.lastName}`.trim(),
      email: created.email,
      active: created.isActive,
      isTrainee: created.isTrainee,
      colorHex: created.colorHex,
      defaultDiscountPercent: created.defaultDiscountPercent,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminStaff.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminStaffRouter.patch("/:id", ...authAdmin, async (req, res) => {
  try {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(updateStaffSchema, req.body);

    const nameParts = payload.name ? splitName(payload.name) : null;

    const updated = await prisma.staffMember.update({
      where: { id: staffId },
      data: {
        firstName: nameParts?.firstName,
        lastName: nameParts?.lastName,
        email: payload.email?.toLowerCase(),
        phone: payload.phone === null ? null : payload.phone,
        isActive: payload.active,
        isTrainee: payload.isTrainee,
        colorHex: payload.colorHex,
        defaultDiscountPercent: payload.defaultDiscountPercent,
        role:
          payload.isTrainee === undefined
            ? undefined
            : payload.isTrainee
              ? "Stagiaire"
              : "Staff",
      },
    });

    res.json({
      id: updated.id,
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      email: updated.email,
      active: updated.isActive,
      isTrainee: updated.isTrainee,
      colorHex: updated.colorHex,
      defaultDiscountPercent: updated.defaultDiscountPercent,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminStaff.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminStaffRouter.get("/:id/services", ...authAdmin, async (req, res) => {
  try {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const links = await prisma.serviceStaff.findMany({
      where: {
        staffMemberId: staffId,
      },
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
            durationMin: true,
            priceCents: true,
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
        serviceName: link.service.name,
        serviceDurationMin: link.service.durationMin,
        serviceActive: link.service.isActive,
        basePriceCents: link.service.priceCents,
        priceCentsOverride: link.priceCentsOverride,
        discountPercentOverride: link.discountPercentOverride,
        effectivePriceCents: computeEffectivePrice(
          link.service.priceCents,
          link.priceCentsOverride,
          link.discountPercentOverride
        ),
        createdAt: link.createdAt,
      }))
    );
  } catch (error) {
    console.error("[adminStaff.listServices]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminStaffRouter.post("/:id/services", ...authAdmin, async (req, res) => {
  try {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(assignStaffServiceSchema, req.body);

    const created = await prisma.serviceStaff.create({
      data: {
        staffMemberId: staffId,
        serviceId: payload.serviceId,
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

    console.error("[adminStaff.assignService]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminStaffRouter.delete("/:id", ...authAdmin, async (req, res) => {
  try {
    const staffId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await prisma.staffMember.update({
      where: { id: staffId },
      data: { isActive: false },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminStaff.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
