-- CreateTable
CREATE TABLE "FormationContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brochureImageUrl" TEXT NOT NULL,
    "eventUrl" TEXT,
    "nextDatesText" TEXT,
    "sessionNote" TEXT,
    "showEventButton" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormationContent_pkey" PRIMARY KEY ("id")
);
