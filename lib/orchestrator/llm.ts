/**
 * LLM seam (decision: provider abstraction ready for Phase 6 multi-LLM).
 * The engine and agent-runner depend on AgentModel only; the registry maps
 * agents to providers — configuration, not code, changes providers later.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"

export interface AgentModel {
  generate(prompt: string): Promise<string>
}

export class GeminiModel implements AgentModel {
  constructor(private readonly modelId: string = process.env.GEMINI_MODEL ?? "gemini-flash-latest") {}

  async generate(prompt: string): Promise<string> {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
    const result = await generateText({ model: google(this.modelId), prompt })
    return result.text
  }
}

/** Per-agent overrides (Phase 6 track T2 fills this from configuration). */
const MODEL_OVERRIDES = new Map<string, () => AgentModel>()

export function getModelForAgent(agentId: string): AgentModel {
  const override = MODEL_OVERRIDES.get(agentId)
  return override ? override() : new GeminiModel()
}
