import { tasks } from "@trigger.dev/sdk/v3"

import { prisma } from "@/lib/prisma"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"
import type { pipelineOrchestrator } from "@/trigger/orchestrator"

const MAX_IDEA_LENGTH = 8_000

/**
 * Launches a Business-pipeline run for a project. Thin: it authenticates,
 * checks project access, validates input, triggers the canonical
 * pipeline-orchestrator task, and records ownership on a TaskRun so the token
 * route can later scope a realtime token to this run. The orchestrator task
 * creates its own Run row; this route never touches pipeline state.
 */
export async function POST(request: Request) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  if (body === null || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : ""
  const idea = typeof b.idea === "string" ? b.idea.trim() : ""

  if (!projectId) return Response.json({ error: "Missing projectId" }, { status: 400 })
  if (!idea) return Response.json({ error: "Missing idea" }, { status: 400 })
  if (idea.length > MAX_IDEA_LENGTH) {
    return Response.json({ error: "Idea is too long" }, { status: 400 })
  }

  // Ownership: never launch a run against a project the caller cannot access.
  const project = await getAccessibleProject(projectId, identity)
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 })

  const handle = await tasks.trigger<typeof pipelineOrchestrator>("pipeline-orchestrator", {
    projectId: project.id,
    userId: identity.userId,
    idea,
  })

  await prisma.taskRun.create({
    data: { runId: handle.id, projectId: project.id, userId: identity.userId },
  })

  // Only the public tracking id — no secrets, no internal Run id.
  return Response.json({ runId: handle.id }, { status: 201 })
}
