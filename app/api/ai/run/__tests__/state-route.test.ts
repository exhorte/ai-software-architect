import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock dependencies so the handler is tested in isolation.
const identity = { userId: "user_1", primaryEmailAddress: "u@x.com" }
const mocks = vi.hoisted(() => ({
  getCurrentProjectIdentity: vi.fn(),
  getAccessibleProject: vi.fn(),
  findFirstRun: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getCurrentProjectIdentity: mocks.getCurrentProjectIdentity,
  getAccessibleProject: mocks.getAccessibleProject,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { run: { findFirst: mocks.findFirstRun } },
}))

import { GET } from "../state/route"

function req(url: string): Request {
  return new Request(`http://localhost${url}`)
}

const runRow = {
  id: "run_internal_1",
  projectId: "proj_1",
  triggerRunId: "run_public_1",
  phase: "CLARIFICATION",
  stepId: "step-03",
  status: "WAITING_CLARIFICATION",
  plan: { intent: "NEW_PROJECT", steps: [] },
  clarification: {
    tokenId: "waitpoint_1",
    questionIds: ["CLR-001"],
    questions: [{ id: "CLR-001", question: "What scope?", why: "scope", suggestedDefault: "Web" }],
    questionCount: 1,
    expiresAt: "2026-07-18T12:00:00.000Z",
    suspendedAt: "2026-07-17T12:00:00.000Z",
  },
  blockages: null,
  createdAt: "2026-07-17T10:00:00.000Z",
}

describe("GET /api/ai/run/state", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentProjectIdentity.mockResolvedValue(identity)
    mocks.getAccessibleProject.mockResolvedValue({ id: "proj_1" })
    mocks.findFirstRun.mockResolvedValue(runRow)
  })

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentProjectIdentity.mockResolvedValue({ userId: null })
    const res = await GET(req("/api/ai/run/state?runId=run_public_1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when runId is missing", async () => {
    const res = await GET(req("/api/ai/run/state"))
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown run", async () => {
    mocks.findFirstRun.mockResolvedValue(null)
    const res = await GET(req("/api/ai/run/state?runId=nonexistent"))
    expect(res.status).toBe(404)
  })

  it("returns 403 when the project is not accessible", async () => {
    mocks.getAccessibleProject.mockResolvedValue(null)
    const res = await GET(req("/api/ai/run/state?runId=run_public_1"))
    expect(res.status).toBe(403)
  })

  it("returns the run state for a valid request", async () => {
    const res = await GET(req("/api/ai/run/state?runId=run_public_1"))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({
      phase: "CLARIFICATION",
      stepId: "step-03",
      status: "WAITING_CLARIFICATION",
      plan: { intent: "NEW_PROJECT" },
      clarification: {
        tokenId: "waitpoint_1",
        questionIds: ["CLR-001"],
        questions: [{ id: "CLR-001", question: "What scope?" }],
        questionCount: 1,
      },
    })
    // The token id is an opaque handle, never a secret; the route must not
    // leak the internal Run id or the project id.
    expect(body).not.toHaveProperty("tokenId")
    expect(body).not.toHaveProperty("id")
    expect(body).not.toHaveProperty("projectId")
  })

  it("returns WAITING_CLARIFICATION state with full question text for the UI", async () => {
    const res = await GET(req("/api/ai/run/state?runId=run_public_1"))
    const body = await res.json()

    expect(body.clarification.questions[0]).toEqual({
      id: "CLR-001",
      question: "What scope?",
      why: "scope",
      suggestedDefault: "Web",
    })
  })
})
