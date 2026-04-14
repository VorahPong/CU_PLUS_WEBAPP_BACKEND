-- CreateTable
CREATE TABLE "CourseFolder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderForm" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseFolder_parentId_idx" ON "CourseFolder"("parentId");

-- CreateIndex
CREATE INDEX "FolderForm_folderId_idx" ON "FolderForm"("folderId");

-- CreateIndex
CREATE INDEX "FolderForm_formId_idx" ON "FolderForm"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "FolderForm_folderId_formId_key" ON "FolderForm"("folderId", "formId");

-- AddForeignKey
ALTER TABLE "CourseFolder" ADD CONSTRAINT "CourseFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CourseFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFolder" ADD CONSTRAINT "CourseFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderForm" ADD CONSTRAINT "FolderForm_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CourseFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderForm" ADD CONSTRAINT "FolderForm_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
