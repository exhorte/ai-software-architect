# Consistency Rules

> **Role**: The cross-artifact coherence contract — the spec of the Consistency Validator step. Guarantees the deliverable is one coherent design, not a stack of locally-plausible documents.
> **Used**: At phase gates (scoped subset) and in full during the VALIDATION phase.
> **Read by**: Orchestrator/validator; agents receive violations routed to them.
> **Written by**: Platform architects. Every new section/agent must register its ownership and its coherence rules here.
> **Interacts with**: `validation.md` (runs first; consistency assumes well-formed sections), `../coordinator/planner.md` (violations drive replans), `../coordinator/routing_rules.md` (ownership must match routing).

## Section Ownership Map

The authority table for conflict resolution: when two sections disagree, the *owner of the upstream section* is the source of truth, and the downstream section is the one that must change.

```
project, actors, clarifications        → business/analyst
entities, businessRules                → business/domain_expert
requirements (REQ-F/N)                 → business/requirements
requirements (REQ-S)                   → architecture/security_architect
userStories                            → business/user_story
architecture.{style,components,adrs}   → architecture/solution_architect
architecture.uml                       → architecture/uml_architect
architecture.c4                        → architecture/c4_architect
database                               → architecture/database_architect
security                               → architecture/security_architect
api                                    → engineering/api_designer
stack                                  → architecture/solution_architect
engineering.backend / .frontend        → engineering/backend_architect / frontend_architect
engineering.devops                     → engineering/devops
engineering.testStrategy               → engineering/qa
roadmap, backlog                       → documentation/roadmap
documentation.*                        → documentation team (per subsection)
runState                               → Orchestrator
```

Upstream direction: `project/actors` → `entities/requirements` → `userStories` → `architecture` → `database/security/api/stack` → `engineering` → `roadmap/documentation`.

## Cross-Artifact Rules

| ID | Rule | Violation routed to |
| --- | --- | --- |
| CON-01 | Every `must` requirement is covered by ≥1 user story | user_story |
| CON-02 | Every story references only existing requirements/actors | user_story |
| CON-03 | Every component maps to ≥1 requirement; every `must` functional requirement maps to ≥1 component | solution_architect |
| CON-04 | Every entity appears in `database.tables` or `database.notPersisted` | database_architect |
| CON-05 | Diagram elements only project existing memory IDs (`memoryRef` resolves) | uml_architect / c4_architect |
| CON-06 | C4 levels are zoom-consistent: every component in exactly one container; containers agree with `database.engine` and deployment topology | c4_architect / devops |
| CON-07 | Every `must` functional requirement is `exposed` via ≥1 API operation or marked `internal` | api_designer |
| CON-08 | API payload `$entity` fields reference existing entities/attributes | api_designer |
| CON-09 | Frontend routes call only existing API operations; route auth agrees with the authorization matrix | frontend_architect |
| CON-10 | Every `sensitive` data classification has ≥1 mitigating `REQ-S-*` or accepted threat | security_architect |
| CON-11 | Every `REQ-S-*` and quantified NFR appears in `engineering.testStrategy.coverage` (or `gaps` with reason) | qa |
| CON-12 | Every `must`/`should` story is scheduled in exactly one roadmap phase; backlog respects the dependency graph | roadmap |
| CON-13 | `stack` entries cite an ADR or a user constraint; no ADR is contradicted by a later section without superseding it | solution_architect |
| CON-14 | Every diagram has a `documentation.diagrams` narrative | diagram_documenter |
| CON-15 | Glossary discipline: one name per concept across sections (heuristic: same `memoryRef`, different display names) | owning agent of the newer section |

## Enforcement

- Violations are structured findings: `{ rule: "CON-04", detail, sections, routedTo }`.
- The Orchestrator routes each finding to the `routedTo` agent as a retry/replan step — **the downstream owner adapts; upstream content changes only via a `REVISION` intent** (which re-triggers the invalidation map in `../coordinator/planner.md`).
- Findings the user explicitly accepts are recorded in `runState` with the acceptance, and reported in every subsequent export until resolved.
- A VALIDATION phase with zero unaccepted findings is the definition of a coherent deliverable.
