/**
 * Section status lifecycle and staleness propagation.
 *
 * Contracts mirrored here (contract first, code second):
 * - Lifecycle: .claude/context/memory/shared_memory.md § Section Lifecycle
 * - Invalidation map: .claude/context/coordinator/planner.md § Invalidation Map
 */
import type { SectionStatus } from "./types"

/** Legal transitions of the section lifecycle. */
const TRANSITIONS: Record<SectionStatus, SectionStatus[]> = {
  // First commit puts a section in draft.
  missing: ["draft"],
  // Recommit (retry), gate pass, or second failure.
  draft: ["draft", "valid", "blocked"],
  // Upstream change, refinement rewrite, or a late blocking failure.
  valid: ["stale", "draft", "blocked"],
  // Regeneration after a replan.
  stale: ["draft"],
  // Unblocked by a new run/retry.
  blocked: ["draft"],
}

export function canTransition(from: SectionStatus, to: SectionStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Invalidation map: when the key section changes, every section whose status
 * key starts with one of the listed prefixes becomes stale.
 * "*" means everything downstream of the business framing.
 */
const INVALIDATION_MAP: Record<string, string[]> = {
  project: ["*"],
  actors: ["*"],
  requirements: ["architecture", "database", "security", "api", "stack", "engineering", "roadmap", "backlog", "documentation"],
  userStories: ["architecture", "database", "security", "api", "stack", "engineering", "roadmap", "backlog", "documentation"],
  entities: ["architecture.uml", "database", "api"],
  architecture: ["database", "api", "stack", "engineering", "roadmap", "backlog", "documentation"],
  database: ["roadmap", "backlog", "documentation"],
  api: ["roadmap", "backlog", "documentation"],
  stack: ["roadmap", "backlog", "documentation"],
}

/** Status keys that are never invalidated by upstream changes. */
const NEVER_STALE_PREFIXES = ["runState", "project", "actors", "clarifications"]

function isDownstreamOf(statusKey: string, prefix: string): boolean {
  return statusKey === prefix || statusKey.startsWith(`${prefix}.`)
}

/**
 * Given the sections that changed, returns the status keys (among those
 * currently tracked) that must flip to `stale`. Only `draft` and `valid`
 * sections go stale — `missing` and `blocked` have nothing to invalidate,
 * and the changed sections themselves are never self-invalidated.
 */
export function staleTargets(
  changedSections: string[],
  sectionStatus: Record<string, SectionStatus>
): string[] {
  const prefixes = new Set<string>()

  for (const changed of changedSections) {
    // "architecture.uml" invalidates through its top-level entry.
    const topLevel = changed.split(".")[0]
    for (const target of INVALIDATION_MAP[topLevel] ?? []) {
      prefixes.add(target)
    }
  }

  const wildcard = prefixes.has("*")

  return Object.entries(sectionStatus)
    .filter(([key, status]) => {
      if (status !== "draft" && status !== "valid") return false
      if (changedSections.some((changed) => isDownstreamOf(key, changed))) return false
      if (NEVER_STALE_PREFIXES.some((prefix) => isDownstreamOf(key, prefix))) return false
      if (wildcard) return true
      return [...prefixes].some((prefix) => isDownstreamOf(key, prefix))
    })
    .map(([key]) => key)
}
