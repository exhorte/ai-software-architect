/**
 * Shared Memory runtime types.
 *
 * Contracts implemented here:
 * - .claude/context/memory/shared_memory.md (document + lifecycle)
 * - .claude/context/rules/validation.md (error format)
 * - .claude/context/schemas/project.schema.json (document structure)
 */

/** Top-level Shared Memory sections (properties of project.schema.json, minus memoryVersion). */
export const TOP_LEVEL_SECTIONS = [
  "project",
  "clarifications",
  "actors",
  "entities",
  "businessRules",
  "requirements",
  "userStories",
  "architecture",
  "database",
  "security",
  "api",
  "stack",
  "engineering",
  "roadmap",
  "backlog",
  "documentation",
  "runState",
] as const

export type TopLevelSection = (typeof TOP_LEVEL_SECTIONS)[number]

/**
 * Writable keys: top-level sections plus the dotted subsections that have
 * their own owner (see .claude/context/rules/consistency.md ownership map).
 */
export const WRITABLE_SECTION_KEYS = [
  "project",
  "clarifications",
  "actors",
  "entities",
  "businessRules",
  "requirements",
  "userStories",
  "architecture.style",
  "architecture.components",
  "architecture.adrs",
  "architecture.uml",
  "architecture.c4",
  "database",
  "security",
  "api",
  "stack",
  "engineering.backend",
  "engineering.frontend",
  "engineering.devops",
  "engineering.testStrategy",
  "roadmap",
  "backlog",
  "documentation.readme",
  "documentation.technical",
  "documentation.api",
  "documentation.diagrams",
  "documentation.exports",
  "runState",
] as const

export type WritableSectionKey = (typeof WRITABLE_SECTION_KEYS)[number]

/** Section lifecycle per shared_memory.md: missing → draft → valid → (stale | blocked). */
export type SectionStatus = "missing" | "draft" | "valid" | "stale" | "blocked"

export type RunPhase =
  | "INTAKE"
  | "CLARIFICATION"
  | "REQUIREMENTS"
  | "ARCHITECTURE"
  | "ENGINEERING"
  | "DOCUMENTATION"
  | "VALIDATION"
  | "COMPOSE"
  | "DONE"

export interface HistoryEntry {
  version: number
  agentId: string
  sections: string[]
  at: string
}

export interface RunState {
  runId?: string
  intent?: "NEW_PROJECT" | "REVISION" | "REFINEMENT" | "QUESTION" | "EXPORT"
  phase: RunPhase
  plan?: Record<string, unknown>
  sectionStatus: Record<string, SectionStatus>
  blockages?: Array<{ section: string; reason: string }>
  history?: HistoryEntry[]
}

/**
 * The Shared Memory document. Section payloads are structurally validated
 * against the JSON Schemas at every commit; TypeScript keeps them as
 * `unknown` on purpose — the schemas are the source of truth, not TS types.
 */
export interface MemoryDocument {
  memoryVersion: number
  project: Record<string, unknown>
  runState: RunState
  [section: string]: unknown
}

/** Structured validation error, per rules/validation.md § Error Reporting. */
export interface ValidationError {
  level: 1 | 2 | 3
  section: string
  path: string
  rule: string
  message: string
}

/** Metadata attached to every commit; persisted in the revision history. */
export interface CommitMeta {
  agentId: string
  runId?: string
  stepId?: string
}

/** Proposed writes: writable section key → new payload. */
export type SectionWrites = Partial<Record<WritableSectionKey, unknown>>

export interface CommitResult {
  ok: boolean
  version?: number
  errors?: ValidationError[]
  warnings?: string[]
}

export interface RevisionRecord {
  version: number
  agentId: string
  runId?: string
  stepId?: string
  /** Section key → value *before* this commit (null when the section did not exist). */
  changedSections: Record<string, unknown>
  createdAt: string
}
