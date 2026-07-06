/**
 * Prompt assembler — builds the four-layer agent prompt defined in
 * .claude/context/memory/session_context.md § Plane 2:
 *   1. agent definition   2. transversal rules   3. memory slice   4. step instruction
 * Nothing else ever enters an agent prompt. Deterministic: same inputs,
 * byte-identical prompt (AC4).
 */
import type { ValidationError } from "../memory/types"
import { AGENT_DEFINITIONS, TRANSVERSAL_PROMPTS } from "./generated/agent-prompts"
import type { PlanStep } from "./types"

/** Agents whose blueprints embed code snippets get the coding rules layer. */
const CODE_PRODUCING_AGENTS = new Set([
  "engineering/backend_architect",
  "engineering/frontend_architect",
])

export function assemblePrompt(
  step: PlanStep,
  memorySlice: Record<string, unknown>,
  retryErrors?: ValidationError[]
): string {
  const definition = AGENT_DEFINITIONS[step.agent]
  if (!definition) {
    throw new Error(`No agent definition found for "${step.agent}" — regenerate agent prompts.`)
  }

  const transversal: string[] = [
    TRANSVERSAL_PROMPTS.responseRules,
    TRANSVERSAL_PROMPTS.outputFormats,
  ]
  if (CODE_PRODUCING_AGENTS.has(step.agent)) {
    transversal.push(TRANSVERSAL_PROMPTS.codingRules)
  }

  const sections = [
    "=== LAYER 1 — AGENT DEFINITION ===",
    definition.trim(),
    "",
    "=== LAYER 2 — TRANSVERSAL RULES ===",
    transversal.map((t) => t.trim()).join("\n\n---\n\n"),
    "",
    "=== LAYER 3 — MEMORY SLICE (your declared reads, JSON) ===",
    JSON.stringify(memorySlice, null, 2),
    "",
    "=== LAYER 4 — STEP INSTRUCTION ===",
    `You are invoked as ${step.id} in phase ${step.phase}.`,
    `Produce exactly one JSON envelope (schema: envelope.schema.json) and nothing else.`,
    `Your "agent" field must be "${step.agent}". You may only write these sections: [${step.writes.join(", ")}].`,
  ]

  if (retryErrors && retryErrors.length > 0) {
    sections.push(
      "",
      "Your previous output was rejected. Fix EXACTLY these violations and change nothing else (response_rules.md rule 13):",
      JSON.stringify(retryErrors, null, 2)
    )
  }

  return sections.join("\n")
}
