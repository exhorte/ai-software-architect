import { beforeEach, describe, expect, it, vi } from "vitest"

// The route pulls Clerk, Prisma and the Trigger SDK; mock them so the handler
// is exercised in isolation. The decision core is unit-tested separately.
const identity = { userId: "user_1", primaryEmailAddress: "u@x.com" }
const mocks = vi.hoisted(() => ({
  getCurrentProjectIdentity: vi.fn(),
  getAccessibleProject: vi.fn(),
  findFirstRun: vi.fn(),
  retrieveToken: vi.fn(),
  completeToken: vi.fn(),
}))

vi.mock("@/lib/project-access", () => ({
  getCurrentProjectIdentity: mocks.getCurrentProjectIdentity,
  getAccessibleProject: mocks.getAccessibleProject,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { run: { findFirst: mocks.findFirstRun } },
}))
vi.mock("@trigger.dev/sdk/v3", () => ({
  wait: { retrieveToken: mocks.retrieveToken, completeToken: mocks.completeToken },
}))

import { POST } from "../answers/route"

const clarification = {
  tokenId: "waitpoint_1",
  questionIds: ["CLR-001", "CLR-002"],
  questionCount: 2,
  expiresAt: "2026-07-18T12:00:00.000Z",
  suspendedAt: "2026-07-17T12:00:00.000Z",
}

const waitingRun = {
  id: "run_row_1",
  projectId: "proj_1",
  status: "WAITING_CLARIFICATION",
  clarification,
  triggerRunId: "run_abc",
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/run/answers", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const validBody = { runId: "run_abc", answers: [{ id: "CLR-001", answer: "Multiple" }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentProjectIdentity.mockResolvedValue(identity)
  mocks.getAccessibleProject.mockResolvedValue({ id: "proj_1" })
  mocks.findFirstRun.mockResolvedValue(waitingRun)
  mocks.retrieveToken.mockResolvedValue({ status: "WAITING" })
  mocks.completeToken.mockResolvedValue({ success: true })
})

describe("POST /api/ai/run/answers", () => {
  it("401 when unauthenticated", async () => {
    mocks.getCurrentProjectIdentity.mockResolvedValue({ userId: null })
    expect((await POST(post(validBody))).status).toBe(401)
  })

  it("400 on missing runId", async () => {
    expect((await POST(post({ answers: [] }))).status).toBe(400)
  })

  it("400 on invalid JSON", async () => {
    expect((await POST(post("{not json"))).status).toBe(400)
  })

  it("404 when the run does not exist", async () => {
    mocks.findFirstRun.mockResolvedValue(null)
    expect((await POST(post(validBody))).status).toBe(404)
  })

  it("403 when the run belongs to a project the user cannot access", async () => {
    mocks.getAccessibleProject.mockResolvedValue(null)
    const res = await POST(post(validBody))
    expect(res.status).toBe(403)
    // Ownership is checked before any waitpoint call.
    expect(mocks.retrieveToken).not.toHaveBeenCalled()
  })

  it("409 when the run is not waiting for clarification", async () => {
    mocks.findFirstRun.mockResolvedValue({ ...waitingRun, status: "RUNNING" })
    expect((await POST(post(validBody))).status).toBe(409)
  })

  it("409 when there is no pending token", async () => {
    mocks.findFirstRun.mockResolvedValue({ ...waitingRun, clarification: null })
    expect((await POST(post(validBody))).status).toBe(409)
  })

  it("200 on a valid submission — completes the waitpoint, never commits", async () => {
    const res = await POST(post(validBody))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: "resuming", answersAccepted: 1 })
    expect(mocks.completeToken).toHaveBeenCalledWith("waitpoint_1", {
      answers: [{ id: "CLR-001", answer: "Multiple" }],
    })
  })

  it("400 on an unknown answer id", async () => {
    const res = await POST(post({ runId: "run_abc", answers: [{ id: "CLR-999", answer: "x" }] }))
    expect(res.status).toBe(400)
    expect(mocks.completeToken).not.toHaveBeenCalled()
  })

  it("400 on an empty submission", async () => {
    expect((await POST(post({ runId: "run_abc", answers: [] }))).status).toBe(400)
    expect(mocks.completeToken).not.toHaveBeenCalled()
  })

  it("409 on a second submission (token already completed)", async () => {
    mocks.retrieveToken.mockResolvedValue({ status: "COMPLETED" })
    expect((await POST(post(validBody))).status).toBe(409)
    expect(mocks.completeToken).not.toHaveBeenCalled()
  })

  it("410 when the token has expired (distinct from consumed)", async () => {
    mocks.retrieveToken.mockResolvedValue({ status: "TIMED_OUT" })
    expect((await POST(post(validBody))).status).toBe(410)
  })

  it("500 when a Trigger call fails — no secret leaked", async () => {
    mocks.completeToken.mockRejectedValue(new Error("tr_secret_xyz upstream 503"))
    const res = await POST(post(validBody))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: "Failed to submit answers" })
  })

  it("400 on an oversized body", async () => {
    const huge = JSON.stringify({ runId: "run_abc", answers: [{ id: "CLR-001", answer: "x".repeat(70_000) }] })
    expect((await POST(post(huge))).status).toBe(400)
  })

  it("cannot answer a run in another project (ownership by run's project, not client input)", async () => {
    // Even with a valid-looking body, access is decided by the run's projectId.
    mocks.getAccessibleProject.mockImplementation(async (projectId: string) =>
      projectId === "proj_1" ? null : { id: projectId }
    )
    expect((await POST(post(validBody))).status).toBe(403)
  })
})
