# Planner

> **Role**: Defines how the Orchestrator turns a user request into an executable plan.
> **Used**: Once at run start, and whenever a replan trigger fires.
> **Read by**: The Orchestrator only. Agents never see the plan — they see only their own step inputs.
> **Written by**: Platform architects.
> **Interacts with**: `orchestrator.md` (who executes the plan), `routing_rules.md` (which agents are legal for each step), `workflow.md` (phase ordering the plan must respect).

## Request Classification

Every incoming request is classified into exactly one intent before planning:

| Intent | Signal | Plan shape |
| --- | --- | --- |
| `NEW_PROJECT` | No Shared Memory exists for this project | Full pipeline (all phases of `workflow.md`) |
| `REVISION` | Memory exists; user changes scope, requirements, or constraints | Partial pipeline starting at the earliest affected phase |
| `REFINEMENT` | Memory exists; user adjusts one artifact without changing upstream facts | Single-team plan + validation |
| `QUESTION` | User asks about existing artifacts, no mutation | Read-only plan: retrieve + compose, no agents mutate memory |
| `EXPORT` | User requests deliverables | Documentation Team only |

If classification is ambiguous, plan a single clarification step — never guess between `REVISION` and `REFINEMENT`, because they invalidate different downstream sections.

## Plan Format

A plan is a JSON array of steps. Each step is the only thing an agent invocation ever receives besides its memory sections.

```json
{
  "runId": "run_2026-07-05_001",
  "intent": "NEW_PROJECT",
  "steps": [
    {
      "id": "step-01",
      "agent": "business/analyst",
      "phase": "INTAKE",
      "reads": ["project"],
      "writes": ["project", "actors", "clarifications"],
      "dependsOn": [],
      "parallelGroup": null
    }
  ]
}
```

Rules:

- `agent` must be a valid agent path under `../agents/`.
- `reads` / `writes` must be a subset of that agent's declared contract in its agent file. The planner may narrow a contract, never widen it.
- Steps with disjoint `writes` and satisfied `dependsOn` may share a `parallelGroup` (e.g. `uml_architect`, `database_architect`, `security_architect` after `solution_architect`).
- Two steps writing the same section can never be parallel.

## Invalidation Map (for REVISION plans)

When upstream sections change, downstream sections become stale and must be re-planned:

| Changed section | Invalidates |
| --- | --- |
| `project`, `actors` | everything downstream |
| `requirements`, `userStories` | `architecture`, `database`, `api`, `stack`, `roadmap`, `documentation` |
| `entities` | `architecture.uml`, `database`, `api` |
| `architecture` | `database` (topology), `api`, `stack`, `roadmap`, `documentation` |
| `database`, `api`, `stack` | `roadmap`, `documentation` |

Stale sections are marked `status: "stale"` in Shared Memory; the plan must include steps that regenerate every stale section or explicitly record why it was left untouched.

## Replan Triggers

- A clarification answer changes a section already consumed by a completed step.
- A validation gate fails twice on the same section.
- An agent reports (in its output envelope `issues`) that its input contract cannot be satisfied.

Replanning reuses everything still valid — never restart a run from scratch when memory sections are intact.
