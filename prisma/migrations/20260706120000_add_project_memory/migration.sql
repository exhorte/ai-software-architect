-- CreateTable
CREATE TABLE "ProjectMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "memoryVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRevision" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "agentId" TEXT NOT NULL,
    "runId" TEXT,
    "stepId" TEXT,
    "changedSections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMemory_projectId_key" ON "ProjectMemory"("projectId");

-- CreateIndex
CREATE INDEX "MemoryRevision_memoryId_createdAt_idx" ON "MemoryRevision"("memoryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryRevision_memoryId_version_key" ON "MemoryRevision"("memoryId", "version");

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRevision" ADD CONSTRAINT "MemoryRevision_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "ProjectMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
