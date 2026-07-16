import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ConfiguredModel,
  isTransientProviderError,
  resolveLanguageModel,
  runWithProvider,
  selectedProvider,
  SUPPORTED_PROVIDERS,
  type ResolvedModel,
} from "../llm"

/** Restore env between tests — provider selection is env-driven by design. */
const ENV_KEYS = [
  "LLM_PROVIDER",
  "GOOGLE_AI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_SPEC_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_SPEC_MODEL",
  "DEEPSEEK_BASE_URL",
] as const

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

/** Error shaped like an AI SDK provider failure. */
function providerError(message: string, status?: number): Error {
  const e = new Error(message) as Error & { statusCode?: number }
  if (status !== undefined) e.statusCode = status
  return e
}

describe("selectedProvider", () => {
  it("defaults to gemini so existing setups keep working", () => {
    expect(selectedProvider()).toBe("gemini")
  })

  it("honours LLM_PROVIDER (case/space tolerant)", () => {
    process.env.LLM_PROVIDER = " DeepSeek "
    expect(selectedProvider()).toBe("deepseek")
  })

  it("fails loudly on an unknown provider — never silently falls back", () => {
    process.env.LLM_PROVIDER = "llama"
    expect(() => selectedProvider()).toThrow(/not supported/i)
  })

  it("exposes exactly the supported providers", () => {
    expect([...SUPPORTED_PROVIDERS]).toEqual(["gemini", "deepseek"])
  })
})

describe("resolveLanguageModel", () => {
  it("gemini: explicit error when its key is missing", () => {
    process.env.LLM_PROVIDER = "gemini"
    expect(() => resolveLanguageModel()).toThrow(/GOOGLE_AI_API_KEY is not set/)
  })

  it("deepseek: explicit error when its key is missing", () => {
    process.env.LLM_PROVIDER = "deepseek"
    expect(() => resolveLanguageModel()).toThrow(/DEEPSEEK_API_KEY is not set/)
  })

  it("deepseek: defaults to deepseek-v4-pro", () => {
    process.env.LLM_PROVIDER = "deepseek"
    process.env.DEEPSEEK_API_KEY = "test-key"
    const r = resolveLanguageModel()
    expect(r.provider).toBe("deepseek")
    expect(r.modelId).toBe("deepseek-v4-pro")
  })

  it("deepseek: DEEPSEEK_MODEL overrides the default", () => {
    process.env.LLM_PROVIDER = "deepseek"
    process.env.DEEPSEEK_API_KEY = "test-key"
    process.env.DEEPSEEK_MODEL = "deepseek-chat"
    expect(resolveLanguageModel().modelId).toBe("deepseek-chat")
  })

  it("gemini: keeps its default and the spec-model override", () => {
    process.env.GOOGLE_AI_API_KEY = "test-key"
    expect(resolveLanguageModel().modelId).toBe("gemini-flash-latest")

    process.env.GEMINI_MODEL = "gemini-x"
    process.env.GEMINI_SPEC_MODEL = "gemini-spec"
    expect(resolveLanguageModel().modelId).toBe("gemini-x")
    expect(resolveLanguageModel({ purpose: "spec" }).modelId).toBe("gemini-spec")
  })
})

describe("isTransientProviderError", () => {
  it("accepts capacity/quota/availability failures", () => {
    expect(isTransientProviderError(providerError("This model is currently experiencing high demand."))).toBe(true)
    expect(isTransientProviderError(providerError("You exceeded your current quota"))).toBe(true)
    expect(isTransientProviderError(providerError("service temporarily unavailable"))).toBe(true)
    expect(isTransientProviderError(providerError("boom", 429))).toBe(true)
    expect(isTransientProviderError(providerError("boom", 503))).toBe(true)
  })

  it("rejects config/contract failures — these must surface", () => {
    expect(isTransientProviderError(providerError("Invalid request", 400))).toBe(false)
    expect(isTransientProviderError(providerError("Unauthorized", 401))).toBe(false)
    expect(isTransientProviderError(providerError("model not found", 404))).toBe(false)
    expect(isTransientProviderError(providerError("envelope failed schema validation"))).toBe(false)
    expect(isTransientProviderError(providerError("Unexpected token in JSON"))).toBe(false)
    expect(isTransientProviderError(new Error("prompt too vague"))).toBe(false)
    expect(isTransientProviderError(null)).toBe(false)
  })
})

describe("runWithProvider", () => {
  it("reports the provider that produced the value", async () => {
    process.env.LLM_PROVIDER = "deepseek"
    process.env.DEEPSEEK_API_KEY = "test-key"

    const call = vi.fn(async (m: ResolvedModel) => `from:${m.provider}`)
    const res = await runWithProvider(call)

    expect(res.value).toBe("from:deepseek")
    expect(res.used.provider).toBe("deepseek")
    expect(res.fallback).toBeUndefined()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("falls back to the other provider on a transient error, and says so", async () => {
    process.env.LLM_PROVIDER = "gemini"
    process.env.GOOGLE_AI_API_KEY = "g-key"
    process.env.DEEPSEEK_API_KEY = "d-key"

    const call = vi.fn(async (m: ResolvedModel) => {
      if (m.provider === "gemini") throw providerError("This model is currently experiencing high demand.")
      return "ok-from-deepseek"
    })

    const res = await runWithProvider(call)

    expect(res.value).toBe("ok-from-deepseek")
    expect(res.used.provider).toBe("deepseek")
    expect(res.fallback).toMatchObject({ from: "gemini", to: "deepseek" })
    expect(res.fallback?.reason).toMatch(/high demand/)
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("never falls back on a non-transient error", async () => {
    process.env.LLM_PROVIDER = "gemini"
    process.env.GOOGLE_AI_API_KEY = "g-key"
    process.env.DEEPSEEK_API_KEY = "d-key"

    const call = vi.fn(async () => {
      throw providerError("envelope failed schema validation")
    })

    await expect(runWithProvider(call)).rejects.toThrow(/schema validation/)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("surfaces the original error when the other provider is not configured", async () => {
    process.env.LLM_PROVIDER = "gemini"
    process.env.GOOGLE_AI_API_KEY = "g-key"
    // no DEEPSEEK_API_KEY

    const call = vi.fn(async () => {
      throw providerError("high demand", 503)
    })

    await expect(runWithProvider(call)).rejects.toThrow(/high demand/)
    expect(call).toHaveBeenCalledTimes(1)
  })
})

describe("ConfiguredModel", () => {
  it("keeps the text-only generate() contract on top of generateDetailed()", async () => {
    process.env.LLM_PROVIDER = "deepseek"
    process.env.DEEPSEEK_API_KEY = "test-key"

    const model = new ConfiguredModel()
    vi.spyOn(model, "generateDetailed").mockResolvedValue({
      value: "hello",
      used: { provider: "deepseek", modelId: "deepseek-v4-pro", model: {} as ResolvedModel["model"] },
    })

    await expect(model.generate("hi")).resolves.toBe("hello")
  })
})
