-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'WAITING_CLARIFICATION', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "plan" JSONB NOT NULL,
    "blockages" JSONB,
    "triggerRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Run_triggerRunId_key" ON "Run"("triggerRunId");

-- CreateIndex
CREATE INDEX "Run_projectId_createdAt_idx" ON "Run"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
