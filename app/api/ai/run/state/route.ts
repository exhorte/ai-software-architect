import { prisma } from "@/lib/prisma"
import { getAccessibleProject, getCurrentProjectIdentity } from "@/lib/project-access"

/**
 * Returns the current state of a pipeline run for the Pipeline UI tab:
 * phase, step, status, plan (for the stepper), clarification questions (when
 * WAITING_CLARIFICATION), and blockages. The caller only ever holds the public
 * triggerRunId — never the internal Run id.
 */
export async function GET(request: Request) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const runId = searchParams.get("runId")?.trim()
  if (!runId) return Response.json({ error: "Missing runId" }, { status: 400 })

  const run = await prisma.run.findFirst({ where: { triggerRunId: runId } })
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 })

  const project = await getAccessibleProject(run.projectId, identity)
  if (!project) return Response.json({ error: "Forbidden" }, { status: 403 })

  return Response.json({
    phase: run.phase,
    stepId: run.stepId,
    status: run.status,
    plan: run.plan,
    clarification: run.clarification,
    blockages: run.blockages,
    createdAt: run.createdAt,
  })
}
