import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("ChangeMe123!", 10);

  await prisma.adminUser.upsert({
    where: { email: "admin@lrdm.local" },
    update: {
      passwordHash: adminPasswordHash,
    },
    create: {
      email: "admin@lrdm.local",
      passwordHash: adminPasswordHash,
    },
  });

  const manon = await prisma.staffMember.upsert({
    where: { email: "manon@leregarddemanon.fr" },
    update: {
      firstName: "Manon",
      lastName: "Dumont",
      phone: "0600000000",
      role: "Owner",
      isActive: true,
      isTrainee: false,
      colorHex: "#8C6A52",
      defaultDiscountPercent: null,
    },
    create: {
      firstName: "Manon",
      lastName: "Dumont",
      email: "manon@leregarddemanon.fr",
      phone: "0600000000",
      role: "Owner",
      isActive: true,
      isTrainee: false,
      colorHex: "#8C6A52",
      defaultDiscountPercent: null,
    },
  });

  const stagiaire = await prisma.staffMember.upsert({
    where: { email: "stagiaire@leregarddemanon.fr" },
    update: {
      firstName: "Lea",
      lastName: "Martin",
      phone: "0600000001",
      role: "Stagiaire",
      isActive: true,
      isTrainee: true,
      colorHex: "#B58B76",
      defaultDiscountPercent: 20,
    },
    create: {
      firstName: "Lea",
      lastName: "Martin",
      email: "stagiaire@leregarddemanon.fr",
      phone: "0600000001",
      role: "Stagiaire",
      isActive: true,
      isTrainee: true,
      colorHex: "#B58B76",
      defaultDiscountPercent: 20,
    },
  });

  const services = await Promise.all([
    prisma.service.upsert({
      where: { name: "Rehaussement de cils" },
      update: {
        description:
          "Courbure naturelle et tenue longue duree pour un regard ouvert.",
        durationMin: 60,
        priceCents: 6500,
        isActive: true,
        colorHex: "#E9DCCF",
      },
      create: {
        name: "Rehaussement de cils",
        description:
          "Courbure naturelle et tenue longue duree pour un regard ouvert.",
        durationMin: 60,
        priceCents: 6500,
        colorHex: "#E9DCCF",
      },
    }),
    prisma.service.upsert({
      where: { name: "Brow lift" },
      update: {
        description:
          "Restructure la ligne sourciliere pour un rendu discipline et lumineux.",
        durationMin: 50,
        priceCents: 5500,
        isActive: true,
        colorHex: "#DDE7DF",
      },
      create: {
        name: "Brow lift",
        description:
          "Restructure la ligne sourciliere pour un rendu discipline et lumineux.",
        durationMin: 50,
        priceCents: 5500,
        colorHex: "#DDE7DF",
      },
    }),
    prisma.service.upsert({
      where: { name: "Duo regard signature" },
      update: {
        description:
          "Soin premium combinant rehaussement, teinture et mise en forme.",
        durationMin: 80,
        priceCents: 8900,
        isActive: true,
        colorHex: "#E4E0EC",
      },
      create: {
        name: "Duo regard signature",
        description:
          "Soin premium combinant rehaussement, teinture et mise en forme.",
        durationMin: 80,
        priceCents: 8900,
        colorHex: "#E4E0EC",
      },
    }),
  ]);

  const [rehaussement, browLift, duoSignature] = services;

  const [catCils, catSourcils, catPackages] = await Promise.all([
    prisma.serviceCategory.upsert({
      where: { name: "Cils" },
      update: {},
      create: { name: "Cils" },
    }),
    prisma.serviceCategory.upsert({
      where: { name: "Sourcils" },
      update: {},
      create: { name: "Sourcils" },
    }),
    prisma.serviceCategory.upsert({
      where: { name: "Packages" },
      update: {},
      create: { name: "Packages" },
    }),
  ]);

  await Promise.all([
    prisma.service.update({
      where: { id: rehaussement.id },
      data: { categoryId: catCils.id },
    }),
    prisma.service.update({
      where: { id: browLift.id },
      data: { categoryId: catSourcils.id },
    }),
    prisma.service.update({
      where: { id: duoSignature.id },
      data: { categoryId: catPackages.id },
    }),
  ]);

  await prisma.serviceStaff.upsert({
    where: {
      serviceId_staffMemberId: {
        serviceId: rehaussement.id,
        staffMemberId: manon.id,
      },
    },
    update: {
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
    create: {
      serviceId: rehaussement.id,
      staffMemberId: manon.id,
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
  });

  await prisma.serviceStaff.upsert({
    where: {
      serviceId_staffMemberId: {
        serviceId: browLift.id,
        staffMemberId: manon.id,
      },
    },
    update: {
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
    create: {
      serviceId: browLift.id,
      staffMemberId: manon.id,
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
  });

  await prisma.serviceStaff.upsert({
    where: {
      serviceId_staffMemberId: {
        serviceId: duoSignature.id,
        staffMemberId: manon.id,
      },
    },
    update: {
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
    create: {
      serviceId: duoSignature.id,
      staffMemberId: manon.id,
      priceCentsOverride: null,
      discountPercentOverride: null,
    },
  });

  await prisma.serviceStaff.upsert({
    where: {
      serviceId_staffMemberId: {
        serviceId: browLift.id,
        staffMemberId: stagiaire.id,
      },
    },
    update: {
      priceCentsOverride: null,
      discountPercentOverride: 20,
    },
    create: {
      serviceId: browLift.id,
      staffMemberId: stagiaire.id,
      priceCentsOverride: null,
      discountPercentOverride: 20,
    },
  });

  await prisma.availabilityRule.deleteMany({
    where: { staffMemberId: { in: [manon.id, stagiaire.id] } },
  });

  await prisma.availabilityRule.createMany({
    data: [
      { staffMemberId: manon.id, dayOfWeek: 1, startTime: "09:30", endTime: "19:00" },
      { staffMemberId: manon.id, dayOfWeek: 2, startTime: "09:30", endTime: "19:00" },
      { staffMemberId: manon.id, dayOfWeek: 3, startTime: "09:30", endTime: "19:00" },
      { staffMemberId: manon.id, dayOfWeek: 4, startTime: "09:30", endTime: "19:00" },
      { staffMemberId: manon.id, dayOfWeek: 5, startTime: "09:30", endTime: "19:00" },
      { staffMemberId: manon.id, dayOfWeek: 6, startTime: "10:00", endTime: "17:00" },
      { staffMemberId: stagiaire.id, dayOfWeek: 2, startTime: "10:00", endTime: "17:00" },
      { staffMemberId: stagiaire.id, dayOfWeek: 4, startTime: "10:00", endTime: "17:00" },
      { staffMemberId: stagiaire.id, dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },
    ],
  });

  console.log("[seed] Done: admin user, staff, categories, services, links, availability rules");
}

main()
  .catch((error) => {
    console.error("[seed] Failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
