import { BookingMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { getInstituteSettings, setInstituteBookingMode } from "../services/settings/instituteSettings";

const updateSchema = z.object({
  bookingMode: z.nativeEnum(BookingMode),
});

export const adminSettingsRouter = Router();
adminSettingsRouter.use(authAdmin);

adminSettingsRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await getInstituteSettings();
    res.json({ bookingMode: settings.bookingMode });
  } catch (error) {
    console.error("[adminSettings.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminSettingsRouter.put("/settings", async (req, res) => {
  try {
    const payload = updateSchema.parse(req.body);
    const settings = await setInstituteBookingMode(payload.bookingMode);
    res.json({ bookingMode: settings.bookingMode });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid bookingMode" });
      return;
    }
    console.error("[adminSettings.put]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
