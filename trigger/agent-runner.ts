import { task, metadata, logger } from "@trigger.dev/sdk/v3"

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
 *
 * The provider is chosen by the LLM seam (LLM_PROVIDER); this task never names
 * a provider. Whichever one answered is recorded in the run metadata.
 */
export const agentRunner = task({
  id: "agent-runner",
  retry: { maxAttempts: 1 },
  run: async (payload: AgentRunnerPayload) => {
    const model = getModelForAgent(payload.step.agent)
    const { value: raw, used, fallback } = await model.generateDetailed(payload.prompt)

    metadata.set("llm", { provider: used.provider, model: used.modelId })
    if (fallback) {
      metadata.set("llmFallback", fallback)
      logger.warn("LLM provider fallback", fallback)
    }

    return { raw }
  },
})
