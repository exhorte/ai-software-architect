/**
 * Prisma persistence adapter — the production implementation of the port.
 * Optimistic locking: the UPDATE is guarded by the expected memoryVersion;
 * zero affected rows means a concurrent commit won.
 */
import type { Prisma } from "@/app/generated/prisma/client"

import { prisma } from "../prisma"
import type { LoadedMemory, MemoryPersistence } from "./persistence"
import type { MemoryDocument, RevisionRecord } from "./types"

export class PrismaPersistence implements MemoryPersistence {
  async load(projectId: string): Promise<LoadedMemory | null> {
    const row = await prisma.projectMemory.findUnique({ where: { projectId } })
    if (!row) return null
    return {
      document: row.document as unknown as MemoryDocument,
      version: row.memoryVersion,
    }
  }

  async create(projectId: string, document: MemoryDocument): Promise<void> {
    await prisma.projectMemory.create({
      data: {
        projectId,
        document: document as unknown as Prisma.InputJsonValue,
        memoryVersion: document.memoryVersion,
      },
    })
  }

  async commit(
    projectId: string,
    expectedVersion: number,
    document: MemoryDocument,
    revision: RevisionRecord
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.projectMemory.updateMany({
        where: { projectId, memoryVersion: expectedVersion },
        data: {
          document: document as unknown as Prisma.InputJsonValue,
          memoryVersion: document.memoryVersion,
        },
      })
      if (updated.count === 0) return false

      const memory = await tx.projectMemory.findUniqueOrThrow({
        where: { projectId },
        select: { id: true },
      })

      await tx.memoryRevision.create({
        data: {
          memoryId: memory.id,
          version: revision.version,
          agentId: revision.agentId,
          runId: revision.runId,
          stepId: revision.stepId,
          changedSections: revision.changedSections as unknown as Prisma.InputJsonValue,
        },
      })
      return true
    })
  }

  async loadRevisions(projectId: string): Promise<RevisionRecord[]> {
    const rows = await prisma.memoryRevision.findMany({
      where: { memory: { projectId } },
      orderBy: { version: "desc" },
    })

    return rows.map((row) => ({
      version: row.version,
      agentId: row.agentId,
      runId: row.runId ?? undefined,
      stepId: row.stepId ?? undefined,
      changedSections: row.changedSections as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }))
  }
}
