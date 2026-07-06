/**
 * Plan builder — implements .claude/context/coordinator/planner.md for the
 * NEW_PROJECT intent. Other intents are refused explicitly until their phases
 * ship (REVISION/REFINEMENT: Phase 6 track T1; QUESTION/EXPORT: Phase 5).
 *
 * Classification is deterministic in Phase 2: a project whose memory is still
 * the initial skeleton is a NEW_PROJECT run. LLM-based classification of
 * free-form follow-ups arrives with the UI (Phase 3).
 */
import type { MemoryDocument } from "../memory/types"
import { AGENT_PHASES, type Intent, type Plan, type PlanResult, type PlanStep } from "./types"
import { ROUTING_TABLE } from "./routing"

/** A memory document is "virgin" when nothing beyond the init skeleton was committed. */
export function isVirginMemory(document: MemoryDocument): boolean {
  const statuses = document.runState.sectionStatus
  const committedSections = Object.keys(statuses).filter((key) => statuses[key] !== "missing")
  return committedSections.every((key) => key === "project")
}

export function classifyIntent(document: MemoryDocument | null): Intent | null {
  if (document === null || isVirginMemory(document)) return "NEW_PROJECT"
  return null // Follow-up intents are not classifiable yet (Phase 3+).
}

export function buildPlan(intent: Intent, runId: string): PlanResult {
  if (intent !== "NEW_PROJECT") {
    return {
      ok: false,
      reason: "NOT_IMPLEMENTED",
      message: `Intent ${intent} is not supported yet (see project/roadmap.md).`,
    }
  }

  const steps: PlanStep[] = []
  const stepIdByAgentPhase = new Map<string, string>()

  for (const phase of AGENT_PHASES) {
    for (const route of ROUTING_TABLE.filter((r) => r.phase === phase)) {
      const id = `step-${String(steps.length + 1).padStart(2, "0")}`
      stepIdByAgentPhase.set(`${phase}:${route.agent}`, id)

      steps.push({
        id,
        agent: route.agent,
        phase,
        reads: [...route.preconditions],
        writes: [...route.writes],
        dependsOn: (route.afterAgents ?? []).map((agent) => {
          const dep = stepIdByAgentPhase.get(`${phase}:${agent}`)
          if (!dep) throw new Error(`Route ${route.agent} depends on unknown agent ${agent} in ${phase}`)
          return dep
        }),
        parallelGroup: route.parallelGroup,
      })
    }
  }

  const plan: Plan = { runId, intent, steps }
  const violations = validatePlan(plan)
  if (violations.length > 0) {
    return { ok: false, reason: "INVALID_STATE", message: violations.join("; ") }
  }
  return { ok: true, plan }
}

/**
 * Structural plan guards (planner.md § Plan Format):
 * - two steps writing the same section can never share a parallel group
 *   (the single sanctioned requirements append runs in ARCH-A while nothing
 *   else there touches requirements — the guard still applies to it);
 * - dependsOn must reference existing earlier steps.
 */
export function validatePlan(plan: Plan): string[] {
  const violations: string[] = []
  const seenIds = new Set<string>()

  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!seenIds.has(dep)) {
        violations.push(`${step.id} depends on ${dep}, which does not precede it`)
      }
    }
    seenIds.add(step.id)
  }

  const byGroup = new Map<string, PlanStep[]>()
  for (const step of plan.steps) {
    if (!step.parallelGroup) continue
    const key = `${step.phase}:${step.parallelGroup}`
    byGroup.set(key, [...(byGroup.get(key) ?? []), step])
  }

  for (const [group, steps] of byGroup) {
    const writers = new Map<string, string>()
    for (const step of steps) {
      for (const section of step.writes) {
        const existing = writers.get(section)
        if (existing) {
          violations.push(
            `parallel group ${group}: ${existing} and ${step.id} both write "${section}"`
          )
        }
        writers.set(section, step.id)
      }
    }
  }

  return violations
}
