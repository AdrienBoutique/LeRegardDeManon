import jwt from "jsonwebtoken";

export type AdminJwtPayload = {
  id: string;
  email: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  return secret;
}

export function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());

  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const { id, email } = decoded as { id?: unknown; email?: unknown };

  if (typeof id !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload shape");
  }

  return { id, email };
}
