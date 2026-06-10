import { Router } from "express";
import { prisma } from "../lib/prisma";
import { defaultFormationContent, mergeFormationContent } from "../lib/formations";

export const publicFormationsRouter = Router();

publicFormationsRouter.get("/public/formations", async (_req, res) => {
  try {
    const formations = await prisma.formationContent.findMany({
      orderBy: [{ createdAt: "asc" }],
    });

    res.json(mergeFormationContent(formations));
  } catch (error) {
    console.error("[publicFormations.get]", error);
    res.json(defaultFormationContent);
  }
});
