import { BookingMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { getInstituteSettings, setInstituteSettings } from "../services/settings/instituteSettings";

const availabilityDisplayModeSchema = z.enum(["dots", "colors"]);
const nullableTrimmedString = z
  .union([z.string(), z.null()])
  .transform((value) => (typeof value === "string" ? value.trim() : null))
  .transform((value) => (value && value.length > 0 ? value : null));

const updateSchema = z
  .object({
    bookingMode: z.nativeEnum(BookingMode).optional(),
    showAvailabilityDots: z.boolean().optional(),
    availabilityDisplayMode: availabilityDisplayModeSchema.optional(),
    smsEnabled: z.boolean().optional(),
    smsConfirmationEnabled: z.boolean().optional(),
    smsReminder24hEnabled: z.boolean().optional(),
    smsReminder2hEnabled: z.boolean().optional(),
    smsCancellationEnabled: z.boolean().optional(),
    smsRescheduleEnabled: z.boolean().optional(),
    smsSender: nullableTrimmedString.optional(),
    smsTemplateConfirmation: nullableTrimmedString.optional(),
    smsTemplateReminder24h: nullableTrimmedString.optional(),
    smsTemplateReminder2h: nullableTrimmedString.optional(),
    smsTemplateCancellation: nullableTrimmedString.optional(),
    smsTemplateReschedule: nullableTrimmedString.optional(),
  })
  .refine(
    (payload) =>
      payload.bookingMode !== undefined ||
      payload.showAvailabilityDots !== undefined ||
      payload.availabilityDisplayMode !== undefined ||
      payload.smsEnabled !== undefined ||
      payload.smsConfirmationEnabled !== undefined ||
      payload.smsReminder24hEnabled !== undefined ||
      payload.smsReminder2hEnabled !== undefined ||
      payload.smsCancellationEnabled !== undefined ||
      payload.smsRescheduleEnabled !== undefined ||
      payload.smsSender !== undefined ||
      payload.smsTemplateConfirmation !== undefined ||
      payload.smsTemplateReminder24h !== undefined ||
      payload.smsTemplateReminder2h !== undefined ||
      payload.smsTemplateCancellation !== undefined ||
      payload.smsTemplateReschedule !== undefined,
    {
      message: "At least one setting must be provided",
    }
  );

export const adminSettingsRouter = Router();
adminSettingsRouter.use(authAdmin);

adminSettingsRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await getInstituteSettings();
    res.json({
      bookingMode: settings.bookingMode,
      showAvailabilityDots: settings.showAvailabilityDots,
      availabilityDisplayMode: settings.availabilityDisplayMode,
      smsEnabled: settings.smsEnabled,
      smsConfirmationEnabled: settings.smsConfirmationEnabled,
      smsReminder24hEnabled: settings.smsReminder24hEnabled,
      smsReminder2hEnabled: settings.smsReminder2hEnabled,
      smsCancellationEnabled: settings.smsCancellationEnabled,
      smsRescheduleEnabled: settings.smsRescheduleEnabled,
      smsSender: settings.smsSender,
      smsTemplateConfirmation: settings.smsTemplateConfirmation,
      smsTemplateReminder24h: settings.smsTemplateReminder24h,
      smsTemplateReminder2h: settings.smsTemplateReminder2h,
      smsTemplateCancellation: settings.smsTemplateCancellation,
      smsTemplateReschedule: settings.smsTemplateReschedule,
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
      smsEnabled: payload.smsEnabled,
      smsConfirmationEnabled: payload.smsConfirmationEnabled,
      smsReminder24hEnabled: payload.smsReminder24hEnabled,
      smsReminder2hEnabled: payload.smsReminder2hEnabled,
      smsCancellationEnabled: payload.smsCancellationEnabled,
      smsRescheduleEnabled: payload.smsRescheduleEnabled,
      smsSender: payload.smsSender,
      smsTemplateConfirmation: payload.smsTemplateConfirmation,
      smsTemplateReminder24h: payload.smsTemplateReminder24h,
      smsTemplateReminder2h: payload.smsTemplateReminder2h,
      smsTemplateCancellation: payload.smsTemplateCancellation,
      smsTemplateReschedule: payload.smsTemplateReschedule,
    });
    res.json({
      bookingMode: settings.bookingMode,
      showAvailabilityDots: settings.showAvailabilityDots,
      availabilityDisplayMode: settings.availabilityDisplayMode,
      smsEnabled: settings.smsEnabled,
      smsConfirmationEnabled: settings.smsConfirmationEnabled,
      smsReminder24hEnabled: settings.smsReminder24hEnabled,
      smsReminder2hEnabled: settings.smsReminder2hEnabled,
      smsCancellationEnabled: settings.smsCancellationEnabled,
      smsRescheduleEnabled: settings.smsRescheduleEnabled,
      smsSender: settings.smsSender,
      smsTemplateConfirmation: settings.smsTemplateConfirmation,
      smsTemplateReminder24h: settings.smsTemplateReminder24h,
      smsTemplateReminder2h: settings.smsTemplateReminder2h,
      smsTemplateCancellation: settings.smsTemplateCancellation,
      smsTemplateReschedule: settings.smsTemplateReschedule,
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
