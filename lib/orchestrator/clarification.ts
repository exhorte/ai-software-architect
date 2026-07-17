/**
 * Clarification answer handling — pure, Trigger-free logic shared by the V2
 * waitpoint adapter and the V3 answers route. Keeping it here (not in
 * trigger/*) lets the route reason about a submission without importing the
 * Trigger SDK, and keeps a single validation implementation for both sides.
 */
import type { ClarificationAnswer, ClarificationQuestion, ClarificationRunState } from "./engine"

/** What the answers route sends through wait.completeToken(). */
export interface ClarificationResumePayload {
  answers: Array<{ id: string; answer: string }>
}

export interface PayloadValidation {
  answers: ClarificationAnswer[]
  /** Ids rejected, with why — surfaced, never silently dropped. */
  rejected: Array<{ id: string; reason: string }>
}

/** Bounds so a submission cannot be used to push oversized payloads. */
export const MAX_CLARIFICATION_ANSWERS = 20
export const MAX_ANSWER_LENGTH = 4_000

/**
 * Validates a resume payload against the questions actually asked. Answers for
 * unknown ids, duplicates, and non-string/empty answers are rejected; the
 * payload is limited to what this waitpoint expects.
 */
export function validateResumePayload(
  payload: unknown,
  questions: ClarificationQuestion[]
): PayloadValidation {
  const expected = new Set(questions.map((q) => q.id))
  const rejected: Array<{ id: string; reason: string }> = []

  const raw = (payload as ClarificationResumePayload | undefined)?.answers
  if (!Array.isArray(raw)) {
    return {
      answers: [],
      rejected: [{ id: "(payload)", reason: "missing or malformed `answers` array" }],
    }
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
    if (answer.length > MAX_ANSWER_LENGTH) {
      rejected.push({ id, reason: "answer is too long" })
      continue
    }
    seen.add(id)
    answers.push({ id, answer: answer.trim() })
  }

  return { answers, rejected }
}

/** Supports the duration strings Trigger accepts for `timeout` (e.g. "24h"). */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim())
  if (!match) throw new Error(`Unsupported clarification timeout: "${value}" (use e.g. "24h").`)
  const amount = Number(match[1])
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"]
  return amount * unit
}

// ─── Answers submission (V3 route core) ──────────────────────────────────────

/** Minimal waitpoint surface the route needs — injected so the core is pure. */
export interface WaitpointResumeApi {
  retrieveToken(id: string): Promise<{ status: string }>
  completeToken(id: string, data: ClarificationResumePayload): Promise<void>
}

export type SubmissionResult =
  | { ok: true; status: 200; answersAccepted: number }
  | { ok: false; status: 400 | 409 | 410; error: string; rejected?: Array<{ id: string; reason: string }> }

/**
 * Steps 4–11 of the answers contract. Steps 1–3 (auth, project access, load
 * Run) happen in the route. This core NEVER commits answers to memory — it only
 * completes the waitpoint; the resumed engine performs the single canonical
 * commit. It has no store access, so a double commit is structurally impossible.
 */
export async function submitClarificationAnswers(input: {
  runStatus: string
  clarification: ClarificationRunState | null | undefined
  rawPayload: unknown
  waitpoint: WaitpointResumeApi
}): Promise<SubmissionResult> {
  const { runStatus, clarification, rawPayload, waitpoint } = input

  // 4. The run must be suspended on a clarification.
  if (runStatus !== "WAITING_CLARIFICATION") {
    return { ok: false, status: 409, error: "Run is not waiting for clarification." }
  }
  // 5. There must be a pending waitpoint.
  if (!clarification?.tokenId) {
    return { ok: false, status: 409, error: "No pending clarification for this run." }
  }

  // Early size guard, before touching the waitpoint.
  const rawAnswers = (rawPayload as ClarificationResumePayload | undefined)?.answers
  if (Array.isArray(rawAnswers) && rawAnswers.length > MAX_CLARIFICATION_ANSWERS) {
    return { ok: false, status: 400, error: "Too many answers in one submission." }
  }

  // 6–7. Refuse if the token is no longer open — distinguishing expired from consumed.
  const token = await waitpoint.retrieveToken(clarification.tokenId)
  if (token.status === "TIMED_OUT") {
    return { ok: false, status: 410, error: "This clarification has expired." }
  }
  if (token.status === "COMPLETED") {
    return { ok: false, status: 409, error: "This clarification has already been answered." }
  }
  if (token.status !== "WAITING") {
    return { ok: false, status: 409, error: `Clarification is no longer open (${token.status}).` }
  }

  // 8–9. Validate against the questions actually asked.
  const questions: ClarificationQuestion[] = clarification.questionIds.map((id) => ({
    id,
    question: "",
    why: "",
  }))
  const { answers, rejected } = validateResumePayload(rawPayload, questions)

  if (rejected.length > 0) {
    return { ok: false, status: 400, error: "Some answers were rejected.", rejected }
  }
  if (answers.length === 0) {
    return { ok: false, status: 400, error: "No answers provided." }
  }

  // 10. Complete the waitpoint — the engine resumes and commits.
  await waitpoint.completeToken(clarification.tokenId, { answers })

  // 11. Unambiguous success.
  return { ok: true, status: 200, answersAccepted: answers.length }
}
