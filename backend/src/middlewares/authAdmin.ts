import { NextFunction, Request, Response } from "express";
import { verifyAdminToken } from "../lib/jwt";

export type AuthenticatedRequest = Request & {
  admin: {
    id: string;
    email: string;
  };
};

export function authAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const payload = verifyAdminToken(token);
    (req as AuthenticatedRequest).admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
