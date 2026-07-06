/**
 * In-memory persistence adapter — test double with the exact semantics of the
 * port (optimistic lock included). Never used in production code paths.
 */
import type { LoadedMemory, MemoryPersistence } from "./persistence"
import type { MemoryDocument, RevisionRecord } from "./types"

interface Stored {
  document: MemoryDocument
  version: number
  revisions: RevisionRecord[]
}

export class InMemoryPersistence implements MemoryPersistence {
  private readonly projects = new Map<string, Stored>()

  async load(projectId: string): Promise<LoadedMemory | null> {
    const stored = this.projects.get(projectId)
    if (!stored) return null
    return { document: structuredClone(stored.document), version: stored.version }
  }

  async create(projectId: string, document: MemoryDocument): Promise<void> {
    if (this.projects.has(projectId)) {
      throw new Error(`Memory already exists for project ${projectId}`)
    }
    this.projects.set(projectId, {
      document: structuredClone(document),
      version: document.memoryVersion,
      revisions: [],
    })
  }

  async commit(
    projectId: string,
    expectedVersion: number,
    document: MemoryDocument,
    revision: RevisionRecord
  ): Promise<boolean> {
    const stored = this.projects.get(projectId)
    if (!stored || stored.version !== expectedVersion) return false

    stored.document = structuredClone(document)
    stored.version = document.memoryVersion
    stored.revisions.push(structuredClone(revision))
    return true
  }

  async loadRevisions(projectId: string): Promise<RevisionRecord[]> {
    const stored = this.projects.get(projectId)
    if (!stored) return []
    return structuredClone(stored.revisions).sort((a, b) => b.version - a.version)
  }
}
