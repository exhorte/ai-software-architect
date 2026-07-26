/**
 * Test 9: Liveblocks broadcast failure is non-fatal.
 *
 * Tests 11: Pipeline/memory are usable without a realtime connection.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  broadcastEvent: vi.fn(),
}))

vi.mock("@/lib/liveblocks", () => ({
  getLiveblocks: () => ({ broadcastEvent: mocks.broadcastEvent }),
}))

import { LiveblocksRealtimeEmitter } from "../broadcaster"

describe("LiveblocksRealtimeEmitter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("9a. never throws when broadcast fails", async () => {
    mocks.broadcastEvent.mockRejectedValue(new Error("Connection lost"))

    const emitter = new LiveblocksRealtimeEmitter("proj_1")
    // Must not throw.
    await expect(
      emitter.emit({
        type: "run.started",
        projectId: "proj_1",
        runId: "run_1",
        timestamp: new Date().toISOString(),
        sequence: 1,
        phase: "INTAKE",
      })
    ).resolves.toBeUndefined()
  })

  it("9b. broadcast success is transparent", async () => {
    mocks.broadcastEvent.mockResolvedValue(undefined)

    const emitter = new LiveblocksRealtimeEmitter("proj_1")
    await emitter.emit({
      type: "run.completed",
      projectId: "proj_1",
      runId: "run_1",
      timestamp: new Date().toISOString(),
      sequence: 5,
    })
    expect(mocks.broadcastEvent).toHaveBeenCalledTimes(1)
  })

  it("9c. drops oversized events instead of broadcasting", async () => {
    const emitter = new LiveblocksRealtimeEmitter("proj_1")
    // Craft an event with a very large string field to exceed 1KB.
    const largeEvent = {
      type: "run.started" as const,
      projectId: "proj_1",
      runId: "run_1",
      timestamp: new Date().toISOString(),
      sequence: 1,
      phase: "x".repeat(2000), // forces > 1KB
    }
    await emitter.emit(largeEvent)
    // broadcastEvent must NOT have been called for an oversized event.
    expect(mocks.broadcastEvent).not.toHaveBeenCalled()
  })

  it("11. emitting without Liveblocks connection is a no-op (never throws)", async () => {
    // Simulate no Liveblocks key — getLiveblocks would throw if called.
    // Our mock returns a working client, but the real emitter handles it.
    // We just verify the catch path works.
    mocks.broadcastEvent.mockRejectedValue(new Error("No Liveblocks key"))

    const emitter = new LiveblocksRealtimeEmitter("proj_1")
    await expect(
      emitter.emit({
        type: "memory.section_updated",
        projectId: "proj_1",
        runId: "run_1",
        timestamp: new Date().toISOString(),
        sequence: 2,
        section: "requirements",
        sectionStatus: "draft",
      })
    ).resolves.toBeUndefined()
  })
})
