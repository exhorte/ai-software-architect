/**
 * Cross-artifact consistency checks — the executable subset of
 * .claude/context/rules/consistency.md that Phase 3 owns (CON-01, CON-02).
 *
 * That file is the contract: each finding carries the rule id and the agent it
 * is routed to, so the engine can send it back to the owner instead of
 * silently patching it (rules/consistency.md § Enforcement). Later phases add
 * their own rules here; the shape stays the same.
 */
import type { WritableSectionKey } from "../memory/types"

export type ConsistencyRuleId = "CON-01" | "CON-02"

export interface ConsistencyFinding {
  rule: ConsistencyRuleId
  /** Human-readable violation, safe to append to an agent prompt. */
  detail: string
  /** Memory sections involved. */
  sections: WritableSectionKey[]
  /** The agent that must fix it (owner of the downstream section). */
  routedTo: string
}

interface RequirementLike {
  id?: unknown
  priority?: unknown
  title?: unknown
}

interface UserStoryLike {
  id?: unknown
  actor?: unknown
  requirements?: unknown
}

interface ActorLike {
  id?: unknown
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function idsOf(items: Array<{ id?: unknown }>): Set<string> {
  const set = new Set<string>()
  for (const item of items) {
    if (typeof item?.id === "string") set.add(item.id)
  }
  return set
}

/**
 * CON-01 — every `must` requirement is covered by at least one user story.
 * A must-priority need nobody plans to build is the classic silent gap.
 */
export function checkCon01(
  requirements: unknown,
  userStories: unknown
): ConsistencyFinding[] {
  const reqs = asArray<RequirementLike>(requirements)
  const stories = asArray<UserStoryLike>(userStories)

  const covered = new Set<string>()
  for (const story of stories) {
    for (const ref of asArray<unknown>(story.requirements)) {
      if (typeof ref === "string") covered.add(ref)
    }
  }

  const uncovered = reqs.filter(
    (r) => r.priority === "must" && typeof r.id === "string" && !covered.has(r.id)
  )
  if (uncovered.length === 0) return []

  const list = uncovered
    .map((r) => `${r.id}${typeof r.title === "string" ? ` ("${r.title}")` : ""}`)
    .join(", ")

  return [
    {
      rule: "CON-01",
      detail: `These must-priority requirements are covered by no user story: ${list}. Add at least one story per requirement.`,
      sections: ["userStories", "requirements"],
      routedTo: "business/user_story",
    },
  ]
}

/**
 * CON-02 — every story references only requirements and actors that exist.
 * Dangling references break the traceability spine.
 */
export function checkCon02(
  userStories: unknown,
  requirements: unknown,
  actors: unknown
): ConsistencyFinding[] {
  const stories = asArray<UserStoryLike>(userStories)
  const knownReqs = idsOf(asArray<RequirementLike>(requirements))
  const knownActors = idsOf(asArray<ActorLike>(actors))

  const problems: string[] = []
  for (const story of stories) {
    const storyId = typeof story.id === "string" ? story.id : "(story without id)"

    const badReqs = asArray<unknown>(story.requirements).filter(
      (r) => typeof r === "string" && !knownReqs.has(r)
    )
    if (badReqs.length > 0) {
      problems.push(`${storyId} references unknown requirement(s): ${badReqs.join(", ")}`)
    }

    if (typeof story.actor === "string" && !knownActors.has(story.actor)) {
      problems.push(`${storyId} references unknown actor: ${story.actor}`)
    }
  }
  if (problems.length === 0) return []

  return [
    {
      rule: "CON-02",
      detail: `Stories reference identifiers that do not exist. ${problems.join("; ")}. Use only existing REQ-* and ACT-* ids.`,
      sections: ["userStories"],
      routedTo: "business/user_story",
    },
  ]
}

/** All Business-phase consistency rules, run together. */
export function checkBusinessConsistency(sections: {
  requirements?: unknown
  userStories?: unknown
  actors?: unknown
}): ConsistencyFinding[] {
  return [
    ...checkCon01(sections.requirements, sections.userStories),
    ...checkCon02(sections.userStories, sections.requirements, sections.actors),
  ]
}
