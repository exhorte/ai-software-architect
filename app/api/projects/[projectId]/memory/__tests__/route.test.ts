/**
 * Tests for GET /api/projects/[projectId]/memory
 *
 * Covers: 401 (unauthenticated), 403 (no access), 404 (no memory doc),
 * 200 with sections + statuses, empty memory (present but empty sections).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirstProject: vi.fn(),
  getMemory: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }))

vi.mock("@/lib/prisma", () => ({
  prisma: { project: { findFirst: mocks.findFirstProject } },
}))

// Mock the Memory layer: the store constructor captures the persistence adapter
// and exposes getMemory via the mock.
vi.mock("@/lib/memory", () => {
  class MockMemoryStore {
    getMemory = mocks.getMemory
  }
  class MockPrismaPersistence { /* no-op */ }
  return {
    MemoryStore: MockMemoryStore,
    PrismaPersistence: MockPrismaPersistence,
  }
})

// The route handler resolves mocks eagerly; import after all mocks are registered.
import { GET } from "../route"

function buildRequest(): Request {
  return new Request("http://localhost/api/projects/proj_123/memory")
}

async function callGet(projectId: string) {
  const ctx = { params: Promise.resolve({ projectId }) } as unknown as {
    params: Promise<{ projectId: string }>
  }
  return GET(buildRequest(), ctx)
}

describe("GET /api/projects/[projectId]/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null })
    const res = await callGet("proj_123")
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 403 when the project does not belong to the caller", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.findFirstProject.mockResolvedValue(null) // no matching ownerId
    const res = await callGet("proj_123")
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("Forbidden")
  })

  it("returns 404 when no memory document exists", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.findFirstProject.mockResolvedValue({ id: "proj_123", ownerId: "user_1" })
    mocks.getMemory.mockResolvedValue(null)
    const res = await callGet("proj_123")
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("No memory document")
  })

  it("returns 200 with sections when memory exists", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.findFirstProject.mockResolvedValue({ id: "proj_123", ownerId: "user_1" })

    const memoryDoc = {
      memoryVersion: 3,
      project: {
        name: "Test Project",
        description: "A test idea",
        goals: [{ id: "GOAL-01", statement: "Make it work" }],
        scope: { in: ["web"], out: ["mobile"] },
        constraints: [],
        assumptions: [],
      },
      actors: [{ id: "ACT-Customer", name: "Customer", kind: "human", goals: ["order"] }],
      requirements: [
        { id: "REQ-F-001", kind: "functional", title: "Login", priority: "must-have" },
      ],
      userStories: [],
      clarifications: [],
      entities: [],
      businessRules: [],
      runState: {
        phase: "REQUIREMENTS",
        sectionStatus: { project: "valid", actors: "valid", requirements: "draft", userStories: "missing" },
        blockages: null,
      },
    }

    mocks.getMemory.mockResolvedValue(memoryDoc)

    const res = await callGet("proj_123")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toHaveProperty("project")
    expect(body).toHaveProperty("actors")
    expect(body).toHaveProperty("requirements")
    expect(body).toHaveProperty("userStories")
    expect(body).toHaveProperty("runState")

    expect(body.project.name).toBe("Test Project")
    expect(body.actors).toHaveLength(1)
    expect(body.requirements).toHaveLength(1)
    expect(body.userStories).toEqual([])

    expect(body.runState.phase).toBe("REQUIREMENTS")
    expect(body.runState.sectionStatus.project).toBe("valid")
    expect(body.runState.sectionStatus.userStories).toBe("missing")
  })

  it("returns null for sections not yet committed", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.findFirstProject.mockResolvedValue({ id: "proj_123", ownerId: "user_1" })
    mocks.getMemory.mockResolvedValue({
      memoryVersion: 1,
      project: { name: "Bare", description: "", goals: [], scope: { in: [], out: [] }, constraints: [], assumptions: [] },
      runState: { phase: "INTAKE", sectionStatus: { project: "draft" } },
    })

    const res = await callGet("proj_123")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.actors).toBeNull()
    expect(body.requirements).toBeNull()
    expect(body.userStories).toBeNull()
  })

  it("returns empty arrays as-is", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_1" })
    mocks.findFirstProject.mockResolvedValue({ id: "proj_123", ownerId: "user_1" })
    mocks.getMemory.mockResolvedValue({
      memoryVersion: 2,
      project: { name: "X", description: "", goals: [], scope: { in: [], out: [] }, constraints: [], assumptions: [] },
      actors: [],
      requirements: [],
      userStories: [],
      clarifications: [],
      entities: [],
      businessRules: [],
      runState: { phase: "INTAKE", sectionStatus: {} },
    })

    const res = await callGet("proj_123")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.actors).toEqual([])
    expect(body.requirements).toEqual([])
  })
})
