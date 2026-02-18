import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { sendMail } from "../services/email/mailer";

const querySchema = z.object({
  to: z.string().email(),
});

export const adminEmailRouter = Router();

adminEmailRouter.get("/test-email", ...authAdmin, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query param: to (email) is required" });
    return;
  }

  try {
    const to = parsed.data.to.toLowerCase();
    const sent = await sendMail({
      to,
      subject: "Test SMTP - Le Regard de Manon",
      text: "Email de test SMTP envoye avec succes.",
      html: "<p>Email de test SMTP envoye avec succes.</p>",
    });

    res.json({
      ok: true,
      to,
      messageId: sent.messageId,
    });
  } catch (error) {
    console.error("[adminEmail.test]", error);
    res.status(500).json({ error: "Email send failed" });
  }
});
