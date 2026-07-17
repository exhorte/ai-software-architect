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
 * - CLARIFICATION pauses the run through the ClarificationGate when blocking
 *   questions are unanswered (max 2 rounds, workflow.md); leftover
 *   non-blocking questions become recorded assumptions rather than silent gaps;
 * - after each phase, surviving draft sections written in that phase flip to
 *   `valid` (structural gate), then the phase's consistency rules run and any
 *   finding is routed back to its owning agent for one corrective re-run
 *   (rules/consistency.md § Enforcement) — the engine never patches content.
 */
import type { MemoryStore } from "../memory/store"
import type { SectionStatus, ValidationError } from "../memory/types"
import { checkBusinessConsistency, type ConsistencyFinding } from "./consistency"
import { checkEnvelopeAgainstStep, envelopeWrites, parseEnvelope } from "./envelope"
import { assemblePrompt } from "./prompt"
import { AGENT_PHASES, type Plan, type PlanStep, type RunSummary, type StepResult } from "./types"

/** Invocation port: Trigger.dev adapter in production, in-process mock in tests. */
export interface AgentInvoker {
  invoke(step: PlanStep, prompt: string): Promise<string>
  /** Parallel group execution — the Trigger adapter uses batchTriggerAndWait. */
  invokeGroup(calls: Array<{ step: PlanStep; prompt: string }>): Promise<string[]>
}

export interface ClarificationQuestion {
  id: string
  question: string
  why: string
  suggestedDefault?: string | null
}

export interface ClarificationAnswer {
  id: string
  answer: string
}

/**
 * Human-in-the-loop port: the only place the pipeline waits for a person.
 * Production suspends the run on a Trigger.dev waitpoint; tests answer inline.
 * Returning fewer answers than questions is allowed — whatever is left
 * unanswered becomes an assumption.
 */
export interface ClarificationGate {
  requestAnswers(request: {
    projectId: string
    runId: string
    questions: ClarificationQuestion[]
  }): Promise<ClarificationAnswer[]>
}

/**
 * Run status mirrors the Prisma RunStatus enum. `DONE` is the canonical
 * completed state; a run that ends with blocked sections is `DONE` with
 * non-empty blockages — the sections are blocked, not the run.
 */
export type RunStatusValue =
  | "RUNNING"
  | "WAITING_CLARIFICATION"
  | "RESUMING"
  | "DONE"
  | "FAILED"

/** Waitpoint bookkeeping persisted on the Run row. Contains no secret. */
export interface ClarificationRunState {
  /** Waitpoint token id — an opaque handle, never a credential. */
  tokenId: string
  /** Ids of the questions actually asked; their text lives in Shared Memory. */
  questionIds: string[]
  questionCount: number
  expiresAt: string
  suspendedAt: string
  resumedAt?: string
}

/** Run bookkeeping port (Run row); the memory document stays the contract truth. */
export interface RunRecorder {
  update(fields: {
    phase?: string
    stepId?: string
    status?: RunStatusValue
    blockages?: Array<{ section: string; reason: string }>
    clarification?: ClarificationRunState | null
  }): Promise<void>
}

interface EngineDeps {
  store: MemoryStore
  invoker: AgentInvoker
  recorder: RunRecorder
  /** Optional: without it, CLARIFICATION cannot pause and questions become assumptions. */
  clarificationGate?: ClarificationGate
}

interface ClarificationItem {
  id?: string
  question?: string
  why?: string
  blocking?: boolean
  suggestedDefault?: string | null
  answer?: string | null
}

/** Turns a thrown agent invocation into a blocking validation error. */
function invocationError(error: unknown): ValidationError {
  const message = (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 200)
  return {
    level: 3,
    section: "(invocation)",
    path: "/",
    rule: "agent-invocation-error",
    message: `Agent invocation failed: ${message}`,
  }
}

/**
 * workflow.md § Clarification Loop allows up to 2 rounds; V1 runs a single
 * round and converts whatever stays unanswered into assumptions. That is
 * within the contract (≤ 2) and guarantees termination; a second round is a
 * refinement, not a requirement.
 */

export class OrchestrationEngine {
  constructor(private readonly deps: EngineDeps) {}

