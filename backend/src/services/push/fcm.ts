import { prisma } from "../../lib/prisma";
import admin from "firebase-admin";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type PushSendResult = {
  sentCount: number;
  failedCount: number;
  disabledCount: number;
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

let initialized = false;
let available = false;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.trim().toLowerCase() === "true";
}

export function isPushEnabled(): boolean {
  return parseBooleanEnv(process.env.PUSH_ENABLED, true);
}

function initializeFirebaseIfNeeded(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  if (!isPushEnabled()) {
    return;
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }),
      });
      available = true;
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      available = true;
      return;
    }

    console.log("[push.fcm] disabled: missing Firebase credentials");
  } catch (error) {
    console.error("[push.fcm] init failed", error);
  }
}

export function isPushAvailable(): boolean {
  initializeFirebaseIfNeeded();
  return available;
}

export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<PushSendResult> {
  if (!isPushEnabled() || !isPushAvailable()) {
    return { sentCount: 0, failedCount: 0, disabledCount: 0 };
  }

  const cleanTokens = Array.from(new Set(tokens.map((token) => token.trim()).filter((token) => token.length > 0)));
  if (cleanTokens.length === 0) {
    return { sentCount: 0, failedCount: 0, disabledCount: 0 };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: cleanTokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data,
  });

  const tokensToDisable: string[] = [];
  response.responses.forEach((item, index) => {
    if (item.success) {
      return;
    }

    const code = item.error?.code;
    if (code && INVALID_TOKEN_CODES.has(code)) {
      tokensToDisable.push(cleanTokens[index]);
    }
  });

  let disabledCount = 0;
  if (tokensToDisable.length > 0) {
    const disabledAt = new Date();
    const update = await prisma.pushDevice.updateMany({
      where: {
        token: { in: tokensToDisable },
        disabledAt: null,
      },
      data: { disabledAt },
    });
    disabledCount = update.count;
  }

  return {
    sentCount: response.successCount,
    failedCount: response.failureCount,
    disabledCount,
  };
}
