import { Role } from "@prisma/client";
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { authRequired, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const ROLE_OWNER_EMAIL = "contact@leregarddemanon.com";

const userRoleSchema = z.enum([Role.ADMIN, Role.STAFF]);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: userRoleSchema.default(Role.STAFF),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

const resetPasswordSchema = z.object({
  password: z.string().min(8).optional(),
});

type AdminUserListItem = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  hasPractitioner: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: Role.ADMIN,
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

async function syncLegacyAdminUser(
  user: { email: string; passwordHash: string; role: Role },
  previousEmail?: string
): Promise<void> {
  if (user.role === Role.ADMIN) {
    await prisma.adminUser.upsert({
      where: { email: user.email },
      update: { passwordHash: user.passwordHash },
      create: { email: user.email, passwordHash: user.passwordHash },
    });
    if (previousEmail && previousEmail !== user.email) {
      await prisma.adminUser.deleteMany({
        where: { email: previousEmail },
      });
    }
    return;
  }

  await prisma.adminUser.deleteMany({
    where: previousEmail && previousEmail !== user.email ? { email: { in: [user.email, previousEmail] } } : { email: user.email },
  });
}

function serializeUser(user: AdminUserListItem) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasPractitioner: user.hasPractitioner,
  };
}

export const adminUsersRouter = Router();

adminUsersRouter.use(authRequired, requireRole(Role.ADMIN));

