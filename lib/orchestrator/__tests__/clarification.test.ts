import { describe, expect, it, vi } from "vitest"

import type { ClarificationQuestion, ClarificationRunState } from "../engine"
import {
  parseDuration,
  submitClarificationAnswers,
  validateResumePayload,
  type WaitpointResumeApi,
} from "../clarification"

const QUESTIONS: ClarificationQuestion[] = [
  { id: "CLR-001", question: "Multiple warehouses?", why: "Inventory", suggestedDefault: "Single" },
  { id: "CLR-002", question: "Guest checkout?", why: "Auth", suggestedDefault: null },
]

describe("validateResumePayload", () => {
  it("accepts and trims well-formed answers", () => {
    expect(validateResumePayload({ answers: [{ id: "CLR-001", answer: "  Multiple  " }] }, QUESTIONS)).toEqual({
      answers: [{ id: "CLR-001", answer: "Multiple" }],
      rejected: [],
    })
  })

  it("rejects unknown ids, duplicates, empty and non-string answers", () => {
    expect(validateResumePayload({ answers: [{ id: "CLR-999", answer: "x" }] }, QUESTIONS).rejected[0].reason).toMatch(/unknown/)
    expect(
      validateResumePayload({ answers: [{ id: "CLR-001", answer: "a" }, { id: "CLR-001", answer: "b" }] }, QUESTIONS).rejected[0].reason
    ).toMatch(/duplicate/)
    expect(validateResumePayload({ answers: [{ id: "CLR-001", answer: "" }] }, QUESTIONS).rejected[0].reason).toMatch(/non-empty/)
    expect(validateResumePayload({ answers: [{ id: "CLR-001", answer: 42 }] }, QUESTIONS).rejected[0].reason).toMatch(/non-empty/)
  })

  it("rejects a missing/malformed answers array and an over-long answer", () => {
    expect(validateResumePayload({}, QUESTIONS).rejected[0].reason).toMatch(/missing or malformed/)
    expect(validateResumePayload({ answers: [{ id: "CLR-001", answer: "x".repeat(5000) }] }, QUESTIONS).rejected[0].reason).toMatch(/too long/)
  })

  it("keeps good answers and reports the bad ones together", () => {
    const { answers, rejected } = validateResumePayload(
      { answers: [{ id: "CLR-001", answer: "ok" }, { id: "CLR-404", answer: "no" }] },
      QUESTIONS
    )
    expect(answers).toEqual([{ id: "CLR-001", answer: "ok" }])
    expect(rejected).toHaveLength(1)
  })
})

describe("parseDuration", () => {
  it("parses supported units", () => {
    expect(parseDuration("24h")).toBe(86_400_000)
    expect(parseDuration("30m")).toBe(1_800_000)
  })
  it("refuses unsupported formats", () => {
    expect(() => parseDuration("later")).toThrow(/Unsupported/)
  })
})

describe("submitClarificationAnswers", () => {
  const waiting: ClarificationRunState = {
    tokenId: "waitpoint_1",
    questionIds: ["CLR-001", "CLR-002"],
    questionCount: 2,
    expiresAt: "2026-07-18T12:00:00.000Z",
    suspendedAt: "2026-07-17T12:00:00.000Z",
  }

  function waitpoint(tokenStatus: string): WaitpointResumeApi & { completed: unknown[] } {
    const completed: unknown[] = []
    return {
      completed,
      retrieveToken: async () => ({ status: tokenStatus }),
      completeToken: async (_id, data) => {
        completed.push(data)
      },
    }
  }

  it("completes the waitpoint on valid answers (200) and never commits itself", async () => {
    const wp = waitpoint("WAITING")
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: [{ id: "CLR-001", answer: "Multiple" }] },
      waitpoint: wp,
    })
    expect(result).toEqual({ ok: true, status: 200, answersAccepted: 1 })
    // The route/core only completes the token — the engine commits later.
    expect(wp.completed).toEqual([{ answers: [{ id: "CLR-001", answer: "Multiple" }] }])
  })

  it("409 when the run is not suspended", async () => {
    const result = await submitClarificationAnswers({
      runStatus: "RUNNING",
      clarification: waiting,
      rawPayload: { answers: [{ id: "CLR-001", answer: "x" }] },
      waitpoint: waitpoint("WAITING"),
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
  })

  it("409 when there is no pending token", async () => {
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: null,
      rawPayload: { answers: [{ id: "CLR-001", answer: "x" }] },
      waitpoint: waitpoint("WAITING"),
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
  })

  it("410 when the token has expired", async () => {
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: [{ id: "CLR-001", answer: "x" }] },
      waitpoint: waitpoint("TIMED_OUT"),
    })
    expect(result).toMatchObject({ ok: false, status: 410 })
  })

  it("409 (distinct from expired) when the token was already consumed", async () => {
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: [{ id: "CLR-001", answer: "x" }] },
      waitpoint: waitpoint("COMPLETED"),
    })
    expect(result).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/already been answered/) })
  })

  it("400 with reasons on unknown answer ids", async () => {
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: [{ id: "CLR-404", answer: "x" }] },
      waitpoint: waitpoint("WAITING"),
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
    if (!result.ok) expect(result.rejected?.[0].reason).toMatch(/unknown/)
  })

  it("400 on an empty submission", async () => {
    const wp = waitpoint("WAITING")
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: [] },
      waitpoint: wp,
    })
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(wp.completed).toHaveLength(0) // never completed on invalid input
  })

  it("400 when too many answers are submitted at once", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `CLR-${i}`, answer: "x" }))
    const result = await submitClarificationAnswers({
      runStatus: "WAITING_CLARIFICATION",
      clarification: waiting,
      rawPayload: { answers: many },
      waitpoint: waitpoint("WAITING"),
    })
    expect(result).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/Too many/) })
  })

  it("lets a technical waitpoint error propagate (route maps it to 500)", async () => {
    const wp: WaitpointResumeApi = {
      retrieveToken: async () => {
        throw new Error("upstream 503")
      },
      completeToken: vi.fn(),
    }
    await expect(
      submitClarificationAnswers({
        runStatus: "WAITING_CLARIFICATION",
        clarification: waiting,
        rawPayload: { answers: [{ id: "CLR-001", answer: "x" }] },
        waitpoint: wp,
      })
    ).rejects.toThrow(/upstream 503/)
    expect(wp.completeToken).not.toHaveBeenCalled()
  })
})
