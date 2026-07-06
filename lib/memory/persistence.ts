/**
 * Persistence port (hexagonal seam, decision D5): the store depends on this
 * interface only. Adapters: prisma-adapter.ts (runtime), memory-adapter.ts (tests).
 */
import type { MemoryDocument, RevisionRecord } from "./types"

export interface LoadedMemory {
  document: MemoryDocument
  version: number
}

export interface MemoryPersistence {
  /** Returns null when the project has no memory document yet. */
  load(projectId: string): Promise<LoadedMemory | null>

  /** Creates the version-1 document. Fails if one already exists. */
  create(projectId: string, document: MemoryDocument): Promise<void>

  /**
   * Atomically replaces the document IF the stored version still equals
   * `expectedVersion` (optimistic lock, decision D4), and appends the revision.
   * Returns false on version conflict — the caller decides how to retry.
   */
  commit(
    projectId: string,
    expectedVersion: number,
    document: MemoryDocument,
    revision: RevisionRecord
  ): Promise<boolean>

  /** Revision history, most recent first. */
  loadRevisions(projectId: string): Promise<RevisionRecord[]>
}
