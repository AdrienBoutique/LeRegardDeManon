import { Router } from "express";
import { prisma } from "../lib/prisma";

export const publicStaffRouter = Router();

publicStaffRouter.get("/staff", async (_req, res) => {
  try {
    const staff = await prisma.staffMember.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    res.json(
      staff.map((member) => ({
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
      }))
    );
  } catch (error) {
    console.error("[publicStaff.list]", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
