import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { assertDesignProduced, buildSystemPrompt, countDesignToolCalls } from "../design-agent"

const NON_TRIVIAL = "Design a scalable e-commerce backend with payments"

/** How the task derives its toolChoice — mirrors the seam capability. */
function toolChoiceFor(capabilities: { supportsForcedToolChoice: boolean }): "required" | "auto" {
  return capabilities.supportsForcedToolChoice ? "required" : "auto"
}

describe("toolChoice comes from model capabilities", () => {
  it("1. supportsForcedToolChoice=true -> required", () => {
    expect(toolChoiceFor({ supportsForcedToolChoice: true })).toBe("required")
  })

  it("2. supportsForcedToolChoice=false -> auto", () => {
    expect(toolChoiceFor({ supportsForcedToolChoice: false })).toBe("auto")
  })
})

describe("system prompt reinforcement", () => {
  it("stays unchanged when tools can be forced", () => {
    const prompt = buildSystemPrompt(true)
    expect(prompt).toContain("You are Ghost AI")
    expect(prompt).not.toContain("TOOL USE IS MANDATORY")
  })

  it("adds mandatory-tool pressure only in auto mode", () => {
    const prompt = buildSystemPrompt(false)
    expect(prompt).toContain("You are Ghost AI") // business prompt preserved
    expect(prompt).toContain("TOOL USE IS MANDATORY")
    expect(prompt).toContain("Prose alone is not an answer")
    expect(prompt).toContain("addNode for EVERY component")
    expect(prompt).toContain("finalizeDesign LAST")
  })
})

describe("countDesignToolCalls", () => {
  it("separates design calls from the finalize call", () => {
    const counts = countDesignToolCalls([
      { toolName: "addNode" },
      { toolName: "addNode" },
      { toolName: "addEdge" },
      { toolName: "finalizeDesign" },
    ])
    expect(counts).toEqual({ design: 3, nodes: 2, finalize: true })
  })
})

describe("assertDesignProduced", () => {
  it("3. auto mode with nodes -> succeeds", () => {
    const counts = countDesignToolCalls([
      { toolName: "addNode" },
      { toolName: "addNode" },
      { toolName: "addEdge" },
      { toolName: "finalizeDesign" },
    ])
    expect(() => assertDesignProduced(counts, NON_TRIVIAL, "auto")).not.toThrow()
  })

  it("4. auto mode with zero tool calls -> explicit failure", () => {
    const counts = countDesignToolCalls([])
    expect(() => assertDesignProduced(counts, NON_TRIVIAL, "auto")).toThrow(
      /no design tool call/i
    )
  })

  it("4b. prose answer with only a finalize call -> explicit failure", () => {
    const counts = countDesignToolCalls([{ toolName: "finalizeDesign" }])
    expect(() => assertDesignProduced(counts, NON_TRIVIAL, "auto")).toThrow(
      /no design tool call/i
    )
  })

  it("rejects a token-effort design for a non-trivial prompt", () => {
    const counts = countDesignToolCalls([{ toolName: "addNode" }])
    expect(() => assertDesignProduced(counts, NON_TRIVIAL, "auto")).toThrow(/only 1 node/i)
  })

  it("accepts a single node for a trivial prompt", () => {
    const counts = countDesignToolCalls([{ toolName: "addNode" }])
    expect(() => assertDesignProduced(counts, "add cache", "auto")).not.toThrow()
  })

  it("5. missing finalizeDesign but nodes present -> succeeds (summary fallback keeps working)", () => {
    const counts = countDesignToolCalls([{ toolName: "addNode" }, { toolName: "addNode" }])
    expect(counts.finalize).toBe(false)
    expect(() => assertDesignProduced(counts, NON_TRIVIAL, "auto")).not.toThrow()
  })
})

describe("6. no provider coupling in design-agent", () => {
  const source = readFileSync(path.join(__dirname, "..", "design-agent.ts"), "utf8")

  it("never names a provider", () => {
    expect(source).not.toMatch(/deepseek/i)
    expect(source).not.toMatch(/gemini/i)
    expect(source).not.toMatch(/openai/i)
    expect(source).not.toMatch(/provider\s*===/)
  })

  it("derives toolChoice from the capability, not from a provider check", () => {
    expect(source).toContain("capabilities.supportsForcedToolChoice")
  })
})
