/**
 * LLM seam — the single place that decides which provider/model runs a prompt.
 *
 * Selection is explicit configuration, never inference: `LLM_PROVIDER` picks the
 * provider ("gemini" by default, so existing setups keep working untouched).
 * Callers (agent-runner, design-agent, generate-spec) ask this module for a
 * model; they never know which provider they got.
 *
 * A provider fallback exists only for transient capacity errors (overload,
 * quota, temporary unavailability). It never fires on validation, prompt or
 * contract errors, and it is always reported to the caller so it can be logged
 * and recorded in run metadata — never a silent switch.
 *
 * Phase 6 (multi-LLM) generalizes this; this file stays deliberately small.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, type LanguageModel } from "ai"

export type ProviderId = "gemini" | "deepseek"

export const SUPPORTED_PROVIDERS: readonly ProviderId[] = ["gemini", "deepseek"]

/** Which model a call site wants: the default one, or the spec-generation one. */
export type ModelPurpose = "default" | "spec"

export interface ResolvedModel {
  provider: ProviderId
  /** Model id actually used — safe to log and to store in run metadata. */
  modelId: string
  model: LanguageModel
}

export interface ResolveOptions {
  purpose?: ModelPurpose
}

const DEFAULT_PROVIDER: ProviderId = "gemini"
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest"
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro"
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"

/** Reads LLM_PROVIDER. Unknown values fail loudly rather than falling back. */
export function selectedProvider(): ProviderId {
  const raw = (process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase()
  if ((SUPPORTED_PROVIDERS as readonly string[]).includes(raw)) return raw as ProviderId
  throw new Error(
    `LLM_PROVIDER="${raw}" is not supported. Expected one of: ${SUPPORTED_PROVIDERS.join(", ")}.`
  )
}

function buildGemini(purpose: ModelPurpose): ResolvedModel {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    throw new Error(
      'LLM provider "gemini" is selected but GOOGLE_AI_API_KEY is not set. ' +
        "Set the key, or select another provider with LLM_PROVIDER."
    )
  }
  const modelId =
    (purpose === "spec" ? process.env.GEMINI_SPEC_MODEL : undefined) ??
    process.env.GEMINI_MODEL ??
    DEFAULT_GEMINI_MODEL
  const google = createGoogleGenerativeAI({ apiKey })
  return { provider: "gemini", modelId, model: google(modelId) }
}

function buildDeepSeek(purpose: ModelPurpose): ResolvedModel {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error(
      'LLM provider "deepseek" is selected but DEEPSEEK_API_KEY is not set. ' +
        "Set the key, or select another provider with LLM_PROVIDER."
    )
  }
  const modelId =
    (purpose === "spec" ? process.env.DEEPSEEK_SPEC_MODEL : undefined) ??
    process.env.DEEPSEEK_MODEL ??
    DEFAULT_DEEPSEEK_MODEL
  // DeepSeek exposes an OpenAI-compatible API; baseURL stays configurable.
  const deepseek = createOpenAICompatible({
    name: "deepseek",
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
  })
  return { provider: "deepseek", modelId, model: deepseek(modelId) }
}

function buildProvider(provider: ProviderId, purpose: ModelPurpose): ResolvedModel {
  return provider === "deepseek" ? buildDeepSeek(purpose) : buildGemini(purpose)
}

/** The model for the configured provider. Throws if its key is missing. */
export function resolveLanguageModel(opts: ResolveOptions = {}): ResolvedModel {
  return buildProvider(selectedProvider(), opts.purpose ?? "default")
}

/** HTTP statuses that mean "try again / try elsewhere", not "your request is wrong". */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const TRANSIENT_MESSAGE =
  /high demand|overload|capacity|quota|rate.?limit|too many requests|temporarily|unavailable|timeout|timed out|try again/i

/**
 * True only for provider-side capacity problems. Client errors (400 invalid
 * request, 401/403 auth, 404 unknown model) and every non-provider failure —
 * schema validation, envelope contract, prompt errors — return false so they
 * surface instead of being masked by a second provider.
 */
export function isTransientProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const err = error as { statusCode?: number; status?: number; message?: unknown }
  const status = err.statusCode ?? err.status
  if (typeof status === "number") {
    if (TRANSIENT_STATUS.has(status)) return true
    if (status >= 400 && status < 500) return false // config/contract problem — never fallback
  }
  const message = typeof err.message === "string" ? err.message : ""
  return TRANSIENT_MESSAGE.test(message)
}

export interface FallbackInfo {
  from: ProviderId
  to: ProviderId
  reason: string
  /** JSON-serializable: it is written verbatim to Trigger.dev run metadata. */
  [key: string]: string
}

export interface RunWithProviderResult<T> {
  value: T
  /** The provider/model that actually produced the value. */
  used: ResolvedModel
  /** Set only when the primary provider was skipped after a transient error. */
  fallback?: FallbackInfo
}

/**
 * Runs `call` on the configured provider. On a transient provider error — and
 * only then — retries once on the other supported provider, if that one is
 * configured. The result always reports which provider produced it.
 */
export async function runWithProvider<T>(
  call: (model: ResolvedModel) => Promise<T>,
  opts: ResolveOptions = {}
): Promise<RunWithProviderResult<T>> {
  const purpose = opts.purpose ?? "default"
  const primary = resolveLanguageModel(opts)

  try {
    return { value: await call(primary), used: primary }
  } catch (error) {
    if (!isTransientProviderError(error)) throw error

    const otherId = SUPPORTED_PROVIDERS.find((p) => p !== primary.provider)
    if (!otherId) throw error

    let secondary: ResolvedModel
    try {
      secondary = buildProvider(otherId, purpose)
    } catch {
      // The other provider is not configured — surface the original failure.
      throw error
    }

    const reason = (error as { message?: string }).message?.split("\n")[0]?.slice(0, 160) ?? "transient error"
    return {
      value: await call(secondary),
      used: secondary,
      fallback: { from: primary.provider, to: otherId, reason },
    }
  }
}

// ─── Agent-facing model (unchanged contract) ─────────────────────────────────

export interface AgentModel {
  /** Text-only generation. Contract unchanged from Phase 2. */
  generate(prompt: string): Promise<string>
  /** Same call, reporting the provider/model actually used (for run metadata). */
  generateDetailed(prompt: string): Promise<RunWithProviderResult<string>>
}

/** Provider-agnostic model: whichever provider LLM_PROVIDER selects. */
export class ConfiguredModel implements AgentModel {
  constructor(private readonly opts: ResolveOptions = {}) {}

  async generateDetailed(prompt: string): Promise<RunWithProviderResult<string>> {
    return runWithProvider(
      async (m) => (await generateText({ model: m.model, prompt })).text,
      this.opts
    )
  }

  async generate(prompt: string): Promise<string> {
    return (await this.generateDetailed(prompt)).value
  }
}

/** Per-agent overrides (Phase 6 track T2 fills this from configuration). */
const MODEL_OVERRIDES = new Map<string, () => AgentModel>()

export function getModelForAgent(agentId: string): AgentModel {
  const override = MODEL_OVERRIDES.get(agentId)
  return override ? override() : new ConfiguredModel()
}
