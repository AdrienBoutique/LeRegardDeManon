import { BookingMode, InstituteSettings } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const SINGLETON_KEY = "default";

export async function getInstituteSettings(): Promise<InstituteSettings> {
  const existing = await prisma.instituteSettings.findFirst({
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.instituteSettings.create({
    data: {
      instituteId: SINGLETON_KEY,
      bookingMode: BookingMode.MANUAL,
    },
  });
}

export async function setInstituteBookingMode(mode: BookingMode): Promise<InstituteSettings> {
  const current = await getInstituteSettings();
  return prisma.instituteSettings.update({
    where: {
      id: current.id,
    },
    data: {
      bookingMode: mode,
    },
  });
}
