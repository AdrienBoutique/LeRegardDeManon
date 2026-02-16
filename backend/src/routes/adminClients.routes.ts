import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authAdmin } from "../middlewares/authAdmin";
import { parseOrThrow, zodErrorToMessage } from "../lib/validate";

const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : undefined))
  .transform((value) => (value && value.length > 0 ? value : undefined));

const listClientsQuerySchema = z.object({
  q: z.string().trim().optional(),
});

const createClientSchema = z
  .object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: optionalString.pipe(z.string().email().optional()),
    phone: optionalString,
    notes: optionalString,
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "email or phone is required",
        path: ["email"],
      });
    }
  });

const updateClientSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: optionalString.pipe(z.string().email().optional()),
    phone: optionalString,
    notes: optionalString,
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided",
  });

function mapClient(client: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export const adminClientsRouter = Router();

adminClientsRouter.use(authAdmin);

adminClientsRouter.get("/", async (req, res) => {
  try {
    const query = parseOrThrow(listClientsQuerySchema, req.query);
    const search = query.q?.trim();

    const clients = await prisma.client.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ updatedAt: "desc" }, { firstName: "asc" }, { lastName: "asc" }],
      take: 500,
    });

    res.json(clients.map(mapClient));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    console.error("[adminClients.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.post("/", async (req, res) => {
  try {
    const payload = parseOrThrow(createClientSchema, req.body);

    const created = await prisma.client.create({
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email?.toLowerCase() ?? null,
        phone: payload.phone ?? null,
        notes: payload.notes ?? null,
      },
    });

    res.status(201).json(mapClient(created));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Email ou telephone deja utilise." });
      return;
    }

    console.error("[adminClients.create]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.patch("/:id", async (req, res) => {
  try {
    const payload = parseOrThrow(updateClientSchema, req.body);

    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const merged = {
      firstName: payload.firstName ?? existing.firstName,
      lastName: payload.lastName ?? existing.lastName,
      email: payload.email ?? existing.email ?? undefined,
      phone: payload.phone ?? existing.phone ?? undefined,
      notes: payload.notes ?? existing.notes ?? undefined,
    };

    if (!merged.email && !merged.phone) {
      res.status(400).json({ error: "email or phone is required" });
      return;
    }

    const updated = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        firstName: merged.firstName,
        lastName: merged.lastName,
        email: merged.email?.toLowerCase() ?? null,
        phone: merged.phone ?? null,
        notes: merged.notes ?? null,
      },
    });

    res.json(mapClient(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorToMessage(error) });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Email ou telephone deja utilise." });
      return;
    }

    console.error("[adminClients.update]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminClientsRouter.delete("/:id", async (req, res) => {
  try {
    const existing = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Client introuvable." });
      return;
    }

    const appointmentsCount = await prisma.appointment.count({
      where: { clientId: req.params.id },
    });

    if (appointmentsCount > 0) {
      res
        .status(409)
        .json({ error: "Suppression impossible: la cliente a deja des rendez-vous." });
      return;
    }

    await prisma.client.delete({
      where: { id: req.params.id },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[adminClients.delete]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