  async run(projectId: string, plan: Plan): Promise<RunSummary> {
    const { store, recorder } = this.deps
    const stepResults: StepResult[] = []
    const blockages: Array<{ section: string; reason: string }> = []

    for (const phase of AGENT_PHASES) {
      const phaseSteps = plan.steps.filter((step) => step.phase === phase)
      if (phaseSteps.length === 0) continue

      if (phase === "CLARIFICATION") {
        const answered = await this.resolveClarifications(projectId, plan.runId)
        // Nothing blocking was pending (or nobody could answer): the analyst
        // has no answers to integrate, so the phase has no work to do.
        if (!answered) continue
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
                reason: `Step ${result.stepId} (${result.agent}) blocked: ${result.errors?.[0]?.message ?? "unknown"}`,
              })
            }
          }
        }
      }

      await this.closePhaseGate(projectId, phaseSteps, stepResults)

      // Cross-artifact gate: findings go back to their owning agent for one
      // corrective re-run; unresolved ones are reported, never patched here.
      const findings = await this.runConsistencyGate(projectId, plan, phase, stepResults)
      for (const finding of findings) {
        blockages.push({
          section: finding.sections[0] ?? "(consistency)",
          reason: `${finding.rule}: ${finding.detail}`,
        })
      }
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
    const { store } = this.deps
    const attempt = previousErrors ? 2 : 1

    const slice = (await store.getSections(projectId, step.reads)) ?? {}
    const prompt = assemblePrompt(step, slice, previousErrors)

    // A thrown invocation (network / LLM API error) is not the agent's fault
    // and must never abort the run: retry the raw call once, then block this
    // step and let the run continue (orchestrator.md prime directive 5).
    let raw: string
    try {
      raw = await this.invokeWithRetry(step, prompt)
    } catch (error) {
      return {
        stepId: step.id,
        agent: step.agent,
        outcome: "blocked",
        attempts: attempt,
        errors: [invocationError(error)],
      }
    }

    const errors = await this.validateAndCommit(projectId, runId, step, raw)
    if (errors.length === 0) {
      return { stepId: step.id, agent: step.agent, outcome: "committed", attempts: attempt }
    }
    if (attempt === 1) {
      return this.executeStep(projectId, runId, step, errors)
    }
    return { stepId: step.id, agent: step.agent, outcome: "blocked", attempts: 2, errors }
  }

  /** One transient-retry of the raw invocation. Rethrows if the second call also fails. */
  private async invokeWithRetry(step: PlanStep, prompt: string): Promise<string> {
    try {
      return await this.deps.invoker.invoke(step, prompt)
    } catch {
      return await this.deps.invoker.invoke(step, prompt)
    }
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

    let raws: string[]
    try {
      raws = await invoker.invokeGroup(calls)
    } catch {
      // The batch failed as a whole (the adapter throws if any member fails).
      // Degrade to per-step execution so one agent's API error blocks only its
      // own section instead of aborting every step in the group.
      const degraded: StepResult[] = []
      for (const step of steps) {
        degraded.push(await this.executeStep(projectId, runId, step))
      }
      return degraded
    }

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

  /**
   * The clarification loop (workflow.md). Asks the user through the gate,
   * commits the answers, and turns whatever stays unanswered into recorded
   * assumptions. Returns true when answers arrived and the analyst has
   * something to integrate.
   *
   * The orchestrator commits answers because it is the only committer — it
   * transmits the user's words, it does not author content.
   */
  private async resolveClarifications(projectId: string, runId: string): Promise<boolean> {
    const { store, clarificationGate, recorder } = this.deps

    const slice = await store.getSections(projectId, ["clarifications"])
    const items = (slice?.clarifications ?? []) as ClarificationItem[]
    if (!Array.isArray(items) || items.length === 0) return false

    const pendingBlocking = items.filter((c) => c.blocking === true && !c.answer && c.id)
    let answeredAny = false

    if (pendingBlocking.length > 0 && clarificationGate) {
      await recorder.update({ status: "WAITING_CLARIFICATION" })

      const answers = await clarificationGate.requestAnswers({
        projectId,
        runId,
        questions: pendingBlocking.map((c) => ({
          id: c.id as string,
          question: c.question ?? "",
          why: c.why ?? "",
          suggestedDefault: c.suggestedDefault ?? null,
        })),
      })

      await recorder.update({ status: "RUNNING" })

      const byId = new Map(answers.filter((a) => a.answer?.trim()).map((a) => [a.id, a.answer]))
      if (byId.size > 0) {
        const updated = items.map((c) =>
          c.id && byId.has(c.id) ? { ...c, answer: byId.get(c.id) } : c
        )
        await store.commitSection(
          projectId,
          { agentId: "orchestrator", runId },
          { clarifications: updated },
          { preserveStatus: true }
        )
        answeredAny = true
      }
    }

    await this.recordUnansweredAsAssumptions(projectId, runId)
    return answeredAny
  }

  /**
   * Unanswered questions never vanish: they become explicit assumptions the
   * user can challenge (workflow.md § Clarification Loop).
   */
  private async recordUnansweredAsAssumptions(projectId: string, runId: string): Promise<void> {
    const { store } = this.deps
    const slice = await store.getSections(projectId, ["clarifications", "project"])
    const items = (slice?.clarifications ?? []) as ClarificationItem[]
    if (!Array.isArray(items)) return

    const unanswered = items.filter((c) => !c.answer && c.id)
    if (unanswered.length === 0) return

    const project = (slice?.project ?? {}) as Record<string, unknown>
    const existing = Array.isArray(project.assumptions)
      ? (project.assumptions as Array<{ fromClarification?: string }>)
      : []
    const alreadyRecorded = new Set(existing.map((a) => a.fromClarification).filter(Boolean))

    const additions = unanswered
      .filter((c) => !alreadyRecorded.has(c.id))
      .map((c, index) => ({
        id: `ASM-${String(existing.length + index + 1).padStart(3, "0")}`,
        statement: c.suggestedDefault
          ? `${c.question} → assumed: ${c.suggestedDefault}`
          : `${c.question} → left open; proceeding without an answer.`,
        source: "unansweredClarification" as const,
        fromClarification: c.id as string,
      }))
    if (additions.length === 0) return

    await store.commitSection(
      projectId,
      { agentId: "orchestrator", runId },
      { project: { ...project, assumptions: [...existing, ...additions] } },
      { preserveStatus: true }
    )
  }

  /**
   * Runs the phase's consistency rules and gives the owning agent exactly one
   * chance to fix its own output. Returns the findings that survived.
   */
  private async runConsistencyGate(
    projectId: string,
    plan: Plan,
    phase: string,
    stepResults: StepResult[]
  ): Promise<ConsistencyFinding[]> {
    if (phase !== "REQUIREMENTS") return [] // later phases register their own rules

    // Only enforce rules the plan actually undertook: a finding routed to an
    // agent this run never scheduled is about work nobody asked for.
    const plannedAgents = new Set(plan.steps.map((s) => s.agent))
    const findings = (await this.checkPhaseConsistency(projectId)).filter((f) =>
      plannedAgents.has(f.routedTo)
    )
    if (findings.length === 0) return []

    // One corrective re-run per agent, carrying all of its findings at once —
    // the same "here is everything that is wrong, fix exactly this" contract as
    // a validation retry (response_rules.md rule 13).
    const byAgent = new Map<string, ConsistencyFinding[]>()
    for (const finding of findings) {
      byAgent.set(finding.routedTo, [...(byAgent.get(finding.routedTo) ?? []), finding])
    }

    for (const [agent, agentFindings] of byAgent) {
      const step = plan.steps.find((s) => s.agent === agent && s.phase === phase)
      if (!step) continue

      const result = await this.executeStep(
        projectId,
        plan.runId,
        step,
        agentFindings.map((f) => ({
          level: 3 as const,
          section: f.sections[0] ?? "(consistency)",
          path: "/",
          rule: f.rule,
          message: f.detail,
        }))
      )
      stepResults.push({
        ...result,
        stepId: `${result.stepId}#${agentFindings.map((f) => f.rule).join("+")}`,
      })
    }

    // Re-check: only what the corrective re-run failed to fix is a real finding.
    return (await this.checkPhaseConsistency(projectId)).filter((f) =>
      plannedAgents.has(f.routedTo)
    )
  }

  private async checkPhaseConsistency(projectId: string): Promise<ConsistencyFinding[]> {
    const slice = await this.deps.store.getSections(projectId, [
      "requirements",
      "userStories",
      "actors",
    ])
    if (!slice) return []
    return checkBusinessConsistency({
      requirements: slice.requirements,
      userStories: slice.userStories,
      actors: slice.actors,
    })
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
