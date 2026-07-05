# AI Software Architect — Entry Point

This repository is a SaaS platform (working title: **AI Software Architect**) where a multi-agent AI software factory turns a project idea into a complete engineering deliverable: requirements, user stories, architecture, UML/C4/ERD diagrams, database schema, stack choice, roadmap, backlog, and exports. It is built on the Ghost AI foundation: Next.js 16, Clerk, Prisma/PostgreSQL, Liveblocks + React Flow canvas, Trigger.dev, Vercel Blob.

This file stays light on purpose. All knowledge lives in `.claude/context/` (the **brain**): the agent system in `coordinator/`, `agents/`, `memory/`, `prompts/`, `schemas/`, `templates/`, `rules/`, and the host application's implementation context in `platform/`. Agent prompts never belong here.

## Philosophy

1. **A software factory, not a chatbot.** Each responsibility is one specialized agent; a Coordinator plans, routes, validates, and composes. The Coordinator never produces content.
2. **Memory over messages.** Agents communicate only through a schema-validated Shared Memory document. Free-text handoffs between agents are defects.
3. **Traceability is the product.** Everything carries an ID and traces upstream: story → requirement → goal; component → requirement; test → acceptance criterion.
4. **Reuse before rebuild.** The existing canvas, realtime collaboration, auth, background-task, and storage layers are the delivery vehicle for the agent system — extend them, don't replace them.
5. **Long-term over short-term.** Simplicity is chosen deliberately (paid for by a requirement), decisions are recorded as ADRs, and one section has exactly one owner.

The full charter behind these principles: `.claude/context/project/development_manifesto.md`.

## The Two Planes

- **Design-time (you, Claude Code)**: when developing this platform, you act as the Coordinator of the work — plan, keep scope small, respect the context files, update state after each unit.
- **Run-time (the product)**: the deployed platform executes the same coordination model as Trigger.dev tasks; the agent files under `.claude/context/agents/` are the source of truth for runtime prompts.

## Context Loading

Load in this order, and only what the task needs (details: `.claude/context/memory/session_context.md`):

1. `.claude/context/memory/project_state.md` — current phase, decisions, next steps. **Always.**
2. `.claude/context/memory/handoff.md` — live session handoff: what was just done, what's in flight, immediate next action. **Always; keep it updated during the session and before closing it.**
3. `.claude/context/project/roadmap.md` — phase index and statuses; then load **only the current phase's** specification from `.claude/context/project/phases/`. Other phase files are loaded only when planning ahead or revising the cut.
4. Task-scoped:
   - Orchestration / pipeline work → `.claude/context/coordinator/`
   - Agent behavior → the specific `.claude/context/agents/<team>/<agent>.md` + `.claude/context/prompts/`
   - Data contracts → `.claude/context/schemas/` + `.claude/context/memory/shared_memory.md`
   - Naming / validation / coherence questions → `.claude/context/rules/`
   - Application code (UI, APIs, tasks, DB) → `.claude/context/platform/` (`architecture.md`, `ui.md`, `code_standards.md`, `dev_workflow.md`; product vision: `overview.md`)
5. Vocabulary doubts → `.claude/context/memory/glossary.md`.

## Global Rules

- Update `.claude/context/memory/project_state.md` after each meaningful implementation change; if a change alters architecture, scope, or standards, update the relevant context file *before* continuing.
- Work in small verifiable increments (scoping rules: `.claude/context/platform/dev_workflow.md`); never combine unrelated system boundaries in one step.
- Respect established grammar: IDs per `.claude/context/rules/naming.md`, structures per `.claude/context/schemas/`, terms per the glossary.
- Do not modify `components/ui/*` (shadcn) or third-party internals unless a task explicitly requires it.
- Next.js 16 has breaking changes — check `node_modules/next/dist/docs/` before writing framework-touching code. Trigger.dev v4 reference: the `.claude/skills/trigger-*` skills (full content in `.agents/skills/trigger-*`).

## The Coordinator Role

Whether at design-time or run-time, the Coordinator: classifies the request → builds a plan (`coordinator/planner.md`) → routes to agents (`coordinator/routing_rules.md`) → validates outputs (`rules/validation.md`) → enforces coherence (`rules/consistency.md`) → composes the response (`coordinator/workflow.md`). It produces no content itself. Any behavior change to this loop starts by editing the corresponding context file, never by ad-hoc code.
