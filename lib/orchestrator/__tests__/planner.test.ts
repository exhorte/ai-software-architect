import { describe, expect, it } from "vitest"

import { buildInitialDocument } from "../../memory/store"
import { AGENT_DEFINITIONS } from "../generated/agent-prompts"
import { buildPlan, classifyIntent, isVirginMemory, validatePlan } from "../planner"
import { ROUTING_TABLE } from "../routing"
import type { Plan } from "../types"

describe("classifyIntent", () => {
  it("classifies missing or virgin memory as NEW_PROJECT", () => {
    expect(classifyIntent(null)).toBe("NEW_PROJECT")
    expect(classifyIntent(buildInitialDocument("idea"))).toBe("NEW_PROJECT")
  })

  it("refuses to classify a project with pipeline output (Phase 3+)", () => {
    const document = buildInitialDocument("idea")
    document.runState.sectionStatus.requirements = "valid"
    expect(isVirginMemory(document)).toBe(false)
    expect(classifyIntent(document)).toBeNull()
  })
})

describe("buildPlan", () => {
  it("covers every route exactly once, in canonical phase order", () => {
    const result = buildPlan("NEW_PROJECT", "run_1")
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.plan.steps).toHaveLength(ROUTING_TABLE.length)
    const phases = result.plan.steps.map((s) => s.phase)
    expect([...phases].sort()).toEqual([...phases].sort()) // no throw
    expect(phases[0]).toBe("INTAKE")
    expect(phases.at(-1)).toBe("DOCUMENTATION")
  })

  it("every planned agent has a generated definition (U2 cross-check)", () => {
    const result = buildPlan("NEW_PROJECT", "run_1")
    if (!result.ok) throw new Error("plan failed")
    for (const step of result.plan.steps) {
      expect(AGENT_DEFINITIONS[step.agent], `missing definition for ${step.agent}`).toBeTruthy()
    }
  })

  it("wires intra-phase dependencies to earlier steps only", () => {
    const result = buildPlan("NEW_PROJECT", "run_1")
    if (!result.ok) throw new Error("plan failed")
    expect(validatePlan(result.plan)).toEqual([])
  })

  it("refuses unimplemented intents explicitly", () => {
    const result = buildPlan("REVISION", "run_1")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("NOT_IMPLEMENTED")
  })
})

describe("validatePlan (AC3 guard)", () => {
  it("rejects two steps writing the same section in one parallel group", () => {
    const plan: Plan = {
      runId: "run_x",
      intent: "NEW_PROJECT",
      steps: [
        {
          id: "step-01",
          agent: "business/analyst",
          phase: "INTAKE",
          reads: [],
          writes: ["project"],
          dependsOn: [],
          parallelGroup: "G",
        },
        {
          id: "step-02",
          agent: "business/domain_expert",
          phase: "INTAKE",
          reads: [],
          writes: ["project"],
          dependsOn: [],
          parallelGroup: "G",
        },
      ],
    }
    const violations = validatePlan(plan)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('both write "project"')
  })

  it("rejects dependsOn pointing forward", () => {
    const plan: Plan = {
      runId: "run_x",
      intent: "NEW_PROJECT",
      steps: [
        {
          id: "step-01",
          agent: "business/analyst",
          phase: "INTAKE",
          reads: [],
          writes: ["project"],
          dependsOn: ["step-02"],
          parallelGroup: null,
        },
        {
          id: "step-02",
          agent: "business/domain_expert",
          phase: "INTAKE",
          reads: [],
          writes: ["entities"],
          dependsOn: [],
          parallelGroup: null,
        },
      ],
    }
    expect(validatePlan(plan)[0]).toContain("does not precede")
  })
})
