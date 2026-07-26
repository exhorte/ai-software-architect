import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { MemoryStore, PrismaPersistence } from "@/lib/memory"

/**
 * GET /api/projects/[projectId]/memory
 *
 * Returns the Business Team section of the Shared Memory document:
 * project brief, actors, clarifications, entities, business rules,
 * requirements, user stories — each with its lifecycle status from
 * runState.sectionStatus.
 *
 * Read-only; never writes. Auth gating matches the project-access
 * pattern: 401 (unauthenticated), 403 (no access), 404 (no memory doc).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId } = await ctx.params

  // Project must exist and the caller must have access.
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
  })
  if (!project) return Response.json({ error: "Forbidden" }, { status: 403 })

  const store = new MemoryStore(new PrismaPersistence())
  const memory = await store.getMemory(projectId)
  if (!memory) return Response.json({ error: "No memory document" }, { status: 404 })

  const sectionStatus = memory.runState.sectionStatus ?? {}

  return Response.json({
    project: memory.project ?? null,
    actors: memory.actors ?? null,
    clarifications: memory.clarifications ?? null,
    entities: memory.entities ?? null,
    businessRules: memory.businessRules ?? null,
    requirements: memory.requirements ?? null,
    userStories: memory.userStories ?? null,
    runState: {
      phase: memory.runState.phase,
      intent: memory.runState.intent ?? null,
      sectionStatus,
      blockages: memory.runState.blockages ?? null,
    },
  })
}
