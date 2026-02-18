import { Role } from "@prisma/client";
import { hashPassword } from "./password";
import { prisma } from "./prisma";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const rawEmail = process.env.ADMIN_EMAIL;
  const rawPassword = process.env.ADMIN_PASSWORD;

  if (!rawEmail && !rawPassword) {
    return;
  }

  if (!rawEmail || !rawPassword) {
    console.warn("[admin:bootstrap] skipped: ADMIN_EMAIL and ADMIN_PASSWORD must both be set");
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  const password = rawPassword;

  if (!isValidEmail(email)) {
    throw new Error("[admin:bootstrap] invalid ADMIN_EMAIL");
  }

  if (password.length < 8) {
    throw new Error("[admin:bootstrap] ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.adminUser.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    }),
    prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
      },
      create: {
        email,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: false,
      },
    }),
  ]);

  console.log(`[admin:bootstrap] ensured admin account ${email}`);
}
