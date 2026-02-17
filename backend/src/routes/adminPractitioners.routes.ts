import { Role } from "@prisma/client";
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { authRequired, requireRole } from "../middlewares/auth";

const practitionerStatusSchema = z.enum(["active", "inactive", "stagiaire"]);

const createPractitionerSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().email().optional(),
    status: practitionerStatusSchema.default("active"),
    defaultDiscount: z.number().int().min(0).max(100).nullable().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    createAccount: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.createAccount && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "email is required when createAccount=true",
      });
    }
  });

const updatePractitionerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    status: practitionerStatusSchema.optional(),
    defaultDiscount: z.number().int().min(0).max(100).nullable().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

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

function statusToFlags(status: "active" | "inactive" | "stagiaire") {
  return {
    isActive: status !== "inactive",
    isTrainee: status === "stagiaire",
    roleLabel: status === "stagiaire" ? "Stagiaire" : "Staff",
  };
}

function flagsToStatus(isActive: boolean, isTrainee: boolean): "active" | "inactive" | "stagiaire" {
  if (!isActive) {
    return "inactive";
  }
  if (isTrainee) {
    return "stagiaire";
  }
  return "active";
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function toDisplayEmail(email: string): string {
  return email.endsWith("@no-login.local") ? "" : email;
}

export const adminPractitionersRouter = Router();
adminPractitionersRouter.use(authRequired, requireRole(Role.ADMIN));

adminPractitionersRouter.get("/", async (_req, res) => {
  try {
    const practitioners = await prisma.staffMember.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isTrainee: true,
        defaultDiscountPercent: true,
        colorHex: true,
        userId: true,
      },
    });

    res.json(
      practitioners.map((p) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email: toDisplayEmail(p.email),
        status: flagsToStatus(p.isActive, p.isTrainee),
        defaultDiscount: p.defaultDiscountPercent,
        colorHex: p.colorHex,
        userId: p.userId ?? null,
        hasAccount: Boolean(p.userId),
      }))
    );
  } catch (error) {
    console.error("[adminPractitioners.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createPractitionerSchema, req.body);
    const parts = splitName(payload.name);
    const flags = statusToFlags(payload.status);
    const normalizedEmail = payload.email?.toLowerCase();

    let tempPassword: string | null = null;

    const created = await prisma.$transaction(async (tx) => {
      let userId: string | null = null;

      if (payload.createAccount && normalizedEmail) {
        const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
          throw new Error("EMAIL_ALREADY_USED");
        }

        tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            role: Role.STAFF,
            isActive: true,
            mustChangePassword: true,
          },
          select: { id: true },
        });
        userId = createdUser.id;
      }

      return tx.staffMember.create({
        data: {
          firstName: parts.firstName,
          lastName: parts.lastName,
          email: normalizedEmail ?? `${crypto.randomUUID()}@no-login.local`,
          role: flags.roleLabel,
          isActive: flags.isActive,
          isTrainee: flags.isTrainee,
          colorHex: payload.colorHex,
          defaultDiscountPercent: payload.defaultDiscount ?? null,
          userId: userId ?? undefined,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          isTrainee: true,
          defaultDiscountPercent: true,
          colorHex: true,
          userId: true,
        },
      });
    });

    res.status(201).json({
      id: created.id,
      name: `${created.firstName} ${created.lastName}`.trim(),
      email: toDisplayEmail(created.email),
      status: flagsToStatus(created.isActive, created.isTrainee),
      defaultDiscount: created.defaultDiscountPercent,
      colorHex: created.colorHex,
      userId: created.userId ?? null,
      hasAccount: Boolean(created.userId),
      tempPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Error && error.message === "EMAIL_ALREADY_USED") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    console.error("[adminPractitioners.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updatePractitionerSchema, req.body);
    const parts = payload.name ? splitName(payload.name) : null;
    const flags = payload.status ? statusToFlags(payload.status) : null;

    const existing = await prisma.staffMember.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    const updated = await prisma.staffMember.update({
      where: { id: req.params.id },
      data: {
        firstName: parts?.firstName,
        lastName: parts?.lastName,
        email: payload.email?.toLowerCase(),
        isActive: payload.isActive ?? flags?.isActive,
        isTrainee: flags?.isTrainee,
        role: flags?.roleLabel,
        colorHex: payload.colorHex,
        defaultDiscountPercent: payload.defaultDiscount,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        isTrainee: true,
        defaultDiscountPercent: true,
        colorHex: true,
        userId: true,
      },
    });

    if (updated.userId && payload.email) {
      await prisma.user.update({
        where: { id: updated.userId },
        data: { email: payload.email.toLowerCase() },
      });
    }

    res.json({
      id: updated.id,
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      email: toDisplayEmail(updated.email),
      status: flagsToStatus(updated.isActive, updated.isTrainee),
      defaultDiscount: updated.defaultDiscountPercent,
      colorHex: updated.colorHex,
      userId: updated.userId ?? null,
      hasAccount: Boolean(updated.userId),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    console.error("[adminPractitioners.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPractitionersRouter.patch("/:id/status", async (req, res) => {
  try {
    const payload = parseOrThrow(z.object({ status: practitionerStatusSchema }), req.body);
    const flags = statusToFlags(payload.status);

    const updated = await prisma.staffMember.update({
      where: { id: req.params.id },
      data: {
        isActive: flags.isActive,
        isTrainee: flags.isTrainee,
        role: flags.roleLabel,
      },
      select: {
        id: true,
        isActive: true,
        isTrainee: true,
      },
    });

    res.json({
      id: updated.id,
      status: flagsToStatus(updated.isActive, updated.isTrainee),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      res.status(404).json({ error: "Praticienne introuvable." });
      return;
    }

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminPractitioners.updateStatus]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
