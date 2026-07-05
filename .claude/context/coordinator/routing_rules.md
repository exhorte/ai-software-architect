# Routing Rules

> **Role**: The deterministic table that maps workflow phases to agents. The only legal source of "which agent handles this".
> **Used**: By the planner when building plans and by the Orchestrator when validating them.
> **Read by**: Orchestrator/planner only.
> **Written by**: Platform architects. Adding an agent to the system requires adding a row here — an agent without a route is dead code.
> **Interacts with**: `workflow.md` (phases referenced here), `../agents/**` (targets), `../rules/consistency.md` (section ownership must match the `Writes` column).

## Phase → Agent Routing

| Phase | Agent(s) | Preconditions (memory sections that must exist and be `valid`) | Writes (owned sections) | Parallel? |
| --- | --- | --- | --- | --- |
| INTAKE | `business/analyst` | — | `project`, `actors`, `clarifications` | no |
| CLARIFICATION | `business/analyst` | `clarifications` with unanswered items | `clarifications`, `project` | no |
| REQUIREMENTS | `business/domain_expert` | `project`, `actors` | `entities`, `businessRules`, glossary terms | no |
| REQUIREMENTS | `business/requirements` | `project`, `actors` | `requirements` | with domain_expert |
| REQUIREMENTS | `business/user_story` | `requirements`, `actors` | `userStories` | no (after requirements) |
| ARCHITECTURE | `architecture/solution_architect` | `requirements`, `entities` | `architecture.style`, `architecture.components`, `architecture.adrs`, `stack` | no |
| ARCHITECTURE | `architecture/uml_architect` | `entities`, `userStories`, `architecture.components` | `architecture.uml` | yes, group A |
| ARCHITECTURE | `architecture/c4_architect` | `architecture.components`, `actors` | `architecture.c4` | yes, group A |
| ARCHITECTURE | `architecture/database_architect` | `entities`, `architecture.style` | `database` | yes, group A |
| ARCHITECTURE | `architecture/security_architect` | `architecture.components`, `actors`, `requirements` | `security`, security items appended to `requirements` | yes, group A |
| ENGINEERING | `engineering/api_designer` | `architecture.components`, `userStories`, `entities` | `api` | yes, group B |
| ENGINEERING | `engineering/backend_architect` | `architecture`, `database`, `stack` | `engineering.backend` | yes, group B |
| ENGINEERING | `engineering/frontend_architect` | `userStories`, `api`, `stack` | `engineering.frontend` | yes, group B (after api_designer) |
| ENGINEERING | `engineering/devops` | `architecture`, `stack` | `engineering.devops` | yes, group B |
| ENGINEERING | `engineering/qa` | `requirements`, `userStories`, `api` | `engineering.testStrategy` | no (last in phase) |
| DOCUMENTATION | `documentation/roadmap` | all upstream sections `valid` | `roadmap`, `backlog` | yes, group C |
| DOCUMENTATION | `documentation/technical_writer` | all upstream sections `valid` | `documentation.readme`, `documentation.technical`, `documentation.api` | yes, group C |
| DOCUMENTATION | `documentation/diagram_documenter` | `architecture.uml`, `architecture.c4`, `database.erd` | `documentation.diagrams` | yes, group C |
| EXPORT | `documentation/exporter` | requested sections `valid` | `documentation.exports` | no |

## Hard Rules

1. **One owner per section.** A memory section is written by exactly one agent per run (see ownership map in `../rules/consistency.md`). The `security_architect` appending to `requirements` is the single sanctioned exception, and appends are namespaced `REQ-S-*`.
2. **No skipping phases** for `NEW_PROJECT` intents. `REFINEMENT` intents may enter mid-pipeline only if all preconditions of the entry phase are `valid`.
3. **No agent-to-agent calls.** Agents never invoke other agents; all sequencing flows through the Orchestrator.
4. **Business Team never reads engineering sections.** Upstream teams must stay implementation-agnostic; this prevents solution bias in requirements.
5. **Validator and Composer are not routable agents.** Consistency validation (`../rules/consistency.md`) and response composition (`workflow.md` § Response Composer) are Orchestrator-driven steps, not team members.

## Extension Protocol

To add an agent: create its file under `../agents/<team>/`, declare its Reads/Writes contract, add its row here, add its section (if new) to `../schemas/project.schema.json`, and register ownership in `../rules/consistency.md`. All four or the agent is not integrated.
