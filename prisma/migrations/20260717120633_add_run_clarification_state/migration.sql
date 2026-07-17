-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE 'RESUMING';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "clarification" JSONB,
ADD COLUMN     "stepId" TEXT;
