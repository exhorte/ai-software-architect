import { describe, expect, it } from "vitest"

import { generatePromptsModule } from "../../../scripts/build-agent-prompts"
import { AGENT_DEFINITIONS, TRANSVERSAL_PROMPTS } from "../generated/agent-prompts"
import { assemblePrompt } from "../prompt"
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

describe("generated agent prompts (AC5)", () => {
  it("contains all 18 agent definitions", () => {
    expect(Object.keys(AGENT_DEFINITIONS)).toHaveLength(18)
    expect(AGENT_DEFINITIONS["business/analyst"]).toContain("Agent: Business Analyst")
    expect(AGENT_DEFINITIONS["documentation/exporter"]).toContain("Agent: Exporter")
  })

  it("mirrors the source .md files — the definitions ARE the runtime prompts", () => {
    // The generated content quotes the agent file verbatim: a change to the
    // .md file changes the runtime prompt with no code change (after regen).
    expect(AGENT_DEFINITIONS["business/analyst"]).toContain("Max 5 questions per round")
    expect(TRANSVERSAL_PROMPTS.responseRules).toContain("exactly one envelope")
  })

  it("the generator is deterministic (same inputs, byte-identical module)", () => {
    expect(generatePromptsModule()).toBe(generatePromptsModule())
  })
})

describe("assemblePrompt (AC4)", () => {
  const slice = { project: { name: "Test", description: "idea" } }

  it("is deterministic for identical inputs", () => {
    expect(assemblePrompt(step, slice)).toBe(assemblePrompt(step, slice))
  })

  it("contains exactly the four layers, in order", () => {
    const prompt = assemblePrompt(step, slice)
    const layers = [
      "=== LAYER 1 — AGENT DEFINITION ===",
      "=== LAYER 2 — TRANSVERSAL RULES ===",
      "=== LAYER 3 — MEMORY SLICE",
      "=== LAYER 4 — STEP INSTRUCTION ===",
    ]
    let cursor = -1
    for (const layer of layers) {
      const index = prompt.indexOf(layer)
      expect(index, `${layer} missing or out of order`).toBeGreaterThan(cursor)
      cursor = index
    }
  })

  it("injects only the provided memory slice and the step contract", () => {
    const prompt = assemblePrompt(step, slice)
    expect(prompt).toContain('"name": "Test"')
    expect(prompt).toContain('[project, actors, clarifications]')
  })

  it("appends retry errors verbatim on the second attempt", () => {
    const errors = [
      { level: 1 as const, section: "actors", path: "/actors/0", rule: "required", message: "goals missing" },
    ]
    const prompt = assemblePrompt(step, slice, errors)
    expect(prompt).toContain("previous output was rejected")
    expect(prompt).toContain("goals missing")
  })

  it("adds coding rules only for code-producing agents", () => {
    const backendStep: PlanStep = { ...step, agent: "engineering/backend_architect", writes: ["engineering.backend"] }
    expect(assemblePrompt(backendStep, {})).toContain("Coding Rules")
    expect(assemblePrompt(step, slice)).not.toContain("=== LAYER 2 — TRANSVERSAL RULES ===\n# Coding Rules")
  })
})
