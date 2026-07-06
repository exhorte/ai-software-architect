import { describe, expect, it } from "vitest"

import { checkEnvelopeAgainstStep, parseEnvelope } from "../envelope"
import type { PlanStep } from "../types"

const step: PlanStep = {
  id: "step-01",
  agent: "business/analyst",
  phase: "INTAKE",
  reads: ["project"],
  writes: ["project", "actors", "clarifications"],
  dependsOn: [],
  parallelGroup: null,
}

const validEnvelope = {
  agent: "business/analyst",
  version: 1,
  status: "ok",
  writes: { actors: [] },
}

describe("parseEnvelope", () => {
  it("parses a bare JSON envelope", () => {
    const { envelope, errors } = parseEnvelope(JSON.stringify(validEnvelope))
    expect(errors).toEqual([])
    expect(envelope?.agent).toBe("business/analyst")
  })

  it("parses an envelope wrapped in a markdown fence with prose around it", () => {
    const raw = `Here is my output:\n\`\`\`json\n${JSON.stringify(validEnvelope)}\n\`\`\`\nDone.`
    const { envelope, errors } = parseEnvelope(raw)
    expect(errors).toEqual([])
    expect(envelope?.status).toBe("ok")
  })

  it("rejects non-JSON output with a parse error", () => {
    const { envelope, errors } = parseEnvelope("I could not produce JSON, sorry.")
    expect(envelope).toBeUndefined()
    expect(errors[0].rule).toBe("envelope-parse")
  })

  it("rejects a schema-invalid envelope (bad status, missing writes)", () => {
    const { errors } = parseEnvelope(
      JSON.stringify({ agent: "business/analyst", version: 1, status: "maybe" })
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.section === "(envelope)")).toBe(true)
  })
})

describe("checkEnvelopeAgainstStep", () => {
  it("accepts writes within the contract from the invoked agent", () => {
    const { envelope } = parseEnvelope(JSON.stringify(validEnvelope))
    expect(checkEnvelopeAgainstStep(envelope!, step)).toEqual([])
  })

  it("rejects writes outside the step contract (never widen)", () => {
    const { envelope } = parseEnvelope(
      JSON.stringify({ ...validEnvelope, writes: { requirements: [] } })
    )
    const errors = checkEnvelopeAgainstStep(envelope!, step)
    expect(errors[0].rule).toBe("write-contract")
  })

  it("rejects an envelope claiming another agent", () => {
    const { envelope } = parseEnvelope(
      JSON.stringify({ ...validEnvelope, agent: "business/requirements" })
    )
    const errors = checkEnvelopeAgainstStep(envelope!, step)
    expect(errors[0].rule).toBe("envelope-agent-mismatch")
  })
})
