import { describe, expect, it } from "vitest"

import { checkBusinessConsistency, checkCon01, checkCon02 } from "../consistency"

const actors = [{ id: "ACT-Seller" }, { id: "ACT-Buyer" }]

const requirements = [
  { id: "REQ-F-001", priority: "must", title: "Seller publishes a listing" },
  { id: "REQ-F-002", priority: "should", title: "Seller sees analytics" },
]

const coveringStories = [
  { id: "US-001", actor: "ACT-Seller", requirements: ["REQ-F-001"] },
]

describe("CON-01 — every must requirement is covered by a story", () => {
  it("passes when each must requirement has a story", () => {
    expect(checkCon01(requirements, coveringStories)).toEqual([])
  })

  it("ignores non-must requirements", () => {
    // REQ-F-002 is "should" and uncovered — not a violation.
    expect(checkCon01(requirements, coveringStories)).toHaveLength(0)
  })

  it("flags an uncovered must requirement and routes it to the story writer", () => {
    const findings = checkCon01(requirements, [])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: "CON-01", routedTo: "business/user_story" })
    expect(findings[0].detail).toContain("REQ-F-001")
    expect(findings[0].detail).toContain("Seller publishes a listing")
    // The "should" requirement must not be named.
    expect(findings[0].detail).not.toContain("REQ-F-002")
  })

  it("tolerates missing/!array sections", () => {
    expect(checkCon01(undefined, undefined)).toEqual([])
    expect(checkCon01("nonsense", 42)).toEqual([])
  })
})

describe("CON-02 — stories reference only existing ids", () => {
  it("passes on well-formed references", () => {
    expect(checkCon02(coveringStories, requirements, actors)).toEqual([])
  })

  it("flags an unknown requirement reference", () => {
    const findings = checkCon02(
      [{ id: "US-009", actor: "ACT-Seller", requirements: ["REQ-F-404"] }],
      requirements,
      actors
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ rule: "CON-02", routedTo: "business/user_story" })
    expect(findings[0].detail).toContain("US-009")
    expect(findings[0].detail).toContain("REQ-F-404")
  })

  it("flags an unknown actor reference", () => {
    const findings = checkCon02(
      [{ id: "US-010", actor: "ACT-Ghost", requirements: ["REQ-F-001"] }],
      requirements,
      actors
    )
    expect(findings[0].detail).toContain("ACT-Ghost")
  })

  it("reports every offending story in one finding", () => {
    const findings = checkCon02(
      [
        { id: "US-011", actor: "ACT-Ghost", requirements: ["REQ-F-404"] },
        { id: "US-012", actor: "ACT-Buyer", requirements: ["REQ-F-999"] },
      ],
      requirements,
      actors
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain("US-011")
    expect(findings[0].detail).toContain("US-012")
  })
})

describe("checkBusinessConsistency", () => {
  it("returns nothing on a coherent Business slice", () => {
    expect(
      checkBusinessConsistency({ requirements, userStories: coveringStories, actors })
    ).toEqual([])
  })

  it("surfaces both rules at once", () => {
    const findings = checkBusinessConsistency({
      requirements,
      userStories: [{ id: "US-013", actor: "ACT-Ghost", requirements: ["REQ-F-404"] }],
      actors,
    })
    expect(findings.map((f) => f.rule).sort()).toEqual(["CON-01", "CON-02"])
  })
})
