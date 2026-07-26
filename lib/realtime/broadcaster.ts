/**
 * Liveblocks adapter for the RealtimeEmitter port.
 *
 * Broadcasts pipeline events to all room occupants via broadcastEvent().
 * Best-effort: failures are logged but never thrown — a failed broadcast
 * must not abort or fail a run (guard 8).
 *
 * Size guard: events larger than MAX_EVENT_SIZE_BYTES are dropped silently
 * rather than broadcast (guard 10 — no secrets or large payloads).
 */
import { getLiveblocks } from "@/lib/liveblocks"
import type { PipelineEvent, RealtimeEmitter } from "./types"
import { MAX_EVENT_SIZE_BYTES } from "./types"

export class LiveblocksRealtimeEmitter implements RealtimeEmitter {
  /**
   * @param roomId — the Liveblocks room id, which is the project id (1:1).
   */
  constructor(private readonly roomId: string) {}

  async emit(event: PipelineEvent): Promise<void> {
    // Size guard — refuse to broadcast oversized payloads.
    const size = JSON.stringify(event).length
    if (size > MAX_EVENT_SIZE_BYTES) {
      console.warn(
        `[realtime] Dropping oversized event ${event.type} ` +
        `(seq=${event.sequence}, ${size} bytes > ${MAX_EVENT_SIZE_BYTES} cap)`
      )
      return
    }

    try {
      const lb = getLiveblocks()
      // The RoomEvent union in liveblocks.config.ts mirrors PipelineEvent types
      // exactly; the cast is safe because every PipelineEvent.type has a matching
      // RoomEvent union member with the same required fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await lb.broadcastEvent(this.roomId, event as any)
    } catch (err) {
      // Guard 8: broadcast failure is never fatal.
      console.warn(
        `[realtime] Failed to broadcast ${event.type} ` +
        `(seq=${event.sequence}): ${(err as Error).message ?? String(err)}`
      )
    }
  }
}
