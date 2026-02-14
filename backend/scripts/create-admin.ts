import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type CliOptions = {
  email?: string;
  password?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--email" && next) {
      options.email = next;
      index += 1;
      continue;
    }

    if (arg === "--password" && next) {
      options.password = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }
  }

  return options;
}

function printHelpAndExit(code: number): never {
  console.log("Usage:");
  console.log("  npm run admin:create -- --email you@example.com --password YourPassword123!");
  console.log("");
  console.log("If email/password are omitted, the script will ask interactively.");
  process.exit(code);
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function askMissingValues(options: CliOptions): Promise<Required<CliOptions>> {
  const rl = createInterface({ input, output });

  try {
    let email = options.email?.trim() ?? "";
    let password = options.password ?? "";

    while (!validateEmail(email)) {
      email = (await rl.question("Email admin: ")).trim().toLowerCase();
    }

    while (password.length < 8) {
      password = await rl.question("Mot de passe admin (min 8 chars): ");
    }

    return { email, password };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const values = await askMissingValues(options);
  const email = values.email.toLowerCase();
  const passwordHash = await hashPassword(values.password);

  const existing = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    await prisma.adminUser.update({
      where: { email },
      data: { passwordHash },
    });
    console.log(`[admin:create] Mot de passe mis a jour pour ${email}`);
  } else {
    await prisma.adminUser.create({
      data: { email, passwordHash },
    });
    console.log(`[admin:create] Compte admin cree: ${email}`);
  }
}

main()
  .catch((error) => {
    console.error("[admin:create] Erreur:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
