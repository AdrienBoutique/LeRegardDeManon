import { Router } from "express";
import { prisma } from "../lib/prisma";

export const publicServicesRouter = Router();

publicServicesRouter.get("/", async (_req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
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
        categoryId: service.categoryId,
        categoryName: service.category?.name ?? null,
      }))
    );
  } catch (error) {
    console.error("[publicServices.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
