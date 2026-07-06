/**
 * Orchestration engine — the executable state machine of
 * .claude/context/coordinator/orchestrator.md, kept OUT of the Trigger.dev
 * task so it is testable in-process (same hexagonal seam as Phase 1).
 *
 * Policies implemented:
 * - phases run in canonical order; steps grouped by parallelGroup;
 * - one semantic retry with the validation errors appended; second failure
 *   marks the step's sections `blocked` and the run continues (orchestrator.md
 *   prime directive 5);
 * - CLARIFICATION runs only when unanswered blocking clarifications exist
 *   (Phase 2: with none, the phase auto-passes; the interactive pause ships
 *   in Phase 3);
 * - after each phase, surviving draft sections written in that phase flip to
 *   `valid` (structural gate — the business gates arrive with each team).
 */
import type { MemoryStore } from "../memory/store"
import type { SectionStatus, ValidationError } from "../memory/types"
import { checkEnvelopeAgainstStep, envelopeWrites, parseEnvelope } from "./envelope"
import { assemblePrompt } from "./prompt"
import { AGENT_PHASES, type Plan, type PlanStep, type RunSummary, type StepResult } from "./types"

/** Invocation port: Trigger.dev adapter in production, in-process mock in tests. */
export interface AgentInvoker {
  invoke(step: PlanStep, prompt: string): Promise<string>
  /** Parallel group execution — the Trigger adapter uses batchTriggerAndWait. */
  invokeGroup(calls: Array<{ step: PlanStep; prompt: string }>): Promise<string[]>
}

/** Run bookkeeping port (Run row); the memory document stays the contract truth. */
export interface RunRecorder {
  update(fields: {
    phase?: string
    status?: "RUNNING" | "DONE" | "FAILED"
    blockages?: Array<{ section: string; reason: string }>
  }): Promise<void>
}

interface EngineDeps {
  store: MemoryStore
  invoker: AgentInvoker
  recorder: RunRecorder
}

interface ClarificationItem {
  blocking?: boolean
  answer?: string | null
}

export class OrchestrationEngine {
  constructor(private readonly deps: EngineDeps) {}

  async run(projectId: string, plan: Plan): Promise<RunSummary> {
    const { store, recorder } = this.deps
    const stepResults: StepResult[] = []
    const blockages: Array<{ section: string; reason: string }> = []

    for (const phase of AGENT_PHASES) {
      const phaseSteps = plan.steps.filter((step) => step.phase === phase)
      if (phaseSteps.length === 0) continue

      if (phase === "CLARIFICATION" && !(await this.hasBlockingClarifications(projectId))) {
        continue
      }

      await this.advancePhase(projectId, phase)
      await recorder.update({ phase })

      const completed = new Set<string>()
      let cursor = 0
      while (cursor < phaseSteps.length) {
        const current = phaseSteps[cursor]
        const group =
          current.parallelGroup === null
            ? [current]
            : phaseSteps.filter(
                (step, index) =>
                  index >= cursor && step.parallelGroup === current.parallelGroup
              )
        cursor += group.length

        const runnable = group.filter((step) =>
          step.dependsOn.every((dep) => completed.has(dep) || this.isBlockedStep(dep, stepResults))
        )

        const results = await this.executeGroup(projectId, plan.runId, runnable)
        for (const result of results) {
          stepResults.push(result)
          completed.add(result.stepId)
          if (result.outcome === "blocked") {
            const step = runnable.find((s) => s.id === result.stepId)
            for (const section of step?.writes ?? []) {
              blockages.push({
                section,
                reason: `Step ${result.stepId} (${result.agent}) failed twice: ${result.errors?.[0]?.message ?? "unknown"}`,
              })
            }
          }
        }
      }

      await this.closePhaseGate(projectId, phaseSteps, stepResults)
    }

    await this.advancePhase(projectId, "VALIDATION")
    await this.advancePhase(projectId, "COMPOSE")
    await this.advancePhase(projectId, "DONE")
    if (blockages.length > 0) {
      await store.setSectionStatus(
        projectId,
        Object.fromEntries(blockages.map((b) => [b.section, "blocked" as SectionStatus]))
      )
    }

    const status = stepResults.some((r) => r.outcome === "committed") ? "DONE" : "FAILED"
    await recorder.update({ status, blockages })
    return { status, stepResults, blockages }
  }

