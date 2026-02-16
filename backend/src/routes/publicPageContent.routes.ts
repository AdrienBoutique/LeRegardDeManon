import { Router } from "express";
import {
  defaultPageContent,
  ManagedPageSlug,
  normalizePageContent,
} from "../lib/homeContent";
import { prisma } from "../lib/prisma";

const slugSet = new Set<ManagedPageSlug>(["home", "about", "contact"]);

export const publicPageContentRouter = Router();

publicPageContentRouter.get("/public/page-content/:slug", async (req, res) => {
  try {
    const slug = req.params.slug as ManagedPageSlug;
    if (!slugSet.has(slug)) {
      res.status(404).json({ error: "Page content not found" });
      return;
    }

    const row = await prisma.homeContent.findUnique({
      where: { slug },
      select: { content: true },
    });

    const content = row
      ? normalizePageContent(slug, row.content)
      : defaultPageContent(slug);

    res.json(content);
  } catch (error) {
    console.error("[publicPageContent.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
