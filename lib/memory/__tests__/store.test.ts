import { beforeEach, describe, expect, it } from "vitest"

import { InMemoryPersistence } from "../memory-adapter"
import { MemoryStore } from "../store"

const PROJECT = "proj_test"

const actors = [
  { id: "ACT-Seller", name: "Seller", kind: "human", role: "primary", goals: ["Sell products"] },
]

const requirements = [
  {
    id: "REQ-F-001",
    kind: "functional",
    title: "Seller publishes a product",
    priority: "must",
    acceptanceCriteria: ["A published product is visible in the catalog."],
  },
]

describe("MemoryStore", () => {
  let persistence: InMemoryPersistence
  let store: MemoryStore

  beforeEach(async () => {
    persistence = new InMemoryPersistence()
    store = new MemoryStore(persistence)
    await store.initMemory(PROJECT, "A marketplace for plants")
  })

  it("initMemory creates a valid version-1 skeleton", async () => {
    const document = await store.getMemory(PROJECT)
    expect(document?.memoryVersion).toBe(1)
    expect(document?.runState.phase).toBe("INTAKE")
    expect(document?.runState.sectionStatus.project).toBe("draft")
  })

  it("AC1 — a valid commit bumps the version by 1 and appends one revision", async () => {
    const result = await store.commitSection(
      PROJECT,
      { agentId: "business/analyst", runId: "run_1", stepId: "step-01" },
      { actors }
    )

    expect(result.ok).toBe(true)
    expect(result.version).toBe(2)

    const document = await store.getMemory(PROJECT)
    expect(document?.memoryVersion).toBe(2)
    expect(document?.runState.sectionStatus.actors).toBe("draft")
    expect(document?.runState.history?.at(-1)).toMatchObject({
      version: 2,
      agentId: "business/analyst",
      sections: ["actors"],
    })

    const revisions = await persistence.loadRevisions(PROJECT)
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({ version: 2, agentId: "business/analyst", runId: "run_1" })
  })

  it("AC2 — an invalid payload is rejected atomically with structured errors", async () => {
    const result = await store.commitSection(
      PROJECT,
      { agentId: "business/analyst" },
      { actors: [{ id: "not-an-actor-id", name: "X" }] }
    )

    expect(result.ok).toBe(false)
    expect(result.errors?.length).toBeGreaterThan(0)
    expect(result.errors?.[0]).toHaveProperty("rule")
    expect(result.errors?.[0]).toHaveProperty("path")

    const document = await store.getMemory(PROJECT)
    expect(document?.memoryVersion).toBe(1)
    expect(document?.actors).toBeUndefined()
    expect(await persistence.loadRevisions(PROJECT)).toHaveLength(0)
  })

  it("AC3 — a non-owner commit is rejected; the REQ-S append exception works", async () => {
    const wrongOwner = await store.commitSection(
      PROJECT,
      { agentId: "business/analyst" },
      { requirements }
    )
    expect(wrongOwner.ok).toBe(false)
    expect(wrongOwner.errors?.[0].rule).toBe("section-ownership")

    const owner = await store.commitSection(
      PROJECT,
      { agentId: "business/requirements" },
      { requirements }
    )
    expect(owner.ok).toBe(true)

    const securityAppend = await store.commitSection(
      PROJECT,
      { agentId: "architecture/security_architect" },
      {
        requirements: [
          ...requirements,
          {
            id: "REQ-S-001",
            kind: "security",
            title: "Passwords are stored hashed",
            priority: "must",
            acceptanceCriteria: ["No plaintext password at rest."],
          },
        ],
      }
    )
    expect(securityAppend.ok).toBe(true)
  })

  it("AC4 — scoped reads return only the requested keys", async () => {
    await store.commitSection(PROJECT, { agentId: "business/analyst" }, { actors })

    const slice = await store.getSections(PROJECT, ["actors", "requirements"])
    expect(Object.keys(slice ?? {}).sort()).toEqual(["actors", "requirements"])
    expect(slice?.actors).toHaveLength(1)
    expect(slice?.requirements).toBeUndefined()
    expect(slice).not.toHaveProperty("project")
  })

  it("AC5 — markStale flips exactly the mapped sections", async () => {
    await store.commitSection(PROJECT, { agentId: "business/requirements" }, { requirements })
    await store.setSectionStatus(PROJECT, {
      requirements: "valid",
      "architecture.uml": "valid",
      database: "draft",
      roadmap: "missing",
    })

    const flipped = await store.markStale(PROJECT, ["requirements"])
    expect(flipped.sort()).toEqual(["architecture.uml", "database"].sort())

    const document = await store.getMemory(PROJECT)
    expect(document?.runState.sectionStatus["architecture.uml"]).toBe("stale")
    expect(document?.runState.sectionStatus.database).toBe("stale")
    expect(document?.runState.sectionStatus.requirements).toBe("valid")
    expect(document?.runState.sectionStatus.roadmap).toBe("missing")
  })

  it("AC6 — a section can be reconstructed at any prior version", async () => {
    await store.commitSection(PROJECT, { agentId: "business/analyst" }, { actors }) // v2
    const updatedActors = [
      ...actors,
      { id: "ACT-Buyer", name: "Buyer", kind: "human", role: "primary", goals: ["Buy plants"] },
    ]
    await store.commitSection(PROJECT, { agentId: "business/analyst" }, { actors: updatedActors }) // v3

    expect(await store.getSectionAtVersion(PROJECT, "actors", 1)).toBeUndefined()
    expect(await store.getSectionAtVersion(PROJECT, "actors", 2)).toHaveLength(1)
    expect(await store.getSectionAtVersion(PROJECT, "actors", 3)).toHaveLength(2)
  })

  it("rejects a commit when the optimistic lock fails", async () => {
    const stale = await persistence.load(PROJECT)
    await store.commitSection(PROJECT, { agentId: "business/analyst" }, { actors }) // bumps to v2

    const conflict = await persistence.commit(
      PROJECT,
      stale!.version, // v1 — already superseded
      stale!.document,
      { version: 2, agentId: "x", changedSections: {}, createdAt: new Date().toISOString() }
    )
    expect(conflict).toBe(false)
  })

  it("rejects commits against a project with no memory", async () => {
    const result = await store.commitSection("proj_ghost", { agentId: "business/analyst" }, { actors })
    expect(result.ok).toBe(false)
    expect(result.errors?.[0].rule).toBe("memory-missing")
  })
})
