-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "colorHex" TEXT;

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "colorHex" TEXT NOT NULL DEFAULT '#8C6A52';
