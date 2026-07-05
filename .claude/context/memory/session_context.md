# Session Context

> **Role**: Defines what context is loaded, by whom, and when — for both planes of the system: Claude Code development sessions and runtime agent invocations. Exists to keep every prompt minimal and every session reproducible.
> **Used**: At session start (Claude Code) and at every agent invocation (runtime).
> **Read by**: Claude Code, Orchestrator runtime.
> **Written by**: Platform architects.
> **Interacts with**: Root `CLAUDE.md` (declares the loading order), `shared_memory.md` (scoped reads), `../coordinator/planner.md` (step-level context selection).

## Plane 1 — Claude Code Development Sessions

Loading order when working on the platform:

1. Root `CLAUDE.md` — philosophy, global rules (auto-loaded).
2. `memory/project_state.md` — where the build is.
3. The context files relevant to the task, and only those:
   - Orchestration work → `coordinator/*`
   - Agent behavior work → the specific `agents/<team>/<agent>.md` + `prompts/*`
   - Data model work → `schemas/*` + `shared_memory.md`
   - App/UI work → `../platform/` (architecture, UI, code standards, dev workflow)
4. Never bulk-load the whole `agents/` tree; agent files are independent by design.

Session end: update `project_state.md` if anything meaningful changed.

## Plane 2 — Runtime Agent Invocations

An agent invocation prompt is assembled from exactly four layers, in order:

| Layer | Source | Size discipline |
| --- | --- | --- |
| 1. Agent definition | `../agents/<team>/<agent>.md` | Static, versioned |
| 2. Transversal rules | `../prompts/response_rules.md` (+ `output_formats.md` / `coding_rules.md` only if the agent produces diagrams / code) | Static |
| 3. Memory slice | Only the sections in the step's `reads` list, as JSON | Bounded by contract |
| 4. Step instruction | The plan step: task, expected `writes`, prior validation errors on retry | Small |

Nothing else enters an agent prompt. In particular:

- No chat history — the memory *is* the history. If a fact matters, it lives in a section.
- No other agents' raw outputs — only committed, validated memory.
- No orchestrator internals — agents don't know the plan, the phase list, or other agents' existence beyond their declared collaborations.

## Ephemeral vs. Persistent

| Data | Lifetime |
| --- | --- |
| Shared Memory document | Persistent per project (versioned) |
| Plan + `runState` | Persistent per run, archived at run end |
| Agent invocation prompts/outputs | Ephemeral — reproducible from memory + plan, logged for observability only |
| Clarification answers | Persistent — committed into `clarifications` and `project.assumptions` |

## Context Budget Rules

- An agent's memory slice should stay under ~30% of its context window; if a section is too large (e.g. hundreds of stories), the planner passes the relevant subset by IDs plus a summary — subsetting is a planner responsibility, not an agent's.
- Rendered artifacts (final Markdown docs, exports) are never fed back into agents; agents consume the structured sections they were rendered from.
