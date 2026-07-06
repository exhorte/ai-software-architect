import { task } from "@trigger.dev/sdk/v3"

import { getModelForAgent } from "@/lib/orchestrator/llm"
import type { PlanStep } from "@/lib/orchestrator/types"

export interface AgentRunnerPayload {
  step: PlanStep
  prompt: string
}

/**
 * One agent invocation = one durable child task. Trigger-level retry stays at
 * 1 attempt on purpose: retries are SEMANTIC (validation errors appended to
 * the prompt) and belong to the orchestration engine, not the infrastructure.
 */
export const agentRunner = task({
  id: "agent-runner",
  retry: { maxAttempts: 1 },
  run: async (payload: AgentRunnerPayload) => {
    const model = getModelForAgent(payload.step.agent)
    const raw = await model.generate(payload.prompt)
    return { raw }
  },
})
