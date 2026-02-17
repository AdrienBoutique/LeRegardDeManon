import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { signAuthToken } from "../lib/jwt";
import { comparePassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function isAuthSchemaMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = parseOrThrow(loginSchema, req.body);
    const normalized = email.toLowerCase();

    let user = await prisma.user.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      const admin = await prisma.adminUser.findUnique({ where: { email: normalized } });
      if (!admin) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const validLegacy = await comparePassword(password, admin.passwordHash);
      if (!validLegacy) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      user = await prisma.user.create({
        data: {
          email: normalized,
          passwordHash: admin.passwordHash,
          role: Role.ADMIN,
          isActive: true,
          mustChangePassword: false,
        },
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          isActive: true,
          mustChangePassword: true,
        },
      });
    }

    if (!user.isActive || user.role !== Role.ADMIN) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signAuthToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
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

    console.error("[adminAuth.login]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
