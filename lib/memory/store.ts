/**
 * Shared Memory store — the ONLY write path to a project's memory document.
 *
 * Commit pipeline (shared_memory.md § Access Rules, validation.md):
 *   ownership → apply writes on a draft → schema + uniqueness validation →
 *   status transitions + lightweight history entry → optimistic-lock persist
 *   (full previous values go to the revision history, decision D3).
 */
import { checkOwnership, ORCHESTRATOR_AGENT_ID } from "./ownership"
import type { MemoryPersistence } from "./persistence"
import { staleTargets } from "./status"
import type {
  CommitMeta,
  CommitResult,
  MemoryDocument,
  RevisionRecord,
  SectionStatus,
  SectionWrites,
  ValidationError,
  WritableSectionKey,
} from "./types"
import { validateDocument } from "./validate"

/** Soft budget before a size warning is attached to commit results (~1 MB). */
const DOCUMENT_SIZE_BUDGET_BYTES = 1_000_000

function readKey(document: MemoryDocument, key: string): unknown {
  const [top, sub] = key.split(".")
  const topValue = document[top]
  if (sub === undefined) return topValue
  if (topValue && typeof topValue === "object") {
    return (topValue as Record<string, unknown>)[sub]
  }
  return undefined
}

function writeKey(document: MemoryDocument, key: string, value: unknown): void {
  const [top, sub] = key.split(".")
  if (sub === undefined) {
    document[top] = value
    return
  }
  const container =
    document[top] && typeof document[top] === "object"
      ? (document[top] as Record<string, unknown>)
      : {}
  container[sub] = value
  document[top] = container
}

/** Minimal valid skeleton for a fresh project memory (decision: initMemory). */
export function buildInitialDocument(idea: string, name = "Untitled Project"): MemoryDocument {
  return {
    memoryVersion: 1,
    project: {
      name,
      description: idea,
      goals: [],
      scope: { in: [], out: [] },
      constraints: [],
      assumptions: [],
    },
    runState: {
      phase: "INTAKE",
      sectionStatus: { project: "draft" },
      history: [],
    },
  }
}

export class MemoryStore {
  constructor(private readonly persistence: MemoryPersistence) {}

  /** Creates the version-1 document for a project from the raw user idea. */
  async initMemory(projectId: string, idea: string, name?: string): Promise<CommitResult> {
    const document = buildInitialDocument(idea, name)
    const errors = validateDocument(document)
    if (errors.length > 0) return { ok: false, errors }

    await this.persistence.create(projectId, document)
    return { ok: true, version: 1 }
  }

  async getMemory(projectId: string): Promise<MemoryDocument | null> {
    const loaded = await this.persistence.load(projectId)
    return loaded?.document ?? null
  }

  /** Scoped read: returns only the requested section keys (shared_memory.md rule 1). */
  async getSections(
    projectId: string,
    keys: WritableSectionKey[]
  ): Promise<Record<string, unknown> | null> {
    const loaded = await this.persistence.load(projectId)
    if (!loaded) return null

    const slice: Record<string, unknown> = {}
    for (const key of keys) {
      slice[key] = readKey(loaded.document, key)
    }
    return slice
  }

  /**
   * Validates and commits an agent's proposed writes. Atomic: any failure
   * (ownership, schema, uniqueness, version conflict) leaves memory untouched.
   */
  async commitSection(
    projectId: string,
    meta: CommitMeta,
    writes: SectionWrites
  ): Promise<CommitResult> {
    const loaded = await this.persistence.load(projectId)
    if (!loaded) {
      return {
        ok: false,
        errors: [
          {
            level: 1,
            section: "(document)",
            path: "/",
            rule: "memory-missing",
            message: `No Shared Memory document exists for project ${projectId}.`,
          },
        ],
      }
    }

    const writeKeys = Object.keys(writes) as WritableSectionKey[]
    if (writeKeys.length === 0) {
      return {
        ok: false,
        errors: [
          {
            level: 1,
            section: "(document)",
            path: "/",
            rule: "empty-commit",
            message: "A commit must write at least one section.",
          },
        ],
      }
    }

    const ownershipErrors = checkOwnership(meta.agentId, writes, loaded.document)
    if (ownershipErrors.length > 0) return { ok: false, errors: ownershipErrors }

    // Apply writes on a draft copy; record prior values for the revision.
    const draft = structuredClone(loaded.document)
    const changedSections: Record<string, unknown> = {}
    for (const key of writeKeys) {
      changedSections[key] = readKey(loaded.document, key) ?? null
      writeKey(draft, key, structuredClone(writes[key]))
    }

    const nextVersion = loaded.version + 1
    draft.memoryVersion = nextVersion

    // Status lifecycle: written sections become draft (runState itself has no status).
    for (const key of writeKeys) {
      if (key === "runState") continue
      draft.runState.sectionStatus[key] = "draft"
    }
    draft.runState.history = [
      ...(draft.runState.history ?? []),
      {
        version: nextVersion,
        agentId: meta.agentId,
        sections: writeKeys,
        at: new Date().toISOString(),
      },
    ]

    const validationErrors = validateDocument(draft)
    if (validationErrors.length > 0) return { ok: false, errors: validationErrors }

    const revision: RevisionRecord = {
      version: nextVersion,
      agentId: meta.agentId,
      runId: meta.runId,
      stepId: meta.stepId,
      changedSections,
      createdAt: new Date().toISOString(),
    }

    const committed = await this.persistence.commit(projectId, loaded.version, draft, revision)
    if (!committed) {
      return {
        ok: false,
        errors: [
          {
            level: 1,
            section: "(document)",
            path: "/memoryVersion",
            rule: "version-conflict",
            message: `Concurrent commit detected (expected version ${loaded.version}).`,
          },
        ],
      }
    }

    const warnings: string[] = []
    const size = JSON.stringify(draft).length
    if (size > DOCUMENT_SIZE_BUDGET_BYTES) {
      warnings.push(
        `Memory document is ${size} bytes (budget ${DOCUMENT_SIZE_BUDGET_BYTES}); consider pruning runState.history.`
      )
    }

    return { ok: true, version: nextVersion, warnings }
  }

