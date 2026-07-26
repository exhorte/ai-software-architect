/**
 * Pure guard functions for pipeline event validation.
 * Extracted so they are testable without React rendering.
 *
 * Exported for tests; consumed by usePipelineEvents via the same logic.
 */
export interface RawPipelineEvent {
  type?: unknown
  projectId?: unknown
  runId?: unknown
  sequence?: unknown
  timestamp?: unknown
}

export interface GuardResult {
  accepted: boolean
  reason?: "wrong-project" | "wrong-run" | "duplicate" | "out-of-order" | "future-sequence"
}

const CLOCK_SLACK_MS = 1000

/**
 * Validates an incoming pipeline event against local state.
 * Pure function — no side effects, no React.
 */
export function validatePipelineEvent(
  event: RawPipelineEvent,
  expectedProjectId: string,
  expectedRunId: string | null,
  seenSequences: Set<number>,
  lastSequence: number,
  lastTimestamp: string
): GuardResult {
  const type = typeof event.type === "string" ? event.type : ""
  if (!type || type === "ai-status") return { accepted: false, reason: "wrong-project" }

  const evtProjectId = typeof event.projectId === "string" ? event.projectId : ""
  const evtRunId = typeof event.runId === "string" ? event.runId : ""
  const seq = typeof event.sequence === "number" ? event.sequence : 0
  const ts = typeof event.timestamp === "string" ? event.timestamp : ""

  // Guard 1: room guard.
  if (evtProjectId !== expectedProjectId) return { accepted: false, reason: "wrong-project" }

  // Guard 2: run guard.
  if (expectedRunId && evtRunId && evtRunId !== expectedRunId)
    return { accepted: false, reason: "wrong-run" }

  // Guard 3: dedup.
  if (seenSequences.has(seq)) return { accepted: false, reason: "duplicate" }

  // Guard 4: ordering.
  if (seq <= lastSequence) return { accepted: false, reason: "out-of-order" }

  // Secondary ordering guard: timestamp.
  if (ts && lastTimestamp && ts < lastTimestamp) {
    const last = new Date(lastTimestamp).getTime()
    const current = new Date(ts).getTime()
    if (!isNaN(last) && !isNaN(current) && last - current > CLOCK_SLACK_MS) {
      return { accepted: false, reason: "future-sequence" }
    }
  }

  return { accepted: true }
}
