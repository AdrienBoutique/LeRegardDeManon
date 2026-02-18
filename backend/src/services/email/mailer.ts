import nodemailer, { Transporter } from "nodemailer";

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const DEFAULT_SMTP_HOST = "ssl0.ovh.net";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_SECURE = true;

let cachedTransporter: Transporter | null = null;

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return fallback;
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) {
    return from;
  }

  const user = process.env.EMAIL_USER?.trim();
  if (!user) {
    throw new Error("EMAIL_FROM/EMAIL_USER missing");
  }

  return user;
}

function getTransporter(): Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error("EMAIL_USER/EMAIL_PASS missing");
  }

  const host = process.env.EMAIL_HOST?.trim() || DEFAULT_SMTP_HOST;
  const port = Number(process.env.EMAIL_PORT || DEFAULT_SMTP_PORT);
  const secure = toBoolean(process.env.EMAIL_SECURE, DEFAULT_SMTP_SECURE);

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return cachedTransporter;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_USER?.trim() && process.env.EMAIL_PASS);
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const transporter = getTransporter();
  const from = getFromAddress();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const info = await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });

      return { messageId: info.messageId };
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await wait(500);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown email send failure");
}
