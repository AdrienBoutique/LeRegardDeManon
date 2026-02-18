import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { authAdmin } from "../middlewares/authAdmin";
import { sendPushToTokens } from "../services/push/fcm";

const registerSchema = z.object({
  token: z.string().trim().min(10),
  platform: z.enum(["android", "ios"]),
  deviceName: z.string().trim().max(120).optional(),
});

const testPushSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(300),
});

export const adminPushRouter = Router();

adminPushRouter.use(authAdmin);

adminPushRouter.post("/push/register", async (req, res) => {
  try {
    const payload = parseOrThrow(registerSchema, req.body);
    const now = new Date();

    await prisma.pushDevice.upsert({
      where: {
        token: payload.token,
      },
      update: {
        platform: payload.platform,
        deviceName: payload.deviceName,
        lastSeenAt: now,
        disabledAt: null,
      },
      create: {
        token: payload.token,
        platform: payload.platform,
        deviceName: payload.deviceName,
        lastSeenAt: now,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }
    console.error("[admin.push.register]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPushRouter.post("/push/test", async (req, res) => {
  try {
    const payload = parseOrThrow(testPushSchema, req.body);
    const devices = await prisma.pushDevice.findMany({
      where: {
        disabledAt: null,
      },
      select: {
        token: true,
      },
    });
    const tokens = devices.map((device) => device.token);

    const result = await sendPushToTokens(tokens, {
      title: payload.title,
      body: payload.body,
      data: {
        route: "/admin/demandes",
      },
    });

    res.json({
      ok: true,
      tokenCount: tokens.length,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      disabledCount: result.disabledCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }
    console.error("[admin.push.test]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
