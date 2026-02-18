import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { signAuthToken } from "../lib/jwt";
import { comparePassword, hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { AuthenticatedRequest, authRequired } from "../middlewares/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8),
});

type LoginResult = {
  token: string;
  user: {
    id: string;
    email: string;
    role: Role;
    mustChangePassword: boolean;
  };
  practitionerId: string | null;
};

function isAuthSchemaMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

async function findOrProvisionUserFromAdmin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (!admin) {
    return null;
  }

  const valid = await comparePassword(password, admin.passwordHash);
  if (!valid) {
    return null;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: admin.passwordHash,
      role: Role.ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      email,
      passwordHash: admin.passwordHash,
      role: Role.ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });

  return user;
}

async function buildLoginResult(userId: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      practitioner: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    throw new Error("Invalid user");
  }

  const token = signAuthToken({ sub: user.id, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    practitionerId: user.practitioner?.id ?? null,
  };
}

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = parseOrThrow(loginSchema, req.body);
    const normalizedEmail = email.toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive || !(await comparePassword(password, user.passwordHash))) {
      const provisioned = await findOrProvisionUserFromAdmin(normalizedEmail, password);
      if (!provisioned) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const payload = await buildLoginResult(provisioned.id);
      res.json(payload);
      return;
    }

    const payload = await buildLoginResult(user.id);
    res.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (isAuthSchemaMissingError(error)) {
      res.status(500).json({
        error: "Schema auth non migre. Lancez `npx prisma migrate dev -n add_auth_users_practitioners_link` puis `npx prisma generate`.",
      });
      return;
    }

    console.error("[auth.login]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.get("/me", authRequired, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const payload = await buildLoginResult(userId);
    res.json({
      user: payload.user,
      practitionerId: payload.practitionerId,
    });
  } catch (error) {
    if (isAuthSchemaMissingError(error)) {
      res.status(500).json({
        error: "Schema auth non migre. Lancez `npx prisma migrate dev -n add_auth_users_practitioners_link` puis `npx prisma generate`.",
      });
      return;
    }

    console.error("[auth.me]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/change-password", authRequired, async (req, res) => {
  try {
    const body = parseOrThrow(changePasswordSchema, req.body);
    const auth = (req as AuthenticatedRequest).user;
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!user.mustChangePassword) {
      if (!body.currentPassword) {
        res.status(400).json({ error: "currentPassword is required" });
        return;
      }
      const validCurrent = await comparePassword(body.currentPassword, user.passwordHash);
      if (!validCurrent) {
        res.status(401).json({ error: "Invalid currentPassword" });
        return;
      }
    }

    const newPasswordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    const payload = await buildLoginResult(user.id);
    res.json({
      token: payload.token,
      user: payload.user,
      practitionerId: payload.practitionerId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (isAuthSchemaMissingError(error)) {
      res.status(500).json({
        error: "Schema auth non migre. Lancez `npx prisma migrate dev -n add_auth_users_practitioners_link` puis `npx prisma generate`.",
      });
      return;
    }

    console.error("[auth.changePassword]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
