import { Router } from "express";
import { z } from "zod";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { formationContentSchema, normalizeFormationPayload } from "../lib/formations";
import { prisma } from "../lib/prisma";

export const adminFormationsRouter = Router();

adminFormationsRouter.use(authAdmin);

adminFormationsRouter.get("/formations", async (_req, res) => {
  try {
    const formations = await prisma.formationContent.findMany({
      orderBy: { createdAt: "asc" },
    });

    res.json(formations);
  } catch (error) {
    console.error("[adminFormations.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminFormationsRouter.put("/formations/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const payload = parseOrThrow(formationContentSchema, req.body);
    const normalized = normalizeFormationPayload(payload);

    const existing = await prisma.formationContent.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Formation not found" });
      return;
    }

    const updated = await prisma.formationContent.update({
      where: { id },
      data: normalized,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminFormations.put]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminFormationsRouter.delete("/formations/:id/event-link", async (req, res) => {
  try {
    const id = req.params.id;

    const existing = await prisma.formationContent.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Formation not found" });
      return;
    }

    const updated = await prisma.formationContent.update({
      where: { id },
      data: {
        eventUrl: null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("[adminFormations.deleteEventLink]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
