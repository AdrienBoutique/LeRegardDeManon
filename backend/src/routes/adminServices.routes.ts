import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  durationMin: z.int().positive(),
  priceCents: z.int().nonnegative(),
  active: z.boolean().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

const updateServiceSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    durationMin: z.int().positive().optional(),
    priceCents: z.int().nonnegative().optional(),
    active: z.boolean().optional(),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

export const adminServicesRouter = Router();

adminServicesRouter.use(authAdmin);

const createCategorySchema = z.object({
  name: z.string().min(1),
});

adminServicesRouter.get("/categories", async (_req, res) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      orderBy: { name: "asc" },
    });

    res.json(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      }))
    );
  } catch (error) {
    console.error("[adminServices.listCategories]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.post("/categories", async (req, res) => {
  try {
    const payload = parseOrThrow(createCategorySchema, req.body);

    const created = await prisma.serviceCategory.create({
      data: {
        name: payload.name.trim(),
      },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminServices.createCategory]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.delete("/categories/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    await prisma.$transaction(async (tx) => {
      // Defensive update for existing databases where FK behavior may differ.
      await tx.service.updateMany({
        where: { categoryId },
        data: { categoryId: null },
      });

      await tx.serviceCategory.delete({
        where: { id: categoryId },
      });
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminServices.deleteCategory]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.get("/", async (_req, res) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
      },
    });

    res.json(
      services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMin: service.durationMin,
        priceCents: service.priceCents,
        active: service.isActive,
        colorHex: service.colorHex,
        categoryId: service.categoryId,
        categoryName: service.category?.name ?? null,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      }))
    );
  } catch (error) {
    console.error("[adminServices.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createServiceSchema, req.body);

    const created = await prisma.service.create({
      data: {
        name: payload.name,
        description: payload.description,
        durationMin: payload.durationMin,
        priceCents: payload.priceCents,
        isActive: payload.active ?? true,
        colorHex: payload.colorHex ?? null,
        categoryId: payload.categoryId ?? null,
      },
      include: {
        category: true,
      },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      description: created.description,
      durationMin: created.durationMin,
      priceCents: created.priceCents,
      active: created.isActive,
      colorHex: created.colorHex,
      categoryId: created.categoryId,
      categoryName: created.category?.name ?? null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminServices.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updateServiceSchema, req.body);

    const updated = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        name: payload.name,
        description: payload.description,
        durationMin: payload.durationMin,
        priceCents: payload.priceCents,
        isActive: payload.active,
        colorHex: payload.colorHex,
        categoryId: payload.categoryId,
      },
      include: {
        category: true,
      },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      durationMin: updated.durationMin,
      priceCents: updated.priceCents,
      active: updated.isActive,
      colorHex: updated.colorHex,
      categoryId: updated.categoryId,
      categoryName: updated.category?.name ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminServices.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminServicesRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.service.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminServices.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