  /**
   * Flips the section statuses toward `valid` after a phase gate passes,
   * or to `blocked` after repeated failures. Orchestrator-only by design.
   */
  async setSectionStatus(
    projectId: string,
    updates: Record<string, SectionStatus>
  ): Promise<CommitResult> {
    const loaded = await this.persistence.load(projectId)
    if (!loaded) return { ok: false, errors: [missingMemoryError(projectId)] }

    const draft = structuredClone(loaded.document)
    draft.runState.sectionStatus = { ...draft.runState.sectionStatus, ...updates }

    return this.persistRunStateChange(projectId, loaded.version, draft, loaded.document.runState)
  }

  /**
   * Marks every section invalidated by `changedSections` as stale, per the
   * invalidation map (planner.md). Returns the keys that were flipped.
   */
  async markStale(projectId: string, changedSections: string[]): Promise<string[]> {
    const loaded = await this.persistence.load(projectId)
    if (!loaded) return []

    const targets = staleTargets(changedSections, loaded.document.runState.sectionStatus)
    if (targets.length === 0) return []

    const draft = structuredClone(loaded.document)
    for (const key of targets) {
      draft.runState.sectionStatus[key] = "stale"
    }

    const result = await this.persistRunStateChange(
      projectId,
      loaded.version,
      draft,
      loaded.document.runState
    )
    return result.ok ? targets : []
  }

  /**
   * Reconstructs a section's value at a given memory version by walking the
   * revision history backwards from the current document (AC6).
   */
  async getSectionAtVersion(
    projectId: string,
    key: WritableSectionKey,
    version: number
  ): Promise<unknown> {
    const loaded = await this.persistence.load(projectId)
    if (!loaded) return undefined

    let value = readKey(loaded.document, key)
    const revisions = await this.persistence.loadRevisions(projectId)

    for (const revision of revisions) {
      if (revision.version <= version) break
      if (key in revision.changedSections) {
        value = revision.changedSections[key]
      }
    }
    return value ?? undefined
  }

  private async persistRunStateChange(
    projectId: string,
    expectedVersion: number,
    draft: MemoryDocument,
    previousRunState: MemoryDocument["runState"]
  ): Promise<CommitResult> {
    const nextVersion = expectedVersion + 1
    draft.memoryVersion = nextVersion

    const validationErrors = validateDocument(draft)
    if (validationErrors.length > 0) return { ok: false, errors: validationErrors }

    const committed = await this.persistence.commit(projectId, expectedVersion, draft, {
      version: nextVersion,
      agentId: ORCHESTRATOR_AGENT_ID,
      changedSections: { runState: previousRunState },
      createdAt: new Date().toISOString(),
    })

    if (!committed) {
      return {
        ok: false,
        errors: [
          {
            level: 1,
            section: "(document)",
            path: "/memoryVersion",
            rule: "version-conflict",
            message: `Concurrent commit detected (expected version ${expectedVersion}).`,
          },
        ],
      }
    }
    return { ok: true, version: nextVersion }
  }
}

function missingMemoryError(projectId: string): ValidationError {
  return {
    level: 1,
    section: "(document)",
    path: "/",
    rule: "memory-missing",
    message: `No Shared Memory document exists for project ${projectId}.`,
  }
}