adminUsersRouter.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: {
            id: true,
          },
        },
      },
    });

    res.json(
      users.map((user) =>
        serializeUser({
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          hasPractitioner: Boolean(user.practitioner),
        })
      )
    );
  } catch (error) {
    console.error("[adminUsers.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.post("/", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les comptes utilisateurs." });
      return;
    }

    const payload = parseOrThrow(createUserSchema, req.body);
    const email = normalizeEmail(payload.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    const password = payload.password ?? generateTempPassword();
    const passwordHash = await hashPassword(password);
    const mustChangePassword = payload.mustChangePassword ?? !payload.password;

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: payload.role,
        isActive: payload.isActive ?? true,
        mustChangePassword,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: {
            id: true,
          },
        },
      },
    });

    await syncLegacyAdminUser({
      email: created.email,
      passwordHash,
      role: created.role,
    });

    res.status(201).json({
      ...serializeUser({
        id: created.id,
        email: created.email,
        role: created.role,
        isActive: created.isActive,
        mustChangePassword: created.mustChangePassword,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        hasPractitioner: Boolean(created.practitioner),
      }),
      tempPassword: payload.password ? null : password,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      res.status(409).json({ error: "Email deja utilise." });
      return;
    }

    console.error("[adminUsers.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.patch("/:id", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les comptes utilisateurs." });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(updateUserSchema, req.body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        passwordHash: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }

    const nextEmail = payload.email ? normalizeEmail(payload.email) : existing.email;
    const nextRole = payload.role ?? existing.role;
    const nextIsActive = payload.isActive ?? existing.isActive;

    if (payload.email && nextEmail !== existing.email) {
      const emailOwner = await prisma.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
      if (emailOwner && emailOwner.id !== existing.id) {
        res.status(409).json({ error: "Email deja utilise." });
        return;
      }
    }

    if (existing.role === Role.ADMIN && existing.isActive && nextRole !== Role.ADMIN) {
      const activeAdminsWithoutTarget = await countActiveAdmins(existing.id);
      if (activeAdminsWithoutTarget === 0) {
        res.status(409).json({ error: "Impossible de retirer le role admin: il doit rester au moins un admin actif." });
        return;
      }
      if (existing.id === auth.id) {
        res.status(409).json({ error: "Vous ne pouvez pas retirer vos propres droits administrateur." });
        return;
      }
    }

    if (existing.role === Role.ADMIN && existing.isActive && !nextIsActive) {
      const activeAdminsWithoutTarget = await countActiveAdmins(existing.id);
      if (activeAdminsWithoutTarget === 0) {
        res.status(409).json({ error: "Impossible de desactiver le dernier admin actif." });
        return;
      }
      if (existing.id === auth.id) {
        res.status(409).json({ error: "Vous ne pouvez pas desactiver votre propre compte admin." });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        email: payload.email ? nextEmail : undefined,
        role: payload.role,
        isActive: payload.isActive,
        mustChangePassword: payload.mustChangePassword,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: {
            id: true,
          },
        },
      },
    });

    await syncLegacyAdminUser({
      email: updated.email,
      passwordHash: existing.passwordHash,
      role: updated.role,
    }, existing.email);

    res.json(
      serializeUser({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        hasPractitioner: Boolean(updated.practitioner),
      })
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminUsers.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.post("/:id/reset-password", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les comptes utilisateurs." });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const payload = parseOrThrow(resetPasswordSchema, req.body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }

    const tempPassword = payload.password ?? generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    await syncLegacyAdminUser({
      email: existing.email,
      passwordHash,
      role: existing.role,
    });

    res.json({
      id: existing.id,
      email: existing.email,
      tempPassword,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminUsers.resetPassword]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.post("/:id/change-role", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les droits administrateur." });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = parseOrThrow(z.object({ role: userRoleSchema }), req.body);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }

    if (existing.id === auth.id && body.role !== Role.ADMIN) {
      res.status(409).json({ error: "Vous ne pouvez pas retirer vos propres droits administrateur." });
      return;
    }

    if (existing.role === Role.ADMIN && existing.isActive && body.role !== Role.ADMIN) {
      const activeAdminsWithoutTarget = await countActiveAdmins(existing.id);
      if (activeAdminsWithoutTarget === 0) {
        res.status(409).json({ error: "Impossible de retirer le role admin: il doit rester au moins un admin actif." });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: { id: true },
        },
      },
    });

    await syncLegacyAdminUser({
      email: updated.email,
      passwordHash: existing.passwordHash,
      role: updated.role,
    });

    res.json(
      serializeUser({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        hasPractitioner: Boolean(updated.practitioner),
      })
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminUsers.changeRole]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.post("/:id/make-admin", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les droits administrateur." });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }

    if (existing.id === auth.id) {
      res.status(409).json({ error: "Vous ne pouvez pas modifier vos propres droits administrateur." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { role: Role.ADMIN },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: { id: true },
        },
      },
    });

    await syncLegacyAdminUser({
      email: updated.email,
      passwordHash: existing.passwordHash,
      role: updated.role,
    });

    res.json(
      serializeUser({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        hasPractitioner: Boolean(updated.practitioner),
      })
    );
  } catch (error) {
    console.error("[adminUsers.makeAdmin]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminUsersRouter.post("/:id/toggle-active", async (req, res) => {
  try {
    const auth = (req as unknown as AuthenticatedRequest).user;
    if (normalizeEmail(auth.email) !== ROLE_OWNER_EMAIL) {
      res.status(403).json({ error: "Seul le compte contact@leregarddemanon.com peut gerer les comptes utilisateurs." });
      return;
    }

    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }

    const nextActive = !existing.isActive;

    if (existing.id === auth.id && !nextActive) {
      res.status(409).json({ error: "Vous ne pouvez pas desactiver votre propre compte admin." });
      return;
    }

    if (existing.role === Role.ADMIN && existing.isActive && !nextActive) {
      const activeAdminsWithoutTarget = await countActiveAdmins(existing.id);
      if (activeAdminsWithoutTarget === 0) {
        res.status(409).json({ error: "Impossible de desactiver le dernier admin actif." });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: nextActive },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        practitioner: {
          select: { id: true },
        },
      },
    });

    await syncLegacyAdminUser({
      email: updated.email,
      passwordHash: existing.passwordHash,
      role: updated.role,
    });

    res.json(
      serializeUser({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        hasPractitioner: Boolean(updated.practitioner),
      })
    );
  } catch (error) {
    console.error("[adminUsers.toggleActive]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
