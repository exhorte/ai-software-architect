import { wait } from "@trigger.dev/sdk/v3"

import { prisma } from "@/lib/prisma"
import {
  submitClarificationAnswers,
  type WaitpointResumeApi,
} from "@/lib/orchestrator/clarification"
import type { ClarificationRunState } from "@/lib/orchestrator/engine"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

/** Cap the raw body so a submission cannot be used to push a huge payload. */
const MAX_BODY_BYTES = 64 * 1024

/** Real waitpoint surface; the decision core stays pure and injectable. */
const waitpoint: WaitpointResumeApi = {
  retrieveToken: async (id) => {
    const token = await wait.retrieveToken(id)
    return { status: String(token.status) }
  },
  completeToken: async (id, data) => {
    await wait.completeToken(id, data)
  },
}

/**
 * Submits clarification answers for a suspended run. Order: authenticate →
 * project access → load Run → status/token checks → validate → complete the
 * waitpoint. This route NEVER commits answers to memory: it completes the
 * waitpoint and the resumed engine performs the single canonical commit.
 */
export async function POST(request: Request) {
  // 1. Authenticate.
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Bounded body read (protects against oversized payloads before parsing).
  const rawText = await request.text()
  if (rawText.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 400 })
  }
  let body: unknown
  try {
    body = JSON.parse(rawText || "null")
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 })
  }
  const b = body as Record<string, unknown>
  const runId = typeof b.runId === "string" ? b.runId.trim() : ""
  if (!runId) return Response.json({ error: "Missing runId" }, { status: 400 })

  // 3. Load the Run by its Trigger run id (the public tracking id the client holds).
  const run = await prisma.run.findFirst({ where: { triggerRunId: runId } })
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 })

  // 2. Project access — distinguishes "not yours" (403) from "does not exist" (404).
  const project = await getAccessibleProject(run.projectId, identity)
  if (!project) return Response.json({ error: "Forbidden" }, { status: 403 })

  // 4–11. Delegated to the pure core; Trigger technical failures become 500.
  try {
    const result = await submitClarificationAnswers({
      runStatus: run.status,
      clarification: run.clarification as unknown as ClarificationRunState | null,
      rawPayload: { answers: b.answers },
      waitpoint,
    })

    if (!result.ok) {
      return Response.json(
        { error: result.error, ...(result.rejected ? { rejected: result.rejected } : {}) },
        { status: result.status }
      )
    }
    return Response.json(
      { status: "resuming", answersAccepted: result.answersAccepted },
      { status: 200 }
    )
  } catch {
    // Never leak token values or secrets; a technical waitpoint failure is a 500.
    return Response.json({ error: "Failed to submit answers" }, { status: 500 })
  }
}
