import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { comparePassword } from "../lib/password";
import { signAdminToken } from "../lib/jwt";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = parseOrThrow(loginSchema, req.body);

    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!admin) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValidPassword = await comparePassword(password, admin.passwordHash);

    if (!isValidPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signAdminToken({ id: admin.id, email: admin.email });
    res.json({ token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminAuth.login]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
