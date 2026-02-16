import { Router } from "express";
import { prisma } from "../lib/prisma";
import { defaultHomeContent, normalizeHomeContent } from "../lib/homeContent";

const HOME_SLUG = "home";

export const publicHomeContentRouter = Router();

publicHomeContentRouter.get("/public/home-content", async (_req, res) => {
  try {
    const row = await prisma.homeContent.findUnique({
      where: { slug: HOME_SLUG },
      select: { content: true },
    });

    const content = row ? normalizeHomeContent(row.content) : defaultHomeContent();
    res.json(content);
  } catch (error) {
    console.error("[publicHomeContent.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
