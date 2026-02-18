import ovh from "ovh";
import { parsePhoneNumberFromString } from "libphonenumber-js";

type SendSmsInput = {
  to: string;
  message: string;
  sender?: string | null;
};

type OvhClient = {
  requestPromised?: (method: string, path: string, body?: Record<string, unknown>) => Promise<unknown>;
  request?: (
    method: string,
    path: string,
    body: Record<string, unknown>,
    callback: (error: unknown, result: unknown) => void
  ) => void;
};

let cachedClient: OvhClient | null = null;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isSmsEnabled(): boolean {
  return String(process.env.SMS_ENABLED || "").trim().toLowerCase() === "true";
}

export function isSmsConfigAvailable(): boolean {
  return Boolean(
    process.env.OVH_APP_KEY?.trim() &&
      process.env.OVH_APP_SECRET?.trim() &&
      process.env.OVH_CONSUMER_KEY?.trim() &&
      process.env.OVH_SMS_SERVICE_NAME?.trim()
  );
}

export function shouldSendConfirmationSms(): boolean {
  return String(process.env.SMS_SEND_CONFIRMATION || "").trim().toLowerCase() === "true";
}

export function shouldSendReminder24hSms(): boolean {
  return String(process.env.SMS_SEND_REMINDER_24H || "").trim().toLowerCase() === "true";
}

export function shouldSendReminder2hSms(): boolean {
  return String(process.env.SMS_SEND_REMINDER_2H || "").trim().toLowerCase() === "true";
}

export function normalizePhoneToE164(rawPhone: string): string {
  const normalized = rawPhone.trim();
  const parsed =
    parsePhoneNumberFromString(normalized, "BE") || parsePhoneNumberFromString(normalized.replace(/\s+/g, ""), "BE");

  if (!parsed || !parsed.isValid()) {
    throw new Error("INVALID_PHONE");
  }

  return parsed.number;
}

export function maskPhone(phone: string): string {
  const visible = phone.slice(-4);
  return `***${visible}`;
}

function getOvhClient(): OvhClient {
  if (cachedClient) {
    return cachedClient;
  }

  const endpoint = process.env.OVH_ENDPOINT?.trim() || "ovh-eu";
  const appKey = process.env.OVH_APP_KEY?.trim();
  const appSecret = process.env.OVH_APP_SECRET?.trim();
  const consumerKey = process.env.OVH_CONSUMER_KEY?.trim();

  if (!appKey || !appSecret || !consumerKey) {
    throw new Error("SMS_OVH_CONFIG_MISSING");
  }

  cachedClient = ovh({
    endpoint,
    appKey,
    appSecret,
    consumerKey,
  }) as OvhClient;

  return cachedClient;
}

async function callOvh(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const client = getOvhClient();
  if (client.requestPromised) {
    return client.requestPromised("POST", path, payload);
  }

  if (client.request) {
    return new Promise((resolve, reject) => {
      client.request!("POST", path, payload, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  throw new Error("SMS_OVH_CLIENT_INVALID");
}

export async function sendSms(input: SendSmsInput): Promise<{ jobId: string | null }> {
  const serviceName = process.env.OVH_SMS_SERVICE_NAME?.trim();
  if (!serviceName) {
    throw new Error("SMS_OVH_SERVICE_NAME_MISSING");
  }

  const sender = (input.sender ?? process.env.OVH_SMS_SENDER ?? "").trim() || undefined;
  const payload: Record<string, unknown> = {
    message: input.message,
    receivers: [input.to],
    noStopClause: true,
    priority: "high",
    ...(sender ? { sender } : {}),
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await callOvh(`/sms/${serviceName}/jobs`, payload);
      const jobId =
        typeof result === "object" && result !== null && "ids" in result
          ? String((result as { ids?: unknown[] }).ids?.[0] ?? "")
          : "";
      return { jobId: jobId || null };
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await wait(500);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("SMS_SEND_FAILED");
}
