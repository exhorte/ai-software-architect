import { describe, expect, it } from "vitest"

import { getValidator, UML_SCHEMA_ID } from "../schemas"
import { buildInitialDocument } from "../store"
import type { MemoryDocument } from "../types"
import { validateDocument } from "../validate"

import classDiagram from "../../../.claude/context/templates/class_diagram.json"
import sequenceDiagram from "../../../.claude/context/templates/sequence.json"
import usecaseDiagram from "../../../.claude/context/templates/usecase.json"
import deploymentDiagram from "../../../.claude/context/templates/deployment.json"
import roadmapTemplate from "../../../.claude/context/templates/roadmap.json"

describe("canonical templates (phase checkpoint 2)", () => {
  const umlTemplates = [classDiagram, sequenceDiagram, usecaseDiagram, deploymentDiagram]

  it.each(umlTemplates.map((t) => [t.id, t] as const))(
    "UML template %s conforms to uml.schema.json",
    (_id, template) => {
      const validate = getValidator(UML_SCHEMA_ID)
      const valid = validate(template)
      expect(validate.errors ?? []).toEqual([])
      expect(valid).toBe(true)
    }
  )

  it("roadmap template conforms to the roadmap/backlog sections", () => {
    const document = buildInitialDocument("Test idea")
    document.roadmap = roadmapTemplate.roadmap
    document.backlog = roadmapTemplate.backlog

    expect(validateDocument(document)).toEqual([])
  })
})

describe("validateDocument", () => {
  it("accepts the initial skeleton", () => {
    expect(validateDocument(buildInitialDocument("A marketplace for plants"))).toEqual([])
  })

  it("rejects a payload with a wrong shape (level 1)", () => {
    const document = buildInitialDocument("idea")
    document.actors = [{ id: "ACT-Seller", name: "Seller" }] // missing kind + goals

    const errors = validateDocument(document)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.level === 1)).toBe(true)
    expect(errors[0].section).toBe("actors")
    expect(errors[0].rule).toBe("required")
  })

  it("rejects a malformed ID pattern (level 1)", () => {
    const document = buildInitialDocument("idea")
    document.requirements = [
      {
        id: "REQ-X-001",
        kind: "functional",
        title: "Broken id family",
        priority: "must",
        acceptanceCriteria: ["It never validates."],
      },
    ]

    const errors = validateDocument(document)
    expect(errors.some((e) => e.rule === "pattern" && e.section === "requirements")).toBe(true)
  })

  it("rejects duplicate identifiers (level 2)", () => {
    const document = buildInitialDocument("idea")
    document.actors = [
      { id: "ACT-Seller", name: "Seller", kind: "human", goals: ["Sell"] },
      { id: "ACT-Seller", name: "Seller again", kind: "human", goals: ["Sell more"] },
    ]

    const errors = validateDocument(document)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ level: 2, rule: "unique-id", section: "actors" })
  })

  it("rejects a document missing required roots", () => {
    const document = { memoryVersion: 1 } as unknown as MemoryDocument
    const errors = validateDocument(document)
    expect(errors.some((e) => e.rule === "required")).toBe(true)
  })
})
