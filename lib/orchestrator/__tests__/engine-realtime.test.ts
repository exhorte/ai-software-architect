/**
 * Tests 1-4, 11: Engine emits correct realtime events at key transitions.
 *
 * Reuses the same test infrastructure as engine.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest"

import { InMemoryPersistence } from "../../memory/memory-adapter"
import { MemoryStore } from "../../memory/store"
import {
  OrchestrationEngine,
  type AgentInvoker,
  type ClarificationAnswer,
  type ClarificationGate,
  type RunRecorder,
} from "../engine"
import type { PlanStep } from "../types"
import type { RealtimeEmitter, PipelineEvent } from "../../realtime/types"

const PROJECT = "proj_rt"

function makePlan(runId: string, steps: Array<Partial<PlanStep> & { id: string; agent: string; phase: string }>) {
  return {
    runId,
    intent: "NEW_PROJECT" as const,
    steps: steps.map((s) => ({
      id: s.id,
      agent: s.agent,
      phase: s.phase as PlanStep["phase"],
      reads: s.reads ?? [],
      writes: s.writes ?? [],
      dependsOn: s.dependsOn ?? [],
      parallelGroup: s.parallelGroup ?? null,
    })),
  }
}

const analystOk = JSON.stringify({
  agent: "business/analyst", version: 1, status: "ok",
  writes: {
    project: { name: "X", description: "test", goals: [{ id: "GOAL-01", statement: "Goal" }], scope: { in: ["a"], out: ["b"] }, constraints: [], assumptions: [] },
    actors: [{ id: "ACT-User", name: "User", kind: "human", role: "primary", description: "A user", goals: ["Use"] }],
    clarifications: [{ id: "CLR-001", question: "Scope?", why: "Need to know", blocking: false, suggestedDefault: "Web", answer: null }],
  },
})

class MockInvoker implements AgentInvoker {
  prompts: Array<{ agent: string; prompt: string }> = []
  constructor(private readonly responses: Record<string, string[]>) {}
  async invoke(step: PlanStep, prompt: string): Promise<string> {
    this.prompts.push({ agent: step.agent, prompt })
    const queue = this.responses[step.agent]
    if (!queue || queue.length === 0) throw new Error(`No response for ${step.agent}`)
    const next = queue.shift()!
    if (next.startsWith("__THROW__")) throw new Error(next.slice("__THROW__:".length) || "invocation failed")
    return next
  }
  async invokeGroup(calls: Array<{ step: PlanStep; prompt: string }>): Promise<string[]> {
    return Promise.all(calls.map((c) => this.invoke(c.step, c.prompt)))
  }
}

class MockRecorder implements RunRecorder {
  updates: Array<Record<string, unknown>> = []
  async update(fields: Record<string, unknown>): Promise<void> { this.updates.push(fields) }
}

class SpyEmitter implements RealtimeEmitter {
  events: PipelineEvent[] = []
  async emit(event: PipelineEvent): Promise<void> { this.events.push(event) }
}

class StaticGate implements ClarificationGate {
  constructor(private readonly answers: ClarificationAnswer[]) {}
  async requestAnswers(): Promise<ClarificationAnswer[]> {
    return this.answers
  }
}

describe("Engine realtime events", () => {
  let store: MemoryStore
  let recorder: MockRecorder
  let emitter: SpyEmitter

  beforeEach(async () => {
    store = new MemoryStore(new InMemoryPersistence())
    recorder = new MockRecorder()
    emitter = new SpyEmitter()
    await store.initMemory(PROJECT, "A test idea")
  })

  it("1. emits run.started at the beginning of a run", async () => {
    const invoker = new MockInvoker({ "business/analyst": [analystOk] })
    const plan = makePlan("run_1", [{ id: "s1", agent: "business/analyst", phase: "INTAKE", writes: ["project", "actors", "clarifications"] }])
    const engine = new OrchestrationEngine({ store, invoker, recorder, emitter })
    await engine.run(PROJECT, plan)

    expect(emitter.events.some((e) => e.type === "run.started")).toBe(true)
  })

  it("2. emits run.waiting_clarification → run.resumed via gate", async () => {
    // Seed a blocking question so the engine triggers the gate.
    await store.commitSection(PROJECT, { agentId: "business/analyst" }, {
      clarifications: [
        { id: "CLR-001", question: "Scope?", why: "Need to know", blocking: true, suggestedDefault: "Web", answer: null },
      ],
    })

    const invoker = new MockInvoker({ "business/analyst": [analystOk] })
    const gate = new StaticGate([{ id: "CLR-001", answer: "Web app" }])
    const plan = makePlan("run_2", [
      { id: "s2", agent: "business/analyst", phase: "CLARIFICATION", writes: ["clarifications", "project"] },
    ])
    const engine = new OrchestrationEngine({ store, invoker, recorder, emitter, clarificationGate: gate })

    await engine.run(PROJECT, plan)
    const types = emitter.events.map((e) => e.type)

    expect(types).toContain("run.waiting_clarification")
    expect(types).toContain("run.resumed")
    expect(types.indexOf("run.waiting_clarification")).toBeLessThan(types.indexOf("run.resumed"))
  })

  it("3. emits memory.section_updated when agent content is committed", async () => {
    const invoker = new MockInvoker({ "business/analyst": [analystOk] })
    const plan = makePlan("run_3", [{ id: "s1", agent: "business/analyst", phase: "INTAKE", writes: ["project", "actors", "clarifications"] }])
    const engine = new OrchestrationEngine({ store, invoker, recorder, emitter })

    await engine.run(PROJECT, plan)
    const memEvents = emitter.events.filter((e) => e.type === "memory.section_updated")

    expect(memEvents.length).toBeGreaterThanOrEqual(1)
    expect(memEvents.some((e) => e.section === "project")).toBe(true)
    expect(memEvents.some((e) => e.section === "actors")).toBe(true)
  })

  it("4. emits memory.section_status_changed when closePhaseGate flips to valid", async () => {
    const invoker = new MockInvoker({ "business/analyst": [analystOk] })
    const plan = makePlan("run_4", [{ id: "s1", agent: "business/analyst", phase: "INTAKE", writes: ["project", "actors", "clarifications"] }])
    const engine = new OrchestrationEngine({ store, invoker, recorder, emitter })

    await engine.run(PROJECT, plan)
    const statusEvents = emitter.events.filter((e) => e.type === "memory.section_status_changed")

    expect(statusEvents.length).toBeGreaterThanOrEqual(1)
    expect(statusEvents.some((e) => e.sectionStatus === "valid")).toBe(true)
  })

  it("11. engine still works without an emitter", async () => {
    const invoker = new MockInvoker({ "business/analyst": [analystOk] })
    const plan = makePlan("run_11", [{ id: "s1", agent: "business/analyst", phase: "INTAKE", writes: ["project", "actors", "clarifications"] }])
    const engine = new OrchestrationEngine({ store, invoker, recorder }) // no emitter

    const summary = await engine.run(PROJECT, plan)
    // Must not throw; status is either DONE or FAILED (never crashes).
    expect(["DONE", "FAILED"]).toContain(summary.status)
  })
})
