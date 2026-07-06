import { beforeEach, describe, expect, it } from "vitest"

import { InMemoryPersistence } from "../../memory/memory-adapter"
import { MemoryStore } from "../../memory/store"
import { OrchestrationEngine, type AgentInvoker, type RunRecorder } from "../engine"
import type { Plan, PlanStep } from "../types"

const PROJECT = "proj_engine"

/** Reduced NEW_PROJECT plan: INTAKE + CLARIFICATION + REQUIREMENTS (stub scope of Phase 2). */
const plan: Plan = {
  runId: "run_engine",
  intent: "NEW_PROJECT",
  steps: [
    {
      id: "step-01",
      agent: "business/analyst",
      phase: "INTAKE",
      reads: ["project"],
      writes: ["project", "actors", "clarifications"],
      dependsOn: [],
      parallelGroup: null,
    },
    {
      id: "step-02",
      agent: "business/analyst",
      phase: "CLARIFICATION",
      reads: ["clarifications"],
      writes: ["clarifications", "project"],
      dependsOn: [],
      parallelGroup: null,
    },
    {
      id: "step-03",
      agent: "business/requirements",
      phase: "REQUIREMENTS",
      reads: ["project", "actors"],
      writes: ["requirements"],
      dependsOn: [],
      parallelGroup: null,
    },
  ],
}

const analystEnvelope = JSON.stringify({
  agent: "business/analyst",
  version: 1,
  status: "ok",
  writes: {
    project: {
      name: "Plant Marketplace",
      description: "A marketplace for plants",
      goals: [{ id: "GOAL-01", statement: "Let sellers sell plants online" }],
      scope: { in: ["catalog"], out: ["billing"] },
    },
    actors: [
      { id: "ACT-Seller", name: "Seller", kind: "human", role: "primary", goals: ["Sell plants"] },
    ],
    clarifications: [
      {
        id: "CLR-001",
        question: "Multiple warehouses per seller?",
        why: "Impacts the inventory model.",
        blocking: false,
        suggestedDefault: "Single warehouse",
        answer: null,
      },
    ],
  },
})

const requirementsEnvelope = JSON.stringify({
  agent: "business/requirements",
  version: 1,
  status: "ok",
  writes: {
    requirements: [
      {
        id: "REQ-F-001",
        kind: "functional",
        title: "Seller publishes a plant listing",
        priority: "must",
        acceptanceCriteria: ["A published listing is visible in the catalog."],
      },
    ],
  },
})

/** Mock invoker: per-agent FIFO of canned raw outputs; records every prompt. */
class MockInvoker implements AgentInvoker {
  prompts: Array<{ agent: string; prompt: string }> = []
  constructor(private readonly responses: Record<string, string[]>) {}

  async invoke(step: PlanStep, prompt: string): Promise<string> {
    this.prompts.push({ agent: step.agent, prompt })
    const queue = this.responses[step.agent]
    if (!queue || queue.length === 0) throw new Error(`No canned response left for ${step.agent}`)
    return queue.shift() as string
  }

  async invokeGroup(calls: Array<{ step: PlanStep; prompt: string }>): Promise<string[]> {
    return Promise.all(calls.map((call) => this.invoke(call.step, call.prompt)))
  }
}

class MockRecorder implements RunRecorder {
  updates: Array<Record<string, unknown>> = []
  async update(fields: Record<string, unknown>): Promise<void> {
    this.updates.push(fields)
  }
}

