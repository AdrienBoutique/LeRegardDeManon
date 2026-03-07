import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { sendSms } from "../services/sms.service";

const testSmsSchema = z.object({
  to: z.string().trim().min(1),
  message: z.string().trim().min(1).max(1600),
});

export const adminSmsRouter = Router();

adminSmsRouter.use(authAdmin);

adminSmsRouter.post("/test-sms", async (req, res) => {
  try {
    const payload = testSmsSchema.parse(req.body ?? {});
    await sendSms({
      to: payload.to,
      message: payload.message,
    });

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid SMS payload" });
      return;
    }

    const message = error instanceof Error ? error.message : "SMS_SEND_FAILED";
    console.error("[adminSms.testSms]", error);
    res.status(500).json({ error: message });
  }
});
