import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import {
  defaultHomeContent,
  homeContentSchema,
  normalizeHomeContent,
} from "../lib/homeContent";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const HOME_SLUG = "home";

export const adminHomeContentRouter = Router();

adminHomeContentRouter.use(authAdmin);

adminHomeContentRouter.get("/home-content", async (_req, res) => {
  try {
    const row = await prisma.homeContent.findUnique({
      where: { slug: HOME_SLUG },
      select: { content: true },
    });

    const content = row ? normalizeHomeContent(row.content) : defaultHomeContent();
    res.json(content);
  } catch (error) {
    console.error("[adminHomeContent.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminHomeContentRouter.put("/home-content", async (req, res) => {
  try {
    const payload = parseOrThrow(homeContentSchema, req.body);

    const saved = await prisma.homeContent.upsert({
      where: { slug: HOME_SLUG },
      update: { content: payload },
      create: { slug: HOME_SLUG, content: payload },
      select: { content: true },
    });

    res.json(normalizeHomeContent(saved.content));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminHomeContent.put]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
