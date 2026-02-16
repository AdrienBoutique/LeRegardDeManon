import { Router } from "express";
import {
  createAdminPromotion,
  deleteAdminPromotion,
  listAdminPromotions,
  toggleAdminPromotion,
  updateAdminPromotion,
} from "../controllers/adminPromotions.controller";
import { authAdmin } from "../middlewares/authAdmin";

export const adminPromotionsRouter = Router();

adminPromotionsRouter.use(authAdmin);

adminPromotionsRouter.get("/", listAdminPromotions);
adminPromotionsRouter.post("/", createAdminPromotion);
adminPromotionsRouter.patch("/:id", updateAdminPromotion);
adminPromotionsRouter.post("/:id/toggle", toggleAdminPromotion);
adminPromotionsRouter.delete("/:id", deleteAdminPromotion);
