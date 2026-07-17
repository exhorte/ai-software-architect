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
import {
  parseDuration,
  validateResumePayload,
  type ClarificationResumePayload,
} from "@/lib/orchestrator/clarification"

/** How long a user has to answer before the questions become assumptions. */
export const CLARIFICATION_TIMEOUT = "24h"

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
