/**
 * Orchestrator runtime types.
 *
 * Contracts implemented here:
 * - .claude/context/coordinator/planner.md (intents, plan format)
 * - .claude/context/coordinator/workflow.md (phases)
 * - .claude/context/prompts/output_formats.md + schemas/envelope.schema.json (envelope)
 */
import type { ValidationError, WritableSectionKey } from "../memory/types"

export type Intent = "NEW_PROJECT" | "REVISION" | "REFINEMENT" | "QUESTION" | "EXPORT"

/** Pipeline phases in canonical order (workflow.md). Agent steps live in the first six. */
export const AGENT_PHASES = [
  "INTAKE",
  "CLARIFICATION",
  "REQUIREMENTS",
  "ARCHITECTURE",
  "ENGINEERING",
  "DOCUMENTATION",
] as const

export type AgentPhase = (typeof AGENT_PHASES)[number]

export interface PlanStep {
  id: string
  agent: string
  phase: AgentPhase
  reads: WritableSectionKey[]
  writes: WritableSectionKey[]
  dependsOn: string[]
  parallelGroup: string | null
}

export interface Plan {
  runId: string
  intent: Intent
  steps: PlanStep[]
}

export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; reason: "NOT_IMPLEMENTED" | "INVALID_STATE"; message: string }

export interface EnvelopeIssue {
  severity: "info" | "warning" | "blocking"
  target?: string
  message: string
}

/** The agent output envelope (formal contract: schemas/envelope.schema.json). */
export interface Envelope {
  agent: string
  version: number
  status: "ok" | "partial" | "failed"
  writes: Record<string, unknown>
  issues?: EnvelopeIssue[]
  confidence?: "high" | "medium" | "low"
  assumptionsUsed?: string[]
}

export interface StepResult {
  stepId: string
  agent: string
  outcome: "committed" | "blocked"
  attempts: number
  errors?: ValidationError[]
}

export interface RunSummary {
  status: "DONE" | "FAILED"
  stepResults: StepResult[]
  blockages: Array<{ section: string; reason: string }>
}
