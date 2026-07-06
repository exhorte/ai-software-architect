import { describe, expect, it } from "vitest"

import { checkOwnership } from "../ownership"
import { buildInitialDocument } from "../store"

const requirement = (id: string, kind = "functional") => ({
  id,
  kind,
  title: `Requirement ${id}`,
  priority: "must",
  acceptanceCriteria: ["Verifiable."],
})

describe("checkOwnership", () => {
  const document = buildInitialDocument("idea")

  it("accepts the owning agent", () => {
    expect(checkOwnership("business/analyst", { actors: [] }, document)).toEqual([])
    expect(
      checkOwnership("architecture/uml_architect", { "architecture.uml": [] }, document)
    ).toEqual([])
  })

  it("rejects a non-owner (single writer rule)", () => {
    const errors = checkOwnership("business/analyst", { requirements: [] }, document)
    expect(errors).toHaveLength(1)
    expect(errors[0].rule).toBe("section-ownership")
  })

  it("lets the orchestrator write anything", () => {
    expect(checkOwnership("orchestrator", { runState: document.runState }, document)).toEqual([])
  })

  it("rejects unknown section keys", () => {
    const errors = checkOwnership(
      "business/analyst",
      { imaginary: true } as never,
      document
    )
    expect(errors[0].rule).toBe("unknown-section")
  })

  describe("security architect REQ-S append exception", () => {
    const withRequirements = {
      ...document,
      requirements: [requirement("REQ-F-001")],
    }

    it("allows appending REQ-S-* items untouched", () => {
      const writes = {
        requirements: [requirement("REQ-F-001"), requirement("REQ-S-001", "security")],
      }
      expect(
        checkOwnership("architecture/security_architect", writes, withRequirements)
      ).toEqual([])
    })

    it("rejects modification of existing requirements", () => {
      const tampered = { ...requirement("REQ-F-001"), title: "Rewritten" }
      const writes = { requirements: [tampered, requirement("REQ-S-001", "security")] }
      const errors = checkOwnership("architecture/security_architect", writes, withRequirements)
      expect(errors[0].rule).toBe("section-ownership")
    })

    it("rejects appending non-REQ-S items", () => {
      const writes = {
        requirements: [requirement("REQ-F-001"), requirement("REQ-F-002")],
      }
      const errors = checkOwnership("architecture/security_architect", writes, withRequirements)
      expect(errors[0].rule).toBe("section-ownership")
    })
  })
})