  /** One step: assemble prompt → invoke → parse/validate → commit; one retry with errors. */
  private async executeStep(
    projectId: string,
    runId: string,
    step: PlanStep,
    previousErrors?: ValidationError[]
  ): Promise<StepResult> {
    const { store, invoker } = this.deps
    const attempt = previousErrors ? 2 : 1

    const slice = (await store.getSections(projectId, step.reads)) ?? {}
    const prompt = assemblePrompt(step, slice, previousErrors)
    const raw = await invoker.invoke(step, prompt)

    const errors = await this.validateAndCommit(projectId, runId, step, raw)
    if (errors.length === 0) {
      return { stepId: step.id, agent: step.agent, outcome: "committed", attempts: attempt }
    }
    if (attempt === 1) {
      return this.executeStep(projectId, runId, step, errors)
    }
    return { stepId: step.id, agent: step.agent, outcome: "blocked", attempts: 2, errors }
  }

  private async executeGroup(
    projectId: string,
    runId: string,
    steps: PlanStep[]
  ): Promise<StepResult[]> {
    if (steps.length === 0) return []
    if (steps.length === 1) return [await this.executeStep(projectId, runId, steps[0])]

    // First attempts run as a batch (Trigger adapter → batchTriggerAndWait);
    // retries are per-step because each carries its own error list.
    const { store, invoker } = this.deps
    const calls = []
    for (const step of steps) {
      const slice = (await store.getSections(projectId, step.reads)) ?? {}
      calls.push({ step, prompt: assemblePrompt(step, slice) })
    }

    const raws = await invoker.invokeGroup(calls)
    const results: StepResult[] = []
    for (const [index, step] of steps.entries()) {
      const errors = await this.validateAndCommit(projectId, runId, step, raws[index])
      if (errors.length === 0) {
        results.push({ stepId: step.id, agent: step.agent, outcome: "committed", attempts: 1 })
      } else {
        results.push(await this.executeStep(projectId, runId, step, errors))
      }
    }
    return results
  }

  /** Returns [] when the envelope was committed; otherwise the violations. */
  private async validateAndCommit(
    projectId: string,
    runId: string,
    step: PlanStep,
    raw: string
  ): Promise<ValidationError[]> {
    const { store } = this.deps

    const { envelope, errors: parseErrors } = parseEnvelope(raw)
    if (!envelope) return parseErrors

    const contractErrors = checkEnvelopeAgainstStep(envelope, step)
    if (contractErrors.length > 0) return contractErrors

    if (envelope.status === "failed") {
      return [
        {
          level: 3,
          section: "(envelope)",
          path: "/status",
          rule: "agent-failed",
          message: envelope.issues?.map((i) => i.message).join("; ") ?? "Agent reported failure.",
        },
      ]
    }

    const result = await store.commitSection(
      projectId,
      { agentId: step.agent, runId, stepId: step.id },
      envelopeWrites(envelope)
    )
    return result.ok ? [] : (result.errors ?? [])
  }

  private async hasBlockingClarifications(projectId: string): Promise<boolean> {
    const slice = await this.deps.store.getSections(projectId, ["clarifications"])
    const items = (slice?.clarifications ?? []) as ClarificationItem[]
    return Array.isArray(items) && items.some((c) => c.blocking === true && !c.answer)
  }

  /** Structural gate: draft sections written in this phase (and not blocked) become valid. */
  private async closePhaseGate(
    projectId: string,
    phaseSteps: PlanStep[],
    results: StepResult[]
  ): Promise<void> {
    const committedSteps = new Set(
      results.filter((r) => r.outcome === "committed").map((r) => r.stepId)
    )
    const updates: Record<string, SectionStatus> = {}
    for (const step of phaseSteps) {
      if (!committedSteps.has(step.id)) continue
      for (const section of step.writes) {
        if (section === "runState") continue
        updates[section] = "valid"
      }
    }
    if (Object.keys(updates).length > 0) {
      await this.deps.store.setSectionStatus(projectId, updates)
    }
  }

  private isBlockedStep(stepId: string, results: StepResult[]): boolean {
    return results.some((r) => r.stepId === stepId && r.outcome === "blocked")
  }

  private async advancePhase(projectId: string, phase: string): Promise<void> {
    const document = await this.deps.store.getMemory(projectId)
    if (!document) return
    const runState = structuredClone(document.runState)
    runState.phase = phase as typeof runState.phase
    await this.deps.store.commitSection(
      projectId,
      { agentId: "orchestrator" },
      { runState }
    )
  }
}
