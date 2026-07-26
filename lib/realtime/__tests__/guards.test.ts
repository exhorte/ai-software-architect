/**
 * Tests for pipeline event guards (tests 5-7).
 *
 * Pure functions — no React, no Liveblocks, no mocks.
 */
import { describe, expect, it } from "vitest"
import { validatePipelineEvent } from "../guards"

describe("validatePipelineEvent (guards 1-4)", () => {
  const projectId = "proj_1"
  const runId = "run_1"

  function makeEvent(overrides: Record<string, unknown> = {}) {
    return {
      type: "run.status_changed",
      projectId: "proj_1",
      runId: "run_1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      ...overrides,
    }
  }

  it("5. rejects event from a different project", () => {
    const result = validatePipelineEvent(
      makeEvent({ projectId: "proj_other" }),
      projectId,
      runId,
      new Set(),
      0,
      ""
    )
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe("wrong-project")
  })

  it("6. rejects duplicate sequence number", () => {
    const seen = new Set([1, 2, 3])
    const result = validatePipelineEvent(
      makeEvent({ sequence: 2 }),
      projectId,
      runId,
      seen,
      3,
      ""
    )
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe("duplicate")
  })

  it("7a. rejects event with sequence <= lastKnown", () => {
    const result = validatePipelineEvent(
      makeEvent({ sequence: 3 }),
      projectId,
      runId,
      new Set(),
      5, // lastSequence = 5, event has seq 3
      ""
    )
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe("out-of-order")
  })

  it("7b. rejects event with timestamp older than last known", () => {
    const result = validatePipelineEvent(
      makeEvent({
        sequence: 6,
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      projectId,
      runId,
      new Set(),
      5,
      "2026-07-01T00:00:00.000Z" // last timestamp is months later
    )
    expect(result.accepted).toBe(false)
    expect(result.reason).toBe("future-sequence")
  })

  it("7c. accepts event with timestamp within clock skew", () => {
    const ts = "2026-07-01T00:00:00.100Z"
    const result = validatePipelineEvent(
      makeEvent({ sequence: 6, timestamp: ts }),
      projectId,
      runId,
      new Set(),
      5,
      "2026-07-01T00:00:01.000Z" // 900ms older — within 1s slack
    )
    expect(result.accepted).toBe(true)
  })

  it("accepts valid event", () => {
    const result = validatePipelineEvent(
      makeEvent({ sequence: 1 }),
      projectId,
      runId,
      new Set(),
      0,
      ""
    )
    expect(result.accepted).toBe(true)
  })

  it("ignores ai-status events (existing taxonomy)", () => {
    const result = validatePipelineEvent(
      makeEvent({ type: "ai-status" }),
      projectId,
      runId,
      new Set(),
      0,
      ""
    )
    expect(result.accepted).toBe(false)
  })
})