describe("OrchestrationEngine", () => {
  let store: MemoryStore
  let recorder: MockRecorder

  beforeEach(async () => {
    store = new MemoryStore(new InMemoryPersistence())
    recorder = new MockRecorder()
    await store.initMemory(PROJECT, "A marketplace for plants")
  })

  it("AC1 — traverses INTAKE→DONE, committing through the memory layer", async () => {
    const invoker = new MockInvoker({
      "business/analyst": [analystEnvelope],
      "business/requirements": [requirementsEnvelope],
    })
    const engine = new OrchestrationEngine({ store, invoker, recorder })

    const summary = await engine.run(PROJECT, plan)

    expect(summary.status).toBe("DONE")
    expect(summary.blockages).toEqual([])
    expect(summary.stepResults.map((r) => r.outcome)).toEqual(["committed", "committed"])

    const document = await store.getMemory(PROJECT)
    expect(document?.runState.phase).toBe("DONE")
    expect(document?.runState.sectionStatus).toMatchObject({
      project: "valid",
      actors: "valid",
      clarifications: "valid",
      requirements: "valid",
    })
    expect(document?.requirements).toHaveLength(1)

    // CLARIFICATION was skipped: no blocking unanswered questions.
    expect(invoker.prompts.filter((p) => p.agent === "business/analyst")).toHaveLength(1)
    // Recorder followed the run to completion.
    expect(recorder.updates.at(-1)).toMatchObject({ status: "DONE" })
  })

  it("AC2 — one retry with the validation errors appended, then success", async () => {
    const invalidRequirements = JSON.stringify({
      agent: "business/requirements",
      version: 1,
      status: "ok",
      writes: { requirements: [{ id: "REQ-BAD", title: "no kind, bad id" }] },
    })
    const invoker = new MockInvoker({
      "business/analyst": [analystEnvelope],
      "business/requirements": [invalidRequirements, requirementsEnvelope],
    })
    const engine = new OrchestrationEngine({ store, invoker, recorder })

    const summary = await engine.run(PROJECT, plan)

    const reqResult = summary.stepResults.find((r) => r.agent === "business/requirements")
    expect(reqResult?.outcome).toBe("committed")
    expect(reqResult?.attempts).toBe(2)

    const retryPrompt = invoker.prompts.filter((p) => p.agent === "business/requirements")[1]
    expect(retryPrompt.prompt).toContain("previous output was rejected")
    expect(retryPrompt.prompt).toContain('must match pattern \\"^REQ-[FNS]-[0-9]{3,}$\\"')
    expect(retryPrompt.prompt).toContain("/requirements/0")
  })

  it("AC2 — a second failure blocks the sections and the run continues", async () => {
    const garbage = "not json at all"
    const invoker = new MockInvoker({
      "business/analyst": [analystEnvelope],
      "business/requirements": [garbage, garbage],
    })
    const engine = new OrchestrationEngine({ store, invoker, recorder })

    const summary = await engine.run(PROJECT, plan)

    expect(summary.status).toBe("DONE") // analyst committed; the run did not abort
    const reqResult = summary.stepResults.find((r) => r.agent === "business/requirements")
    expect(reqResult?.outcome).toBe("blocked")
    expect(reqResult?.attempts).toBe(2)
    expect(summary.blockages.map((b) => b.section)).toContain("requirements")

    const document = await store.getMemory(PROJECT)
    expect(document?.runState.sectionStatus.requirements).toBe("blocked")
    expect(document?.runState.phase).toBe("DONE")
  })

  it("runs CLARIFICATION when a blocking question is unanswered", async () => {
    const withBlocking = JSON.parse(analystEnvelope)
    withBlocking.writes.clarifications[0].blocking = true
    const clarificationAnswered = JSON.stringify({
      agent: "business/analyst",
      version: 1,
      status: "ok",
      writes: {
        clarifications: [{ ...withBlocking.writes.clarifications[0], answer: "Single warehouse" }],
      },
    })

    const invoker = new MockInvoker({
      "business/analyst": [JSON.stringify(withBlocking), clarificationAnswered],
      "business/requirements": [requirementsEnvelope],
    })
    const engine = new OrchestrationEngine({ store, invoker, recorder })

    const summary = await engine.run(PROJECT, plan)

    expect(summary.status).toBe("DONE")
    // Analyst invoked twice: INTAKE + CLARIFICATION.
    expect(invoker.prompts.filter((p) => p.agent === "business/analyst")).toHaveLength(2)
  })
})
