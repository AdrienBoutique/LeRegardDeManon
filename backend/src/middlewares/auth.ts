import { NextFunction, Request, Response } from "express";
import { Role, User } from "@prisma/client";
import { verifyAuthToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export type AuthenticatedRequest = Request & {
  user: Pick<User, "id" | "email" | "role" | "isActive" | "mustChangePassword">;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

export async function authRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid or inactive user" });
      return;
    }

    if (user.role !== payload.role) {
      res.status(401).json({ error: "Invalid token role" });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const role = authReq.user?.role;

    if (!role || !roles.includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
