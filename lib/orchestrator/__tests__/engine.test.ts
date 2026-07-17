import { beforeEach, describe, expect, it } from "vitest"

import { InMemoryPersistence } from "../../memory/memory-adapter"
import { MemoryStore } from "../../memory/store"
import {
  OrchestrationEngine,
  type AgentInvoker,
  type ClarificationAnswer,
  type ClarificationGate,
  type ClarificationQuestion,
  type RunRecorder,
} from "../engine"
import { buildPlan } from "../planner"
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

/**
 * Mock invoker: per-agent FIFO of canned raw outputs; records every prompt.
 * A response of the form "__THROW__:message" makes the invocation throw, to
 * simulate a network / LLM API failure.
 */
class MockInvoker implements AgentInvoker {
  prompts: Array<{ agent: string; prompt: string }> = []
  constructor(private readonly responses: Record<string, string[]>) {}

  async invoke(step: PlanStep, prompt: string): Promise<string> {
    this.prompts.push({ agent: step.agent, prompt })
    const queue = this.responses[step.agent]
    if (!queue || queue.length === 0) throw new Error(`No canned response left for ${step.agent}`)
    const next = queue.shift() as string
    if (next.startsWith("__THROW__")) {
      throw new Error(next.slice("__THROW__:".length) || "invocation failed")
    }
    return next
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

/** Stands in for the human: answers whatever it is asked, from a fixed script. */
class MockClarificationGate implements ClarificationGate {
  asked: ClarificationQuestion[][] = []
  constructor(private readonly answerFor: (q: ClarificationQuestion) => string | undefined) {}

  async requestAnswers(req: { questions: ClarificationQuestion[] }): Promise<ClarificationAnswer[]> {
    this.asked.push(req.questions)
    return req.questions
      .map((q) => ({ id: q.id, answer: this.answerFor(q) ?? "" }))
      .filter((a) => a.answer !== "")
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

  describe("agent invocation errors never abort the run", () => {
    const THROW = "__THROW__:AI_APICallError: Failed to process successful response"

    it("blocks the step (not the run) when an agent's LLM call keeps failing", async () => {
      const invoker = new MockInvoker({
        // analyst throws on both the call and its transient retry.
        "business/analyst": [THROW, THROW],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, plan)

      // The run finished instead of throwing; the analyst section is blocked.
      const analyst = summary.stepResults.find((r) => r.agent === "business/analyst")
      expect(analyst?.outcome).toBe("blocked")
      expect(analyst?.errors?.[0].rule).toBe("agent-invocation-error")
      expect(summary.blockages.some((b) => b.section === "project")).toBe(true)
      const document = await store.getMemory(PROJECT)
      expect(document?.runState.sectionStatus.project).toBe("blocked")
    })

    it("recovers when the transient retry succeeds", async () => {
      const invoker = new MockInvoker({
        // first call throws, retry succeeds.
        "business/analyst": [THROW, analystEnvelope],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, plan)

      const analyst = summary.stepResults.find((r) => r.agent === "business/analyst")
      expect(analyst?.outcome).toBe("committed")
      expect(summary.status).toBe("DONE")
    })

    it("a batch failure degrades to per-step: one throwing agent blocks only its section", async () => {
      // REQUIREMENTS parallel group A: domain_expert throws, requirements is fine.
      const plthan = buildPlan("NEW_PROJECT", "run_batch")
      if (!plthan.ok) throw new Error("plan failed")

      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/domain_expert": [THROW, THROW, THROW, THROW],
        "business/requirements": [requirementsEnvelope, requirementsEnvelope],
        "business/user_story": [
          JSON.stringify({
            agent: "business/user_story",
            version: 1,
            status: "ok",
            writes: {
              userStories: [
                {
                  id: "US-001",
                  epic: "EPIC-01",
                  story: "As a Seller, I want to publish, so buyers find it.",
                  actor: "ACT-Seller",
                  requirements: ["REQ-F-001"],
                  scenarios: [{ name: "ok", given: "a", when: "b", then: "c" }],
                  points: 3,
                },
              ],
            },
          }),
        ],
      })
      // Stop the run after REQUIREMENTS by only allowing the business phases.
      const businessPlan = { ...plthan.plan, steps: plthan.plan.steps.filter((s) => ["INTAKE", "CLARIFICATION", "REQUIREMENTS"].includes(s.phase)) }
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, businessPlan)

      // The run did not abort; domain_expert is blocked, requirements committed.
      const de = summary.stepResults.find((r) => r.agent === "business/domain_expert")
      const req = summary.stepResults.find((r) => r.agent === "business/requirements")
      expect(de?.outcome).toBe("blocked")
      expect(req?.outcome).toBe("committed")
    })
  })

  describe("consistency gate (AC3)", () => {
    /** Plan whose REQUIREMENTS phase also writes user stories. */
    const planWithStories: Plan = {
      ...plan,
      steps: [
        ...plan.steps,
        {
          id: "step-04",
          agent: "business/user_story",
          phase: "REQUIREMENTS",
          reads: ["requirements", "actors"],
          writes: ["userStories"],
          dependsOn: ["step-03"],
          parallelGroup: null,
        },
      ],
    }

    const storyFor = (reqIds: string[]) =>
      JSON.stringify({
        agent: "business/user_story",
        version: 1,
        status: "ok",
        writes: {
          userStories: [
            {
              id: "US-001",
              epic: "EPIC-01",
              story: "As a Seller, I want to publish a plant listing, so that buyers find it.",
              actor: "ACT-Seller",
              requirements: reqIds,
              scenarios: [
                { name: "Happy path", given: "a draft", when: "publishing", then: "it is listed" },
              ],
              points: 3,
            },
          ],
        },
      })

    it("a coherent run produces no finding and no corrective re-run", async () => {
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
        "business/user_story": [storyFor(["REQ-F-001"])],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, planWithStories)

      expect(summary.blockages).toEqual([])
      expect(invoker.prompts.filter((p) => p.agent === "business/user_story")).toHaveLength(1)
    })

    it("routes a seeded CON-02 violation back to its owning agent, which fixes it", async () => {
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
        // First answer references a requirement that does not exist, then fixes it.
        "business/user_story": [storyFor(["REQ-F-404"]), storyFor(["REQ-F-001"])],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, planWithStories)

      const storyPrompts = invoker.prompts.filter((p) => p.agent === "business/user_story")
      expect(storyPrompts).toHaveLength(2) // one corrective re-run
      // The finding was handed to the agent verbatim.
      expect(storyPrompts[1].prompt).toContain("CON-02")
      expect(storyPrompts[1].prompt).toContain("REQ-F-404")
      // Fixed on the retry -> nothing survives.
      expect(summary.blockages).toEqual([])
    })

    it("reports a finding the agent could not fix", async () => {
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
        // Both attempts keep the dangling reference.
        "business/user_story": [storyFor(["REQ-F-404"]), storyFor(["REQ-F-404"])],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, planWithStories)

      expect(summary.blockages.some((b) => b.reason.includes("CON-02"))).toBe(true)
      // CON-01 too: the must requirement ends up covered by nothing valid.
      expect(summary.blockages.some((b) => b.reason.includes("CON-01"))).toBe(true)
    })

    it("does not enforce rules for agents the plan never scheduled", async () => {
      // `plan` has no user_story step: an uncovered must requirement is not this run's business.
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, plan)

      expect(summary.blockages).toEqual([])
    })
  })

  describe("clarification loop", () => {
    /** Analyst output whose single clarification is blocking and unanswered. */
    function analystWithBlockingQuestion(): string {
      const env = JSON.parse(analystEnvelope)
      env.writes.clarifications[0].blocking = true
      return JSON.stringify(env)
    }

    const clarificationIntegrated = JSON.stringify({
      agent: "business/analyst",
      version: 1,
      status: "ok",
      writes: {
        clarifications: [
          {
            id: "CLR-001",
            question: "Multiple warehouses per seller?",
            why: "Impacts the inventory model.",
            blocking: true,
            suggestedDefault: "Single warehouse",
            answer: "Single warehouse",
          },
        ],
      },
    })

    it("asks the user, commits the answer, then lets the analyst integrate it", async () => {
      const gate = new MockClarificationGate(() => "Multiple warehouses")
      const invoker = new MockInvoker({
        "business/analyst": [analystWithBlockingQuestion(), clarificationIntegrated],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder, clarificationGate: gate })

      const summary = await engine.run(PROJECT, plan)

      expect(summary.status).toBe("DONE")
      // The gate was asked exactly the blocking question.
      expect(gate.asked).toHaveLength(1)
      expect(gate.asked[0].map((q) => q.id)).toEqual(["CLR-001"])
      expect(gate.asked[0][0].suggestedDefault).toBe("Single warehouse")
      // Analyst invoked twice: INTAKE + CLARIFICATION.
      expect(invoker.prompts.filter((p) => p.agent === "business/analyst")).toHaveLength(2)
      // The run reported that it was waiting on a human.
      expect(recorder.updates.some((u) => u.status === "WAITING_CLARIFICATION")).toBe(true)
    })

    it("skips the phase when nothing blocking is pending", async () => {
      // The canned analyst clarification is non-blocking.
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
      })
      const gate = new MockClarificationGate(() => "never asked")
      const engine = new OrchestrationEngine({ store, invoker, recorder, clarificationGate: gate })

      await engine.run(PROJECT, plan)

      expect(gate.asked).toHaveLength(0)
      expect(invoker.prompts.filter((p) => p.agent === "business/analyst")).toHaveLength(1)
    })

    it("turns an unanswered question into a recorded assumption", async () => {
      // Non-blocking question, never asked -> must not vanish.
      const invoker = new MockInvoker({
        "business/analyst": [analystEnvelope],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      await engine.run(PROJECT, plan)

      const document = await store.getMemory(PROJECT)
      const assumptions = (document?.project as { assumptions?: Array<Record<string, unknown>> })
        ?.assumptions
      expect(assumptions).toHaveLength(1)
      expect(assumptions?.[0]).toMatchObject({
        source: "unansweredClarification",
        fromClarification: "CLR-001",
      })
      expect(String(assumptions?.[0].statement)).toContain("Single warehouse")
    })

    it("without a gate, a blocking question cannot pause the run — it becomes an assumption", async () => {
      const invoker = new MockInvoker({
        "business/analyst": [analystWithBlockingQuestion()],
        "business/requirements": [requirementsEnvelope],
      })
      const engine = new OrchestrationEngine({ store, invoker, recorder })

      const summary = await engine.run(PROJECT, plan)

      expect(summary.status).toBe("DONE")
      expect(invoker.prompts.filter((p) => p.agent === "business/analyst")).toHaveLength(1)
      const document = await store.getMemory(PROJECT)
      const assumptions = (document?.project as { assumptions?: unknown[] })?.assumptions
      expect(assumptions).toHaveLength(1)
    })
  })
})
