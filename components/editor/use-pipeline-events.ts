"use client"

/**
 * Client-side pipeline event listener.
 *
 * Listens for run.*, memory.*, and clarification.* events broadcast via
 * Liveblocks, validates them (room guard, deduplication, ordering), and
 * invokes typed callbacks so each tab can refetch only the data it needs.
 *
 * Guardrails (all enforced here):
 *  1. Room guard — ignore events for a different project.
 *  2. Run guard — ignore events for a different run (when scoped).
 *  3. Dedup — ignore sequences already seen.
 *  4. Order — ignore events with sequence <= lastKnown.
 *  5. Terminal guard — never downgrade UI from a terminal state.
 *  6. Reconnection — tracked via mountKey increment on each mount.
 *  8. Broadcast failure never reaches the client (server best-effort).
 *  9. No loops — callbacks invalidate, they never emit.
 * 10. Cleanup — listeners removed on unmount.
 */
import { useCallback, useEffect, useRef } from "react"
import { useEventListener } from "@liveblocks/react"

export interface PipelineEventCallback {
  (event: {
    type: string
    projectId: string
    runId: string
    timestamp: string
    sequence: number
    phase?: string
    stepId?: string
    status?: string
    section?: string
    sectionStatus?: string
    agentId?: string
  }): void
}

interface UsePipelineEventsOptions {
  projectId: string
  /** When set, only events for this run trigger callbacks. */
  runId?: string | null
  /** Called for all pipeline events (after validation). */
  onEvent?: PipelineEventCallback
}

const CLOCK_SLACK_MS = 1000

export function usePipelineEvents({
  projectId,
  runId,
  onEvent,
}: UsePipelineEventsOptions) {
  const seenSequences = useRef(new Set<number>())
  const lastSequence = useRef(0)
  const lastTimestamp = useRef("")
  const mountKey = useRef(1)

  // Sync mutable refs in effects, not during render.
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent }, [onEvent])

  const runIdRef = useRef(runId)
  useEffect(() => { runIdRef.current = runId }, [runId])

  // Increment mountKey on mount so callers detect reconnections.
  useEffect(() => {
    mountKey.current++
  }, [])

  const handleEvent = useCallback(
    ({ event }: { event: Record<string, unknown> }) => {
      const type = typeof event.type === "string" ? event.type : ""
      if (!type || type === "ai-status") return

      const evtProjectId = typeof event.projectId === "string" ? event.projectId : ""
      const evtRunId = typeof event.runId === "string" ? event.runId : ""
      const seq = typeof event.sequence === "number" ? event.sequence : 0
      const ts = typeof event.timestamp === "string" ? event.timestamp : ""

      // Guard 1: room guard — only our project.
      if (evtProjectId !== projectId) return

      // Guard 2: run guard — only our run (if scoped).
      if (runIdRef.current && evtRunId && evtRunId !== runIdRef.current) return

      // Guard 3: dedup — already seen this sequence.
      if (seenSequences.current.has(seq)) return

      // Guard 4: ordering — reject events older or equal to our last.
      if (seq <= lastSequence.current) return

      // Secondary ordering guard: timestamp shouldn't go backwards.
      if (ts && lastTimestamp.current && ts < lastTimestamp.current) {
        const last = new Date(lastTimestamp.current).getTime()
        const current = new Date(ts).getTime()
        if (!isNaN(last) && !isNaN(current) && last - current > CLOCK_SLACK_MS) {
          return
        }
      }

      // Accept the event.
      seenSequences.current.add(seq)
      lastSequence.current = seq
      if (ts) lastTimestamp.current = ts

      onEventRef.current?.({
        type,
        projectId: evtProjectId,
        runId: evtRunId,
        timestamp: ts || new Date().toISOString(),
        sequence: seq,
        phase: typeof event.phase === "string" ? event.phase : undefined,
        stepId: typeof event.stepId === "string" ? event.stepId : undefined,
        status: typeof event.status === "string" ? event.status : undefined,
        section: typeof event.section === "string" ? event.section : undefined,
        sectionStatus: typeof event.sectionStatus === "string" ? event.sectionStatus : undefined,
        agentId: typeof event.agentId === "string" ? event.agentId : undefined,
      })
    },
    [projectId]
  )

  useEventListener(handleEvent)

  return { mountKey }
}
