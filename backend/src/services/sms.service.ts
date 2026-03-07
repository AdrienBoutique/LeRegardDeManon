import { parsePhoneNumberFromString } from "libphonenumber-js";
import ovh from "ovh";

export type SendSmsInput = {
  to: string;
  message: string;
};

type SmsProvider = {
  send(input: SendSmsInput): Promise<void>;
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

let cachedProvider: SmsProvider | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`SMS_CONFIG_MISSING:${name}`);
  }
  return value;
}

export function normalizePhoneNumber(rawPhone: string): string {
  const normalized = rawPhone.trim();
  const compact = normalized.replace(/\s+/g, "");

  const parsedBelgian =
    parsePhoneNumberFromString(normalized, "BE") || parsePhoneNumberFromString(compact, "BE");
  if (parsedBelgian?.isValid()) {
    return parsedBelgian.number;
  }

  const parsedInternational = parsePhoneNumberFromString(normalized) || parsePhoneNumberFromString(compact);
  if (parsedInternational?.isValid()) {
    return parsedInternational.number;
  }

  throw new Error("SMS_INVALID_PHONE");
}

function getOvhClient(): OvhClient {
  const endpoint = process.env.OVH_ENDPOINT?.trim() || "ovh-eu";
  const appKey = getRequiredEnv("OVH_APP_KEY");
  const appSecret = getRequiredEnv("OVH_APP_SECRET");
  const consumerKey = getRequiredEnv("OVH_CONSUMER_KEY");

  return ovh({
    endpoint,
    appKey,
    appSecret,
    consumerKey,
  }) as OvhClient;
}

async function postOvh(path: string, payload: Record<string, unknown>): Promise<void> {
  const client = getOvhClient();

  if (client.requestPromised) {
    await client.requestPromised("POST", path, payload);
    return;
  }

  if (client.request) {
    await new Promise<void>((resolve, reject) => {
      client.request!("POST", path, payload, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return;
  }

  throw new Error("SMS_OVH_CLIENT_INVALID");
}

function createOvhSmsProvider(): SmsProvider {
  const serviceName = getRequiredEnv("OVH_SMS_SERVICE_NAME");
  const sender = getRequiredEnv("OVH_SMS_SENDER");

  return {
    async send(input: SendSmsInput): Promise<void> {
      const to = normalizePhoneNumber(input.to);
      const message = input.message.trim();

      if (!message) {
        throw new Error("SMS_EMPTY_MESSAGE");
      }

      await postOvh(`/sms/${serviceName}/jobs`, {
        sender,
        message,
        receivers: [to],
        priority: "high",
        noStopClause: true,
      });
    },
  };
}

function getSmsProvider(): SmsProvider {
  if (!cachedProvider) {
    cachedProvider = createOvhSmsProvider();
  }
  return cachedProvider;
}

export async function sendSms({ to, message }: SendSmsInput): Promise<void> {
  try {
    await getSmsProvider().send({ to, message });
    console.log(`[sms.service] SMS sent to ${normalizePhoneNumber(to)}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`[sms.service] SMS send failed for ${to}: ${details}`, error);
    throw error instanceof Error ? error : new Error("SMS_SEND_FAILED");
  }
}
