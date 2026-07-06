/**
 * Public surface of the Shared Memory layer. Consumers (Phase 2 orchestrator,
 * API routes) import from here; internal modules stay private.
 */
export { MemoryStore, buildInitialDocument } from "./store"
export { PrismaPersistence } from "./prisma-adapter"
export { validateDocument } from "./validate"
export { SECTION_OWNERS, ORCHESTRATOR_AGENT_ID } from "./ownership"
export { canTransition, staleTargets } from "./status"
export type {
  CommitMeta,
  CommitResult,
  MemoryDocument,
  RevisionRecord,
  SectionStatus,
  SectionWrites,
  ValidationError,
  WritableSectionKey,
} from "./types"
