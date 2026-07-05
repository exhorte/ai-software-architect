# Platform Development Workflow

> **Role**: How the platform is built: spec-driven increments, scoping rules, protected components, and doc-sync discipline. This is the *design-time* workflow (Claude Code + developers) — the runtime pipeline of the product is `../coordinator/workflow.md`.
> **Used**: When planning or executing any implementation step.
> **Read by**: Claude Code (as Coordinator of platform development) and developers.
> **Written by**: Platform architects.
> **Interacts with**: `../memory/project_state.md` + `../memory/handoff.md` (state to update), `architecture.md` (invariants to verify), `code_standards.md` (rules to apply).

## Approach

Build this platform incrementally using a spec-driven workflow. The context files in this brain define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

## Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.

## When To Split Work

Split an implementation step if it combines:

- UI changes and background task changes
- Real-time canvas state and database persistence
- Multiple unrelated API routes
- Behavior that is not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `../memory/project_state.md` before continuing.

## Protected Foundation Components

Do not modify generated third-party foundation components unless explicitly instructed:

- `components/ui/*` (shadcn/ui components)
- third-party library internals

Project-specific styling, layout changes, and feature logic must be implemented in app-level components instead of modifying foundation components.

## Keeping Docs In Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries → `architecture.md`
- Storage model decisions → `architecture.md` (+ `../memory/shared_memory.md` if the memory contract is affected)
- Code conventions or standards → `code_standards.md`
- Feature scope → `overview.md`

State must reflect the actual implementation, not the intended one: `../memory/project_state.md` for durable build state, `../memory/handoff.md` for the live session flow.

## Before Moving To The Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture.md` was violated.
3. `../memory/project_state.md` and `../memory/handoff.md` reflect the completed work.
