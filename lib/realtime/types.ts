/**
 * Realtime event types shared between server (broadcaster) and client (listener).
 *
 * Design:
 * - Events are lightweight deltas — the client invalidates and refetches
 *   canonical APIs; no full payloads are broadcast.
 * - Every event carries projectId + runId + timestamp; the client filters
 *   by projectId (room guard) and deduplicates by sequence.
 * - sequence is a monotonic counter per (projectId, runId) that lets the
 *   client reject out-of-order or duplicate events.
 * - Guardrails: never broadcast secrets, tokens, prompts, full envelopes,
 *   or raw Prisma payloads.
 */
export type PipelineEventType =
  | "run.started"
  | "run.status_changed"
  | "run.step_changed"
  | "run.waiting_clarification"
  | "run.resumed"
  | "run.completed"
  | "run.failed"
  | "memory.section_updated"
  | "memory.section_status_changed"
  | "clarification.updated"

export interface PipelineEvent {
  type: PipelineEventType
  projectId: string
  runId: string
  timestamp: string
  /** Monotonic counter — the client rejects events with sequence <= last seen. */
  sequence: number
  // ── run.* fields ──
  /** Current phase (run.started, run.step_changed). */
  phase?: string
  /** Current step id (run.step_changed). */
  stepId?: string
  /** New status (run.status_changed). */
  status?: string
  /** Agent that produced the content (memory.section_updated). */
  agentId?: string
  // ── memory.* fields ──
  /** Section key that was committed (memory.section_updated, memory.section_status_changed). */
  section?: string
  /** New lifecycle status of the section (memory.section_updated, memory.section_status_changed). */
  sectionStatus?: string
}

/**
 * Server-side contract: emit a pipeline event to all room occupants.
 * Best-effort — a failed broadcast must never abort or fail a run.
 */
export interface RealtimeEmitter {
  emit(event: PipelineEvent): Promise<void>
}

// Smallest possible payload that validates the event at the network edge.
export const MAX_EVENT_SIZE_BYTES = 1024 // 1 KB hard cap
