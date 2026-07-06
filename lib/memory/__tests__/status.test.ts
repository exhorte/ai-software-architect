import { describe, expect, it } from "vitest"

import { canTransition, staleTargets } from "../status"
import type { SectionStatus } from "../types"

describe("canTransition", () => {
  it("follows the lifecycle missing → draft → valid → (stale | blocked)", () => {
    expect(canTransition("missing", "draft")).toBe(true)
    expect(canTransition("draft", "valid")).toBe(true)
    expect(canTransition("draft", "blocked")).toBe(true)
    expect(canTransition("valid", "stale")).toBe(true)
    expect(canTransition("stale", "draft")).toBe(true)
    expect(canTransition("blocked", "draft")).toBe(true)
  })

  it("rejects illegal jumps", () => {
    expect(canTransition("missing", "valid")).toBe(false)
    expect(canTransition("missing", "stale")).toBe(false)
    expect(canTransition("stale", "valid")).toBe(false)
    expect(canTransition("blocked", "valid")).toBe(false)
  })
})

describe("staleTargets (invalidation map)", () => {
  const statuses: Record<string, SectionStatus> = {
    project: "valid",
    actors: "valid",
    requirements: "valid",
    userStories: "valid",
    "architecture.uml": "valid",
    "architecture.components": "valid",
    database: "draft",
    api: "valid",
    roadmap: "missing",
    security: "blocked",
    runState: "valid",
  }

  it("requirements change invalidates downstream draft/valid sections only (AC5)", () => {
    const targets = staleTargets(["requirements"], statuses).sort()
    expect(targets).toEqual(
      ["api", "architecture.components", "architecture.uml", "database"].sort()
    )
    // Not roadmap (missing), not security (blocked), never project/actors/runState,
    // and never requirements itself.
  })

  it("entities change invalidates only uml, database and api", () => {
    const targets = staleTargets(["entities"], statuses).sort()
    expect(targets).toEqual(["api", "architecture.uml", "database"].sort())
  })

  it("project change invalidates everything downstream (wildcard)", () => {
    const targets = staleTargets(["project"], statuses).sort()
    expect(targets).toEqual(
      ["api", "architecture.components", "architecture.uml", "database", "requirements", "userStories"].sort()
    )
  })

  it("a dotted changed section invalidates through its top level", () => {
    const targets = staleTargets(["architecture.components"], statuses).sort()
    expect(targets).toEqual(["api", "database"].sort())
  })

  it("returns nothing when the changed section has no downstream", () => {
    expect(staleTargets(["documentation.readme"], statuses)).toEqual([])
  })
})
