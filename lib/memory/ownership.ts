/**
 * Section ownership: exactly one writing agent per section key.
 *
 * This table is the executable mirror of the ownership map in
 * .claude/context/rules/consistency.md — that file is the contract; when the
 * two disagree, fix the contract first, then this table (development_manifesto.md).
 */
import type { MemoryDocument, SectionWrites, ValidationError, WritableSectionKey } from "./types"

export const ORCHESTRATOR_AGENT_ID = "orchestrator"

export const SECTION_OWNERS: Record<WritableSectionKey, string> = {
  project: "business/analyst",
  clarifications: "business/analyst",
  actors: "business/analyst",
  entities: "business/domain_expert",
  businessRules: "business/domain_expert",
  requirements: "business/requirements",
  userStories: "business/user_story",
  "architecture.style": "architecture/solution_architect",
  "architecture.components": "architecture/solution_architect",
  "architecture.adrs": "architecture/solution_architect",
  "architecture.uml": "architecture/uml_architect",
  "architecture.c4": "architecture/c4_architect",
  database: "architecture/database_architect",
  security: "architecture/security_architect",
  api: "engineering/api_designer",
  stack: "architecture/solution_architect",
  "engineering.backend": "engineering/backend_architect",
  "engineering.frontend": "engineering/frontend_architect",
  "engineering.devops": "engineering/devops",
  "engineering.testStrategy": "engineering/qa",
  roadmap: "documentation/roadmap",
  backlog: "documentation/roadmap",
  "documentation.readme": "documentation/technical_writer",
  "documentation.technical": "documentation/technical_writer",
  "documentation.api": "documentation/technical_writer",
  "documentation.diagrams": "documentation/diagram_documenter",
  "documentation.exports": "documentation/exporter",
  runState: ORCHESTRATOR_AGENT_ID,
}

const SECURITY_ARCHITECT = "architecture/security_architect"
const SECURITY_REQUIREMENT_ID = /^REQ-S-\d{3,}$/

type RequirementItem = { id?: unknown }

/**
 * The single sanctioned cross-ownership write (routing_rules.md § Hard Rules):
 * the security architect may APPEND REQ-S-* items to `requirements`.
 * Existing items must be untouched and every new item must be REQ-S-*.
 */
function isSanctionedSecurityAppend(current: unknown, proposed: unknown): boolean {
  const before = Array.isArray(current) ? (current as RequirementItem[]) : []
  if (!Array.isArray(proposed)) return false
  const after = proposed as RequirementItem[]

  if (after.length < before.length) return false

  const untouched = before.every(
    (item, index) => JSON.stringify(item) === JSON.stringify(after[index])
  )
  if (!untouched) return false

  return after
    .slice(before.length)
    .every((item) => typeof item.id === "string" && SECURITY_REQUIREMENT_ID.test(item.id))
}

/**
 * Checks that `agentId` owns every key it proposes to write.
 * The orchestrator may write any section (it is the only committer and owns
 * runState); agents are restricted to their contract.
 */
export function checkOwnership(
  agentId: string,
  writes: SectionWrites,
  currentDocument: MemoryDocument
): ValidationError[] {
  if (agentId === ORCHESTRATOR_AGENT_ID) return []

  const errors: ValidationError[] = []

  for (const key of Object.keys(writes) as WritableSectionKey[]) {
    const owner = SECTION_OWNERS[key]

    if (owner === undefined) {
      errors.push({
        level: 1,
        section: key,
        path: `/${key.replace(".", "/")}`,
        rule: "unknown-section",
        message: `"${key}" is not a writable Shared Memory section.`,
      })
      continue
    }

    if (owner === agentId) continue

    if (
      key === "requirements" &&
      agentId === SECURITY_ARCHITECT &&
      isSanctionedSecurityAppend(currentDocument.requirements, writes[key])
    ) {
      continue
    }

    errors.push({
      level: 1,
      section: key,
      path: `/${key.replace(".", "/")}`,
      rule: "section-ownership",
      message: `Agent "${agentId}" does not own section "${key}" (owner: "${owner}").`,
    })
  }

  return errors
}
