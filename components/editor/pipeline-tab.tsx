"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Play, Loader2, ChevronRight, CheckCircle2, AlertCircle, Clock, Send, XCircle } from "lucide-react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClarificationQuestion {
  id: string
  question: string
  why: string
  suggestedDefault?: string | null
}

interface RunState {
  phase: string
  stepId: string | null
  status: string
  plan: PlanData | null
  clarification: ClarificationState | null
  blockages: Array<{ section: string; reason: string }> | null
  createdAt: string
}

interface PlanData {
  intent: string
  steps: PlanStepData[]
}

interface PlanStepData {
  id: string
  agent: string
  phase: string
  writes: string[]
}

/** Subset of clarification JSON the UI needs — embeds question texts for a
 *  single round-trip (memory stays the source of truth; this is the UI cache). */
interface ClarificationState {
  questionIds: string[]
  questions: ClarificationQuestion[]
  questionCount: number
  expiresAt: string
  suspendedAt: string
  resumedAt?: string
}

const TERMINAL_STATUSES = new Set([
  "DONE", "FAILED",
])

// Trigger task terminal statuses (the task itself, not our pipeline)
const TRIGGER_TERMINAL = new Set([
  "COMPLETED", "FAILED", "CANCELED", "CRASHED", "TIMED_OUT",
  "INTERRUPTED", "SYSTEM_FAILURE", "EXPIRED",
])

const PHASES_IN_ORDER = ["INTAKE", "CLARIFICATION", "REQUIREMENTS"]

const STARTER_IDEAS = [
  "A marketplace for renting camping gear peer-to-peer",
  "A SaaS platform for restaurant inventory management",
  "A mobile app for tracking personal carbon footprint",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Unique phases from the plan, preserving canonical order. */
function orderedPhases(plan: PlanData | null): string[] {
  if (!plan?.steps?.length) return PHASES_IN_ORDER
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const phase of PHASES_IN_ORDER) {
    if (plan.steps.some((s) => s.phase === phase) && !seen.has(phase)) {
      seen.add(phase)
      ordered.push(phase)
    }
  }
  return ordered.length > 0 ? ordered : PHASES_IN_ORDER
}

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    INTAKE: "Intake",
    CLARIFICATION: "Clarification",
    REQUIREMENTS: "Requirements",
  }
  return map[phase] ?? phase
}

function statusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case "RUNNING":
      return { label: "Running", color: "text-blue-400 bg-blue-500/10" }
    case "WAITING_CLARIFICATION":
      return { label: "Needs Input", color: "text-amber-400 bg-amber-500/10" }
    case "RESUMING":
      return { label: "Resuming", color: "text-blue-400 bg-blue-500/10" }
    case "DONE":
      return { label: "Complete", color: "text-emerald-400 bg-emerald-500/10" }
    case "FAILED":
      return { label: "Failed", color: "text-red-400 bg-red-500/10" }
    default:
      return { label: status, color: "text-text-muted bg-bg-subtle" }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PipelineTabProps {
  projectId: string
  roomId: string
}

