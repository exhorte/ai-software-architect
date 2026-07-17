import { auth as triggerAuth } from "@trigger.dev/sdk/v3"

import { prisma } from "@/lib/prisma"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

const TOKEN_TTL = "1h"

/**
 * Issues a short-lived public token scoped to a single run, for realtime
 * tracking in the browser (useRealtimeRun). Server-only: the TRIGGER_SECRET_KEY
 * never leaves the server; the client only ever receives the scoped token.
 */
export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  const runId =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).runId === "string"
      ? ((body as Record<string, unknown>).runId as string).trim()
      : ""
  if (!runId) return Response.json({ error: "Missing runId" }, { status: 400 })

  const taskRun = await prisma.taskRun.findUnique({ where: { runId } })
  if (!taskRun) return Response.json({ error: "Run not found" }, { status: 404 })

  // The run must belong to a project this user can access.
  const project = await getAccessibleProject(taskRun.projectId, identity)
  if (!project) return Response.json({ error: "Forbidden" }, { status: 403 })

  const token = await triggerAuth.createPublicToken({
    scopes: { read: { runs: [runId] } },
    expirationTime: TOKEN_TTL,
  })

  return Response.json({ token })
}
