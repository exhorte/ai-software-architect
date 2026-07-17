import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  ClarificationQuestion,
  ClarificationRunState,
  RunRecorder,
} from "@/lib/orchestrator/engine"

import type { ClarificationResumePayload } from "@/lib/orchestrator/clarification"

import { TriggerClarificationGate, type WaitpointApi } from "../clarification-gate"

const QUESTIONS: ClarificationQuestion[] = [
  { id: "CLR-001", question: "Multiple warehouses?", why: "Inventory model", suggestedDefault: "Single" },
  { id: "CLR-002", question: "Guest checkout?", why: "Auth model", suggestedDefault: null },
]

type Update = Parameters<RunRecorder["update"]>[0]

class MockRecorder implements RunRecorder {
  updates: Update[] = []
  async update(fields: Update): Promise<void> {
    this.updates.push(structuredClone(fields))
  }
  get statuses(): string[] {
    return this.updates.map((u) => u.status).filter(Boolean) as string[]
  }
  get lastClarification(): ClarificationRunState | null | undefined {
    return [...this.updates].reverse().find((u) => u.clarification !== undefined)?.clarification
  }
}

/** Scriptable stand-in for the Trigger waitpoint API. */
function mockWaitpoint(
  behaviour: {
    resolve?: ClarificationResumePayload
    fail?: Error
    isCached?: boolean
  } = {}
): WaitpointApi & { created: unknown[]; waited: string[] } {
  const created: unknown[] = []
  const waited: string[] = []
  return {
    created,
    waited,
    async createToken(options) {
      created.push(options)
      return { id: "waitpoint_123", isCached: behaviour.isCached ?? false, url: "https://x" }
    },
    async forToken<T>(id: string) {
      waited.push(id)
      if (behaviour.fail) return { ok: false as const, error: behaviour.fail }
      return { ok: true as const, output: (behaviour.resolve ?? { answers: [] }) as T }
    },
  }
}

function gateWith(waitpoint: WaitpointApi, recorder: RunRecorder) {
  return new TriggerClarificationGate({
    projectId: "proj_1",
    runId: "run_1",
    recorder,
    waitpoint,
    timeout: "24h",
    now: () => new Date("2026-07-17T12:00:00.000Z"),
  })
}

describe("TriggerClarificationGate", () => {
  let recorder: MockRecorder

  beforeEach(() => {
    recorder = new MockRecorder()
  })

  it("creates a waitpoint for a blocking clarification, scoped to run + project", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [{ id: "CLR-001", answer: "Multiple" }] } })
    await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })

    expect(wp.created).toHaveLength(1)
    expect(wp.created[0]).toMatchObject({
      idempotencyKey: "clarification:run_1", // one token per run
      timeout: "24h",
      tags: ["project:proj_1", "run:run_1"],
    })
    expect(wp.waited).toEqual(["waitpoint_123"])
  })

  it("persists WAITING_CLARIFICATION with the token, question ids and expiry", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [] } })
    await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })

    const waiting = recorder.updates.find((u) => u.status === "WAITING_CLARIFICATION")
    expect(waiting?.clarification).toMatchObject({
      tokenId: "waitpoint_123",
      questionIds: ["CLR-001", "CLR-002"],
      questionCount: 2,
      suspendedAt: "2026-07-17T12:00:00.000Z",
      expiresAt: "2026-07-18T12:00:00.000Z", // suspendedAt + 24h
    })
  })

  it("transitions WAITING_CLARIFICATION -> RESUMING and returns valid answers", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [{ id: "CLR-001", answer: "Multiple" }] } })
    const answers = await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })

    expect(answers).toEqual([{ id: "CLR-001", answer: "Multiple" }])
    expect(recorder.statuses).toEqual(["WAITING_CLARIFICATION", "RESUMING"])
    expect(recorder.lastClarification?.resumedAt).toBe("2026-07-17T12:00:00.000Z")
  })

  it("drops an unknown answer id instead of feeding it to the engine", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [{ id: "CLR-404", answer: "x" }] } })
    const answers = await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })
    expect(answers).toEqual([])
  })

  it("returns no answers on an empty payload (engine turns them into assumptions)", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [] } })
    const answers = await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })
    expect(answers).toEqual([])
    expect(recorder.statuses).toContain("RESUMING")
  })

  it("treats an expired token as 'nobody answered', not as a failure", async () => {
    const timeout = new Error("Waitpoint timed out")
    const wp = mockWaitpoint({ fail: timeout })
    const answers = await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })

    expect(answers).toEqual([]) // -> engine records assumptions
    expect(recorder.statuses).toEqual(["WAITING_CLARIFICATION", "RESUMING"])
  })

  it("never launders a technical Trigger error into a business assumption", async () => {
    const wp = mockWaitpoint({ fail: new Error("upstream 503 while resolving waitpoint") })
    await expect(
      gateWith(wp, recorder).requestAnswers({
        projectId: "proj_1",
        runId: "run_1",
        questions: QUESTIONS,
      })
    ).rejects.toThrow(/upstream 503/)
    // The run must not be reported as resumed.
    expect(recorder.statuses).toEqual(["WAITING_CLARIFICATION"])
  })

  it("is idempotent: a retried run re-attaches to the same waitpoint", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [] }, isCached: true })
    const gate = gateWith(wp, recorder)

    await gate.requestAnswers({ projectId: "proj_1", runId: "run_1", questions: QUESTIONS })
    await gate.requestAnswers({ projectId: "proj_1", runId: "run_1", questions: QUESTIONS })

    // Same idempotency key both times -> Trigger returns the cached token.
    expect(wp.created.map((c) => (c as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "clarification:run_1",
      "clarification:run_1",
    ])
    expect(wp.waited).toEqual(["waitpoint_123", "waitpoint_123"])
  })

  it("does not create a waitpoint when there is nothing to ask", async () => {
    const wp = mockWaitpoint()
    const answers = await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: [],
    })
    expect(answers).toEqual([])
    expect(wp.created).toHaveLength(0)
    expect(recorder.updates).toHaveLength(0)
  })

  it("suspends exactly once per request — the wait is the only blocking call", async () => {
    const wp = mockWaitpoint({ resolve: { answers: [] } })
    const spy = vi.spyOn(wp, "forToken")
    await gateWith(wp, recorder).requestAnswers({
      projectId: "proj_1",
      runId: "run_1",
      questions: QUESTIONS,
    })
    // No polling loop: a single forToken call = the run is checkpointed, not spinning.
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
