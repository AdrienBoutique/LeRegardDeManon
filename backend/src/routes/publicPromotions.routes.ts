import { Router } from "express";
import { listPublicActivePromotions } from "../controllers/adminPromotions.controller";

export const publicPromotionsRouter = Router();

publicPromotionsRouter.get("/active", listPublicActivePromotions);
