import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authAdmin } from "../middlewares/authAdmin";
import {
  defaultPageContent,
  ManagedPageSlug,
  normalizePageContent,
  pageSchemaForSlug,
} from "../lib/homeContent";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";
import { prisma } from "../lib/prisma";

const slugSet = new Set<ManagedPageSlug>(["home", "about", "contact"]);

export const adminPageContentRouter = Router();
adminPageContentRouter.use(authAdmin);

adminPageContentRouter.get("/page-content/:slug", async (req, res) => {
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
    console.error("[adminPageContent.get]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminPageContentRouter.put("/page-content/:slug", async (req, res) => {
  try {
    const slug = req.params.slug as ManagedPageSlug;
    if (!slugSet.has(slug)) {
      res.status(404).json({ error: "Page content not found" });
      return;
    }

    const schema = pageSchemaForSlug(slug);
    const payload = parseOrThrow(schema, req.body) as Prisma.InputJsonValue;

    const saved = await prisma.homeContent.upsert({
      where: { slug },
      update: { content: payload },
      create: { slug, content: payload },
      select: { content: true },
    });

    res.json(normalizePageContent(slug, saved.content));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminPageContent.put]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
