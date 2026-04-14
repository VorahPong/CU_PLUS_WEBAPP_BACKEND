/*
  Warnings:

  - You are about to drop the `FolderForm` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FolderForm" DROP CONSTRAINT "FolderForm_folderId_fkey";

-- DropForeignKey
ALTER TABLE "FolderForm" DROP CONSTRAINT "FolderForm_formId_fkey";

-- AlterTable
ALTER TABLE "FormTemplate" ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "FolderForm";

-- CreateIndex
CREATE INDEX "FormTemplate_folderId_idx" ON "FormTemplate"("folderId");

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CourseFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
