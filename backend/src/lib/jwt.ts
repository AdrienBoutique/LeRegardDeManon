import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export type AuthJwtPayload = {
  sub: string;
  role: Role;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  return secret;
}

export function signAuthToken(payload: AuthJwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthJwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const { sub, role } = decoded as { sub?: unknown; role?: unknown };

  if (typeof sub !== "string") {
    throw new Error("Invalid token payload shape");
  }

  if (role !== "ADMIN" && role !== "STAFF") {
    throw new Error("Invalid token role");
  }
//d
  return { sub, role };
}
