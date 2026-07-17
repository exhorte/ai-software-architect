import { task, metadata } from "@trigger.dev/sdk/v3"

import { Prisma } from "@/app/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { MemoryStore } from "@/lib/memory/store"
import { PrismaPersistence } from "@/lib/memory/prisma-adapter"
import {
  OrchestrationEngine,
  type AgentInvoker,
  type ClarificationRunState,
  type RunRecorder,
  type RunStatusValue,
} from "@/lib/orchestrator/engine"
import { TriggerClarificationGate } from "./clarification-gate"
import { buildPlan, classifyIntent } from "@/lib/orchestrator/planner"
import type { PlanStep } from "@/lib/orchestrator/types"
import { agentRunner } from "./agent-runner"

export interface OrchestratorPayload {
  projectId: string
  userId: string
  /** Raw project idea — used to initialize memory on a NEW_PROJECT run. */
  idea: string
}

/** Invoker port implemented on Trigger.dev child tasks (v4 rules: check result.ok, batch for groups). */
class TriggerAgentInvoker implements AgentInvoker {
  async invoke(step: PlanStep, prompt: string): Promise<string> {
    const result = await agentRunner.triggerAndWait({ step, prompt })
    if (!result.ok) {
      throw new Error(`agent-runner failed for ${step.id} (${step.agent}): ${result.error}`)
    }
    return result.output.raw
  }

  async invokeGroup(calls: Array<{ step: PlanStep; prompt: string }>): Promise<string[]> {
    const batch = await agentRunner.batchTriggerAndWait(
      calls.map((call) => ({ payload: call }))
    )
    return batch.runs.map((run, index) => {
      if (!run.ok) {
        throw new Error(
          `agent-runner failed for ${calls[index].step.id} (${calls[index].step.agent}): ${run.error}`
        )
      }
      return run.output.raw
    })
  }
}

/**
 * Persists run bookkeeping to the Run row and mirrors it into Trigger run
 * metadata so the UI can follow along. Carries no business logic and no secret:
 * the waitpoint token id is an opaque handle, never a credential.
 */
class PrismaRunRecorder implements RunRecorder {
  constructor(private readonly runRowId: string) {}

  async update(fields: {
    phase?: string
    stepId?: string
    status?: RunStatusValue
    blockages?: Array<{ section: string; reason: string }>
    clarification?: ClarificationRunState | null
  }): Promise<void> {
    await prisma.run.update({
      where: { id: this.runRowId },
      data: {
        ...(fields.phase ? { phase: fields.phase } : {}),
        ...(fields.stepId ? { stepId: fields.stepId } : {}),
        ...(fields.status ? { status: fields.status } : {}),
        ...(fields.blockages
          ? { blockages: fields.blockages as unknown as Prisma.InputJsonValue }
          : {}),
        ...(fields.clarification !== undefined
          ? {
              clarification: (fields.clarification ??
                Prisma.DbNull) as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    })

    if (fields.phase) metadata.set("phase", fields.phase)
    if (fields.stepId) metadata.set("stepId", fields.stepId)
    if (fields.status) metadata.set("status", fields.status)
    if (fields.clarification) {
      metadata.set("clarification", {
        questionCount: fields.clarification.questionCount,
        expiresAt: fields.clarification.expiresAt,
        suspendedAt: fields.clarification.suspendedAt,
        ...(fields.clarification.resumedAt ? { resumedAt: fields.clarification.resumedAt } : {}),
      })
    }
  }
}

/**
 * The Coordinator as a durable workflow: init memory if needed, plan, then
 * hand the state machine to the engine. Thin by design — every policy lives
 * in lib/orchestrator/ where it is unit-tested.
 */
export const pipelineOrchestrator = task({
  id: "pipeline-orchestrator",
  retry: { maxAttempts: 1 },
  run: async (payload: OrchestratorPayload, { ctx }) => {
    const store = new MemoryStore(new PrismaPersistence())

    let memory = await store.getMemory(payload.projectId)
    if (!memory) {
      const init = await store.initMemory(payload.projectId, payload.idea)
      if (!init.ok) {
        throw new Error(`Memory initialization failed: ${JSON.stringify(init.errors)}`)
      }
      memory = await store.getMemory(payload.projectId)
    }

    const intent = classifyIntent(memory)
    if (!intent) {
      throw new Error(
        "This project already has pipeline output; follow-up intents ship in Phase 3+."
      )
    }

    const runRow = await prisma.run.create({
      data: {
        projectId: payload.projectId,
        userId: payload.userId,
        intent,
        phase: "INTAKE",
        plan: {},
        triggerRunId: ctx.run.id,
      },
    })

    const planResult = buildPlan(intent, runRow.id)
    if (!planResult.ok) {
      await prisma.run.update({
        where: { id: runRow.id },
        data: { status: "FAILED", blockages: [{ section: "(plan)", reason: planResult.message }] },
      })
      throw new Error(planResult.message)
    }
    await prisma.run.update({
      where: { id: runRow.id },
      data: { plan: JSON.parse(JSON.stringify(planResult.plan)) },
    })

    const recorder = new PrismaRunRecorder(runRow.id)
    const engine = new OrchestrationEngine({
      store,
      invoker: new TriggerAgentInvoker(),
      recorder,
      // The waitpoint adapter: the engine decides *when* to ask, this decides *how* to wait.
      clarificationGate: new TriggerClarificationGate({
        projectId: payload.projectId,
        runId: runRow.id,
        recorder,
      }),
    })

    return engine.run(payload.projectId, planResult.plan)
  },
})
