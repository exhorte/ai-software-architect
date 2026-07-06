/**
 * Envelope handling: parse the raw LLM output into the agent envelope,
 * validate it against schemas/envelope.schema.json, and enforce the step's
 * write contract (an agent may narrow its contract, never widen it).
 * Violations feed the retry-with-errors flow (rules/validation.md).
 */
import { ENVELOPE_SCHEMA_ID, getValidator } from "../memory/schemas"
import type { ValidationError, WritableSectionKey } from "../memory/types"
import type { Envelope, PlanStep } from "./types"

/** Strips markdown code fences and surrounding prose around the outermost JSON object. */
function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  const candidate = fenced ? fenced[1].trim() : trimmed

  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) return candidate
  return candidate.slice(start, end + 1)
}

export function parseEnvelope(raw: string): { envelope?: Envelope; errors: ValidationError[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch {
    return {
      errors: [
        {
          level: 1,
          section: "(envelope)",
          path: "/",
          rule: "envelope-parse",
          message: "Output is not a single parseable JSON envelope.",
        },
      ],
    }
  }

  const validate = getValidator(ENVELOPE_SCHEMA_ID)
  if (!validate(parsed)) {
    return {
      errors: (validate.errors ?? []).map((error) => ({
        level: 1,
        section: "(envelope)",
        path: error.instancePath || "/",
        rule: error.keyword,
        message: `envelope${error.instancePath} ${error.message ?? "is invalid"}`,
      })),
    }
  }

  return { envelope: parsed as Envelope, errors: [] }
}

/** The envelope may only write keys inside the step's contract, and must come from the invoked agent. */
export function checkEnvelopeAgainstStep(envelope: Envelope, step: PlanStep): ValidationError[] {
  const errors: ValidationError[] = []

  if (envelope.agent !== step.agent) {
    errors.push({
      level: 1,
      section: "(envelope)",
      path: "/agent",
      rule: "envelope-agent-mismatch",
      message: `Envelope claims agent "${envelope.agent}" but the step invoked "${step.agent}".`,
    })
  }

  const allowed = new Set<string>(step.writes)
  for (const key of Object.keys(envelope.writes)) {
    if (!allowed.has(key)) {
      errors.push({
        level: 1,
        section: key,
        path: `/writes/${key}`,
        rule: "write-contract",
        message: `Section "${key}" is outside this step's write contract [${step.writes.join(", ")}].`,
      })
    }
  }

  return errors
}

/** Narrowed, typed view of the writes once the contract check passed. */
export function envelopeWrites(envelope: Envelope): Partial<Record<WritableSectionKey, unknown>> {
  return envelope.writes as Partial<Record<WritableSectionKey, unknown>>
}
