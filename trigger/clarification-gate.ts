/**
 * Trigger.dev adapter for the engine's ClarificationGate port.
 *
 * The engine knows nothing about Trigger.dev; this file is the only place that
 * turns "ask the user and wait" into a waitpoint. It carries no business logic:
 * deciding *whether* to ask, what to do with unanswered questions, and how to
 * commit answers all stay in lib/orchestrator/engine.ts.
 *
 * Trigger.dev v4 primitives used (verified against @trigger.dev/sdk 4.5.3):
 * - wait.createToken({ idempotencyKey, timeout, tags }) -> { id, isCached, url }
 * - wait.forToken<T>(id) -> { ok: true, output: T } | { ok: false, error }
 *   suspends the run at a checkpoint — no compute is billed while waiting.
 * - wait.completeToken(id, payload) — used by the V3 answers route, not here.
 */
import { wait, WaitpointTimeoutError } from "@trigger.dev/sdk/v3"

import type {
  ClarificationAnswer,
  ClarificationGate,
  ClarificationQuestion,
  ClarificationRunState,
  RunRecorder,
} from "@/lib/orchestrator/engine"

/** How long a user has to answer before the questions become assumptions. */
export const CLARIFICATION_TIMEOUT = "24h"

/** What the V3 answers route sends through wait.completeToken(). */
export interface ClarificationResumePayload {
  answers: Array<{ id: string; answer: string }>
}

/** Minimal slice of the Trigger waitpoint API — injected so the adapter is unit-testable. */
export interface WaitpointApi {
  createToken(options: {
    idempotencyKey: string
    idempotencyKeyTTL?: string
    timeout: string
    tags: string[]
  }): Promise<{ id: string; isCached: boolean; url: string }>
  forToken<T>(
    id: string
  ): Promise<{ ok: true; output: T } | { ok: false; error: Error }>
}

const realWaitpointApi: WaitpointApi = {
  createToken: (options) => wait.createToken(options),
  forToken: <T>(id: string) => wait.forToken<T>(id) as Promise<
    { ok: true; output: T } | { ok: false; error: Error }
  >,
}

export interface PayloadValidation {
  answers: ClarificationAnswer[]
  /** Ids that were rejected, with why — surfaced to the caller, never silently dropped. */
  rejected: Array<{ id: string; reason: string }>
}

/**
 * Validates a resume payload against the questions actually asked. Pure.
 * Answers for unknown ids, or that are not non-empty strings, are rejected —
 * the payload is limited to what this waitpoint expects.
 */
export function validateResumePayload(
  payload: unknown,
  questions: ClarificationQuestion[]
): PayloadValidation {
  const expected = new Set(questions.map((q) => q.id))
  const rejected: Array<{ id: string; reason: string }> = []

  const raw = (payload as ClarificationResumePayload | undefined)?.answers
  if (!Array.isArray(raw)) {
    return { answers: [], rejected: [{ id: "(payload)", reason: "missing or malformed `answers` array" }] }
  }

  const answers: ClarificationAnswer[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    const id = (item as { id?: unknown })?.id
    const answer = (item as { answer?: unknown })?.answer

    if (typeof id !== "string" || !expected.has(id)) {
      rejected.push({ id: typeof id === "string" ? id : "(no id)", reason: "unknown question id" })
      continue
    }
    if (seen.has(id)) {
      rejected.push({ id, reason: "duplicate answer" })
      continue
    }
    if (typeof answer !== "string" || answer.trim() === "") {
      rejected.push({ id, reason: "answer must be a non-empty string" })
      continue
    }
    seen.add(id)
    answers.push({ id, answer: answer.trim() })
  }

  return { answers, rejected }
}

export interface TriggerClarificationGateDeps {
  projectId: string
  runId: string
  recorder: RunRecorder
  /** Defaults to the real Trigger.dev waitpoint API. */
  waitpoint?: WaitpointApi
  timeout?: string
  now?: () => Date
}

/**
 * Suspends the run on a waitpoint until the user answers (or the token times
 * out). One token per run: the idempotency key makes a retried run re-attach to
 * the same waitpoint instead of asking twice, and `isCached` tells us when that
 * happened.
 */
export class TriggerClarificationGate implements ClarificationGate {
  private readonly waitpoint: WaitpointApi
  private readonly timeout: string
  private readonly now: () => Date

  constructor(private readonly deps: TriggerClarificationGateDeps) {
    this.waitpoint = deps.waitpoint ?? realWaitpointApi
    this.timeout = deps.timeout ?? CLARIFICATION_TIMEOUT
    this.now = deps.now ?? (() => new Date())
  }

  async requestAnswers(request: {
    projectId: string
    runId: string
    questions: ClarificationQuestion[]
  }): Promise<ClarificationAnswer[]> {
    const { recorder } = this.deps
    if (request.questions.length === 0) return []

    // One waitpoint per run: a retried run re-attaches instead of re-asking.
    const token = await this.waitpoint.createToken({
      idempotencyKey: `clarification:${request.runId}`,
      timeout: this.timeout,
      tags: [`project:${request.projectId}`, `run:${request.runId}`],
    })

    const suspendedAt = this.now()
    const state: ClarificationRunState = {
      tokenId: token.id,
      questionIds: request.questions.map((q) => q.id),
      questionCount: request.questions.length,
      expiresAt: new Date(suspendedAt.getTime() + parseDuration(this.timeout)).toISOString(),
      suspendedAt: suspendedAt.toISOString(),
    }
    await recorder.update({ status: "WAITING_CLARIFICATION", clarification: state })

    // Suspends here. No compute is consumed until the token completes or expires.
    const result = await this.waitpoint.forToken<ClarificationResumePayload>(token.id)

    if (!result.ok) {
      // A timeout is a business outcome: nobody answered, so the engine turns
      // the questions into assumptions. Any other failure is technical and must
      // surface as a failure — never be laundered into a business assumption.
      if (isTimeout(result.error)) {
        await recorder.update({
          status: "RESUMING",
          clarification: { ...state, resumedAt: this.now().toISOString() },
        })
        return []
      }
      throw result.error
    }

    await recorder.update({
      status: "RESUMING",
      clarification: { ...state, resumedAt: this.now().toISOString() },
    })

    const { answers } = validateResumePayload(result.output, request.questions)
    return answers
  }
}

function isTimeout(error: Error): boolean {
  return error instanceof WaitpointTimeoutError || /timeout|timed out/i.test(error.message ?? "")
}

/** Supports the duration strings Trigger accepts for `timeout` (e.g. "24h", "30m"). */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim())
  if (!match) throw new Error(`Unsupported clarification timeout: "${value}" (use e.g. "24h").`)
  const amount = Number(match[1])
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"]
  return amount * unit
}
