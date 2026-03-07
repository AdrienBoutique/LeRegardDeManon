import { BookingMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { getInstituteSettings, setInstituteSettings } from "../services/settings/instituteSettings";

const availabilityDisplayModeSchema = z.enum(["dots", "colors"]);

const updateSchema = z
  .object({
    bookingMode: z.nativeEnum(BookingMode).optional(),
    showAvailabilityDots: z.boolean().optional(),
    availabilityDisplayMode: availabilityDisplayModeSchema.optional(),
  })
  .refine(
    (payload) =>
      payload.bookingMode !== undefined ||
      payload.showAvailabilityDots !== undefined ||
      payload.availabilityDisplayMode !== undefined,
    {
    message: "At least one setting must be provided",
  });

export const adminSettingsRouter = Router();
adminSettingsRouter.use(authAdmin);

adminSettingsRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await getInstituteSettings();
    res.json({
      bookingMode: settings.bookingMode,
      showAvailabilityDots: settings.showAvailabilityDots,
      availabilityDisplayMode: settings.availabilityDisplayMode,
    });
  } catch (error) {
    console.error("[adminSettings.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminSettingsRouter.put("/settings", async (req, res) => {
  try {
    const payload = updateSchema.parse(req.body);
    const settings = await setInstituteSettings({
      bookingMode: payload.bookingMode,
      showAvailabilityDots: payload.showAvailabilityDots,
      availabilityDisplayMode: payload.availabilityDisplayMode,
    });
    res.json({
      bookingMode: settings.bookingMode,
      showAvailabilityDots: settings.showAvailabilityDots,
      availabilityDisplayMode: settings.availabilityDisplayMode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid settings payload" });
      return;
    }
    console.error("[adminSettings.put]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
