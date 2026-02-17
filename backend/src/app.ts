import express from "express";
import cors from "cors";
import { adminAuthRouter } from "./routes/adminAuth.routes";
import { adminAvailabilityRouter } from "./routes/adminAvailability.routes";
import { adminPlanningRouter } from "./routes/adminPlanning.routes";
import { adminServiceStaffRouter } from "./routes/adminServiceStaff.routes";
import { adminStaffRouter } from "./routes/adminStaff.routes";
import { adminTimeOffRouter } from "./routes/adminTimeOff.routes";
import { adminServicesRouter } from "./routes/adminServices.routes";
import { adminPromotionsRouter } from "./routes/adminPromotions.routes";
import { adminHomeContentRouter } from "./routes/adminHomeContent.routes";
import { adminPageContentRouter } from "./routes/adminPageContent.routes";
import { adminClientsRouter } from "./routes/adminClients.routes";
import { adminPractitionersRouter } from "./routes/adminPractitioners.routes";
import { publicAppointmentsRouter } from "./routes/publicAppointments.routes";
import { publicEligibleServicesRouter } from "./routes/publicEligibleServices.routes";
import { publicFreeStartsRouter } from "./routes/publicFreeStarts.routes";
import { publicHomeContentRouter } from "./routes/publicHomeContent.routes";
import { publicPromotionsRouter } from "./routes/publicPromotions.routes";
import { publicServicesRouter } from "./routes/publicServices.routes";
import { publicStaffRouter } from "./routes/publicStaff.routes";
import { publicSlotsRouter } from "./routes/publicSlots.routes";
import { publicPageContentRouter } from "./routes/publicPageContent.routes";
import { authRouter } from "./routes/auth.routes";
import { staffPlanningRouter } from "./routes/staffPlanning.routes";

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminAvailabilityRouter);
app.use("/api/admin", adminPlanningRouter);
app.use("/api/admin/practitioners", adminPractitionersRouter);
app.use("/api/admin", adminTimeOffRouter);
app.use("/api/admin/services", adminServicesRouter);
app.use("/api/admin/promotions", adminPromotionsRouter);
app.use("/api/admin/clients", adminClientsRouter);
app.use("/api/admin", adminHomeContentRouter);
app.use("/api/admin", adminPageContentRouter);
app.use("/api/admin/service-staff", adminServiceStaffRouter);
app.use("/api/admin/staff", adminStaffRouter);
app.use("/api/public/promotions", publicPromotionsRouter);
app.use("/api", publicHomeContentRouter);
app.use("/api", publicPageContentRouter);
app.use("/api/services", publicServicesRouter);
app.use("/api", publicStaffRouter);
app.use("/api", publicEligibleServicesRouter);
app.use("/api", publicSlotsRouter);
app.use("/api", publicFreeStartsRouter);
app.use("/api", publicAppointmentsRouter);
app.use("/api", staffPlanningRouter);
