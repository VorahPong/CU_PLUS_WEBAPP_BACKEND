-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'published');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "status" "AnnouncementStatus" NOT NULL DEFAULT 'published';
