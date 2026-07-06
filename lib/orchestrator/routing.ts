/**
 * Routing table — executable mirror of .claude/context/coordinator/routing_rules.md.
 * That file is the contract; when the two disagree, fix the contract first,
 * then this table (development_manifesto.md).
 *
 * `preconditions` are the memory sections that must exist (draft within the
 * same phase, valid otherwise) before the step may run — the "Preconditions"
 * column of the routing table.
 */
import type { WritableSectionKey } from "../memory/types"
import type { AgentPhase } from "./types"

export interface Route {
  phase: AgentPhase
  agent: string
  preconditions: WritableSectionKey[]
  writes: WritableSectionKey[]
  /** Steps sharing a group run concurrently (disjoint writes enforced by plan validation). */
  parallelGroup: string | null
  /** Step ids (by agent) this step must wait for within its phase. */
  afterAgents?: string[]
}

export const ROUTING_TABLE: Route[] = [
  {
    phase: "INTAKE",
    agent: "business/analyst",
    preconditions: ["project"],
    writes: ["project", "actors", "clarifications"],
    parallelGroup: null,
  },
  {
    phase: "CLARIFICATION",
    agent: "business/analyst",
    preconditions: ["clarifications"],
    writes: ["clarifications", "project"],
    parallelGroup: null,
  },
  {
    phase: "REQUIREMENTS",
    agent: "business/domain_expert",
    preconditions: ["project", "actors"],
    writes: ["entities", "businessRules"],
    parallelGroup: "REQ-A",
  },
  {
    phase: "REQUIREMENTS",
    agent: "business/requirements",
    preconditions: ["project", "actors"],
    writes: ["requirements"],
    parallelGroup: "REQ-A",
  },
  {
    phase: "REQUIREMENTS",
    agent: "business/user_story",
    preconditions: ["requirements", "actors"],
    writes: ["userStories"],
    parallelGroup: null,
    afterAgents: ["business/requirements"],
  },
  {
    phase: "ARCHITECTURE",
    agent: "architecture/solution_architect",
    preconditions: ["requirements", "entities"],
    writes: ["architecture.style", "architecture.components", "architecture.adrs", "stack"],
    parallelGroup: null,
  },
  {
    phase: "ARCHITECTURE",
    agent: "architecture/uml_architect",
    preconditions: ["entities", "userStories", "architecture.components"],
    writes: ["architecture.uml"],
    parallelGroup: "ARCH-A",
    afterAgents: ["architecture/solution_architect"],
  },
  {
    phase: "ARCHITECTURE",
    agent: "architecture/c4_architect",
    preconditions: ["architecture.components", "actors"],
    writes: ["architecture.c4"],
    parallelGroup: "ARCH-A",
    afterAgents: ["architecture/solution_architect"],
  },
  {
    phase: "ARCHITECTURE",
    agent: "architecture/database_architect",
    preconditions: ["entities", "architecture.style"],
    writes: ["database"],
    parallelGroup: "ARCH-A",
    afterAgents: ["architecture/solution_architect"],
  },
  {
    phase: "ARCHITECTURE",
    agent: "architecture/security_architect",
    preconditions: ["architecture.components", "actors", "requirements"],
    writes: ["security", "requirements"],
    parallelGroup: "ARCH-A",
    afterAgents: ["architecture/solution_architect"],
  },
  {
    phase: "ENGINEERING",
    agent: "engineering/api_designer",
    preconditions: ["architecture.components", "userStories", "entities"],
    writes: ["api"],
    parallelGroup: null,
  },
  {
    phase: "ENGINEERING",
    agent: "engineering/backend_architect",
    preconditions: ["architecture.components", "database", "stack"],
    writes: ["engineering.backend"],
    parallelGroup: "ENG-B",
    afterAgents: ["engineering/api_designer"],
  },
  {
    phase: "ENGINEERING",
    agent: "engineering/frontend_architect",
    preconditions: ["userStories", "api", "stack"],
    writes: ["engineering.frontend"],
    parallelGroup: "ENG-B",
    afterAgents: ["engineering/api_designer"],
  },
  {
    phase: "ENGINEERING",
    agent: "engineering/devops",
    preconditions: ["architecture.components", "stack"],
    writes: ["engineering.devops"],
    parallelGroup: "ENG-B",
    afterAgents: ["engineering/api_designer"],
  },
  {
    phase: "ENGINEERING",
    agent: "engineering/qa",
    preconditions: ["requirements", "userStories", "api"],
    writes: ["engineering.testStrategy"],
    parallelGroup: null,
    afterAgents: ["engineering/backend_architect", "engineering/frontend_architect", "engineering/devops"],
  },
  {
    phase: "DOCUMENTATION",
    agent: "documentation/roadmap",
    preconditions: ["userStories", "engineering.testStrategy"],
    writes: ["roadmap", "backlog"],
    parallelGroup: "DOC-C",
  },
  {
    phase: "DOCUMENTATION",
    agent: "documentation/technical_writer",
    preconditions: ["project", "architecture.adrs", "api"],
    writes: ["documentation.readme", "documentation.technical", "documentation.api"],
    parallelGroup: "DOC-C",
  },
  {
    phase: "DOCUMENTATION",
    agent: "documentation/diagram_documenter",
    preconditions: ["architecture.uml", "architecture.c4", "database"],
    writes: ["documentation.diagrams"],
    parallelGroup: "DOC-C",
  },
]

/** Reads contract per step = its preconditions (the planner may narrow, never widen). */
export function routesForPhase(phase: AgentPhase): Route[] {
  return ROUTING_TABLE.filter((route) => route.phase === phase)
}