export function PipelineTab({ projectId }: PipelineTabProps) {
  // Launch state
  const [idea, setIdea] = useState("")
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Run tracking
  const [runId, setRunId] = useState<string | null>(null)
  const [publicToken, setPublicToken] = useState<string | null>(null)

  // Clarification state (fetched when WAITING_CLARIFICATION)
  const [runState, setRunState] = useState<RunState | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fetchedRunIdRef = useRef<string | null>(null)

  // ── Realtime run tracking ───────────────────────────────────────────────

  const { run: liveRun } = useRealtimeRun(
    runId ?? "",
    { accessToken: publicToken ?? "", enabled: !!runId && !!publicToken }
  )

  const pipelineStatus = (liveRun?.metadata as Record<string, unknown> | undefined)?.status as string | undefined ?? null
  const triggerStatus = liveRun?.status ?? null
  const isTerminal =
    (pipelineStatus ? TERMINAL_STATUSES.has(pipelineStatus) : false) ||
    (triggerStatus ? TRIGGER_TERMINAL.has(triggerStatus) : false)
  const isDone = pipelineStatus === "DONE"
  const isFailed = pipelineStatus === "FAILED" || triggerStatus === "FAILED"
  const hasActiveRun = !!(runId && !isTerminal)

  // ── Fetch run state when WAITING_CLARIFICATION ──────────────────────────

  useEffect(() => {
    if (!runId || pipelineStatus !== "WAITING_CLARIFICATION") return
    if (fetchedRunIdRef.current === runId) return // already fetched for this run
    fetchedRunIdRef.current = runId

    fetch(`/api/ai/run/state?runId=${encodeURIComponent(runId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RunState | null) => {
        if (data) {
          setRunState(data)
          // Pre-fill defaults
          const defaults: Record<string, string> = {}
          for (const q of data.clarification?.questions ?? []) {
            if (q.suggestedDefault) defaults[q.id] = q.suggestedDefault
          }
          setAnswers(defaults)
        }
      })
      .catch(() => {})
  }, [runId, pipelineStatus])

  // Reset when a new run starts
  useEffect(() => {
    if (!runId) fetchedRunIdRef.current = null
  }, [runId])

  // ── Launch ──────────────────────────────────────────────────────────────

  const handleLaunch = useCallback(async () => {
    const trimmed = idea.trim()
    if (!trimmed || isLaunching) return

    setIsLaunching(true)
    setError(null)
    setRunState(null)
    setAnswers({})
    setSubmitFeedback(null)

    try {
      // 1. Launch the pipeline
      const launchRes = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, idea: trimmed }),
      })
      if (!launchRes.ok) {
        const body = await launchRes.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? "Launch failed")
      }
      const { runId: newRunId } = (await launchRes.json()) as { runId: string }

      // 2. Get a realtime token
      const tokenRes = await fetch("/api/ai/run/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: newRunId }),
      })
      if (!tokenRes.ok) throw new Error("Token request failed")
      const { token } = (await tokenRes.json()) as { token: string }

      setRunId(newRunId)
      setPublicToken(token)
      setIdea("")
      if (textareaRef.current) textareaRef.current.style.height = "72px"
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch pipeline")
    } finally {
      setIsLaunching(false)
    }
  }, [idea, isLaunching, projectId])

  // ── Submit answers ──────────────────────────────────────────────────────

  const handleSubmitAnswers = useCallback(async () => {
    if (!runId || isSubmitting) return

    const answered = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([id, answer]) => ({ id, answer: answer.trim() }))

    if (answered.length === 0) {
      setSubmitFeedback("Answer at least one question.")
      return
    }

    setIsSubmitting(true)
    setSubmitFeedback(null)

    try {
      const res = await fetch("/api/ai/run/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, answers: answered }),
      })
      const body = (await res.json()) as { error?: string; status?: string }
      if (!res.ok) {
        throw new Error(body.error ?? "Submission failed")
      }
      setSubmitFeedback("Answers submitted — resuming pipeline…")
    } catch (err) {
      setSubmitFeedback(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [runId, answers, isSubmitting])

  // ── Helpers ─────────────────────────────────────────────────────────────

  const handleIdeaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setIdea(e.target.value)
    const ta = e.target
    ta.style.height = "72px"
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleLaunch()
      }
    },
    [handleLaunch]
  )

  const handleChip = useCallback((chip: string) => {
    setIdea(chip)
    if (textareaRef.current) {
      textareaRef.current.style.height = "72px"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
      textareaRef.current.focus()
    }
  }, [])

  const setAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  const phases = orderedPhases(runState?.plan ?? null)
  const currentPhase = runState?.phase ?? (liveRun?.metadata as Record<string, unknown> | undefined)?.phase as string | undefined
  const badge = statusBadge(pipelineStatus ?? (runId ? "RUNNING" : "IDLE"))
  const showClarification =
    pipelineStatus === "WAITING_CLARIFICATION" && !!(runState?.clarification?.questions?.length)
  const blockages = runState?.blockages ?? []

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 pt-3 pb-2">
          {/* ── Launch form (idle) ─────────────────────────────────── */}
          {!runId && (
            <>
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-ai/15">
                  <Play className="h-6 w-6 text-accent-ai-text" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Pipeline</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Describe your project idea and the AI factory will produce requirements,
                    user stories, and more.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {STARTER_IDEAS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChip(chip)}
                    className="w-full rounded-full bg-bg-subtle px-4 py-2 text-left text-xs text-accent-ai-text transition-colors hover:bg-border-default"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Active run: phase stepper ─────────────────────────── */}
          {runId && (
            <>
              {/* Status header */}
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badge.color)}>
                  {badge.label}
                </span>
                {hasActiveRun && (
                  <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
                )}
              </div>

              {/* Phase stepper */}
              <div className="flex items-center gap-1.5">
                {phases.map((phase, i) => {
                  const phaseIdx = phases.indexOf(currentPhase ?? "")
                  const isCurrent = phase === currentPhase
                  const isPast = i < phaseIdx || (isTerminal && i <= phases.length - 1)
                  const isFuture = i > phaseIdx

                  return (
                    <div key={phase} className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
                          isCurrent && "bg-accent-ai/15 text-accent-ai-text",
                          isPast && !isCurrent && "bg-emerald-500/10 text-emerald-400",
                          isFuture && "bg-bg-subtle text-text-faint"
                        )}
                      >
                        {isPast && !isCurrent ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : isCurrent ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {phaseLabel(phase)}
                      </div>
                      {i < phases.length - 1 && (
                        <ChevronRight className="h-3 w-3 text-text-faint" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Clarification questions ──────────────────────── */}
              {showClarification && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <p className="text-xs font-medium text-amber-300">
                      Clarification Needed
                    </p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-text-muted">
                    The pipeline needs your input on these questions. Unanswered
                    questions will be treated as assumptions.
                  </p>

                  {runState!.clarification!.questions.map((q) => (
                    <div key={q.id} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-text-primary">
                        {q.question}
                      </label>
                      <p className="text-[10px] text-text-faint">{q.why}</p>
                      <input
                        type="text"
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.suggestedDefault ?? "Your answer…"}
                        disabled={isSubmitting}
                        className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-xs text-text-primary placeholder:text-text-faint focus:border-accent-ai/50 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  ))}

                  {submitFeedback && (
                    <p
                      className={cn(
                        "text-[11px]",
                        submitFeedback.includes("resuming") || submitFeedback.includes("submitted")
                          ? "text-emerald-400"
                          : "text-red-400"
                      )}
                    >
                      {submitFeedback}
                    </p>
                  )}

                  <Button
                    onClick={handleSubmitAnswers}
                    disabled={isSubmitting}
                    className="h-8 w-full gap-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-500/80 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    {isSubmitting ? "Submitting…" : "Submit Answers"}
                  </Button>
                </div>
              )}

              {/* ── Done / Failed summary ────────────────────────── */}
              {isDone && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <p className="text-sm font-medium text-text-primary">
                    Pipeline Complete
                  </p>
                  <p className="text-xs text-text-muted">
                    Requirements, user stories, and business rules are ready.
                    Switch to the Memory tab to review them.
                  </p>
                </div>
              )}

              {isFailed && (
                <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-400" />
                    <p className="text-sm font-medium text-red-300">Pipeline Failed</p>
                  </div>
                  {blockages.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {blockages.map((b, i) => (
                        <div
                          key={i}
                          className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
                        >
                          <span className="font-medium">{b.section}</span>: {b.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── New run button (terminal states) ─────────────── */}
              {isTerminal && (
                <Button
                  onClick={() => {
                    setRunId(null)
                    setPublicToken(null)
                    setRunState(null)
                    setAnswers({})
                    setSubmitFeedback(null)
                    setError(null)
                  }}
                  variant="outline"
                  className="h-8 w-full gap-1.5 rounded-lg border-border-subtle text-xs text-text-secondary hover:border-border-default hover:text-text-primary"
                >
                  <Play className="h-3 w-3" />
                  New Pipeline Run
                </Button>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-3 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* ── Input area ─────────────────────────────────────────────────── */}
      {!runId && (
        <div className="shrink-0 border-t border-border-default p-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-bg-elevated p-3">
            <Textarea
              ref={textareaRef}
              value={idea}
              onChange={handleIdeaChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe your project idea…"
              disabled={isLaunching}
              style={{ height: "72px", maxHeight: "160px" }}
              className="resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm text-text-primary shadow-none placeholder:text-text-faint focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-faint">Shift+Enter for newline</span>
              <Button
                size="sm"
                onClick={handleLaunch}
                disabled={!idea.trim() || isLaunching}
                className="h-7 gap-1.5 rounded-lg px-3 text-xs text-white hover:opacity-90 disabled:opacity-40"
                style={
                  !isLaunching && idea.trim()
                    ? { backgroundColor: "#62C073" }
                    : undefined
                }
              >
                {isLaunching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {isLaunching ? "Launching…" : "Launch"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
