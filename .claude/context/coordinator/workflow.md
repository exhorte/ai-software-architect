# Workflow

> **Role**: The canonical end-to-end pipeline: phases, their exit gates, the clarification loop, and final response composition.
> **Used**: By the planner to order steps; by the Orchestrator to decide when a phase may close.
> **Read by**: Orchestrator/planner. Individual agents see only their own phase.
> **Written by**: Platform architects.
> **Interacts with**: `routing_rules.md` (who runs in each phase), `../rules/validation.md` + `../rules/consistency.md` (gate mechanics), `../prompts/output_formats.md` (response composition formats).

## Canonical Pipeline

```
Idea (user)
  → INTAKE            business analysis: what is this project, who is it for
  → CLARIFICATION     targeted questions, only if blocking ambiguity exists
  → REQUIREMENTS      domain model + requirements + user stories
  → ARCHITECTURE      style, components, ADRs, UML, C4, ERD, security, stack
  → ENGINEERING       API contract, backend/frontend structure, devops, tests
  → DOCUMENTATION     roadmap, backlog, README, tech docs, diagram narratives
  → VALIDATION        cross-artifact consistency sweep
  → COMPOSE           assemble user-facing response / deliverables
```

## Phase Gates

A phase closes only when its gate passes. Gates are checked by the Orchestrator using `../rules/validation.md` (structural) and `../rules/consistency.md` (cross-artifact).

| Phase | Exit gate |
| --- | --- |
| INTAKE | `project` has name, description, goals, scope; `actors` non-empty; blocking ambiguities extracted into `clarifications` |
| CLARIFICATION | Zero unanswered `blocking: true` clarifications (non-blocking ones may carry forward as assumptions, recorded in `project.assumptions`) |
| REQUIREMENTS | Every requirement has an ID, priority, and ≥1 linked actor or goal; every user story maps to ≥1 requirement; entities have unique names |
| ARCHITECTURE | `architecture.style` chosen with ≥1 ADR justifying it; every component maps to ≥1 requirement; ERD covers every entity; security review recorded |
| ENGINEERING | Every functional requirement is covered by ≥1 API operation or explicitly marked `internal`; test strategy references every priority-`must` requirement |
| DOCUMENTATION | Roadmap phases cover the full backlog; every diagram has a narrative |
| VALIDATION | All rules in `../rules/consistency.md` pass, or violations are user-acknowledged |

## Clarification Loop

The only human-in-the-loop pause in the standard pipeline.

- Questions come exclusively from `business/analyst` (max 5 per round, ranked by impact, closed questions preferred — see that agent's contract).
- Each question carries `blocking: true|false`. Only blocking questions pause the run.
- Unanswered non-blocking questions become explicit **assumptions**: written to `project.assumptions`, surfaced in the final response, and treated as revision points.
- Maximum 2 clarification rounds per run; beyond that, remaining ambiguity converts to assumptions. The pipeline must always terminate.

## Response Composer

The final step of every run. Orchestrator-driven (not an agent — see `routing_rules.md` § Hard Rules).

1. Select sections relevant to the user's intent (a `QUESTION` run does not dump the whole memory).
2. Render them using `../prompts/output_formats.md` (user-facing Markdown; diagrams via their canvas/Mermaid projections).
3. Prepend: what was produced, what was assumed (`project.assumptions`), what is blocked or stale, and the recommended next action.
4. Never invent content at composition time — the Composer formats memory, it does not create.

## Future Workflows

This file defines the *default* pipeline. Additional workflows (architecture review, reverse engineering of an existing codebase, code generation) must be added as named workflows in this file with their own phase list and gates, reusing existing phases where possible. The state machine in `orchestrator.md` is workflow-agnostic by design.
