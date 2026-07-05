# Project State

> **Role**: The living build-state of the *platform itself* — what has been built, what is in progress, what was decided. Successor to the legacy `context/progress-tracker.md`.
> **Used**: Loaded at the start of every Claude Code working session; updated after every meaningful implementation change.
> **Read by**: Claude Code (as Coordinator of platform development) and human developers.
> **Written by**: Claude Code / developers at the end of each unit of work. This is the only file in `memory/` that tracks *our* build, not a user's project.
> **Format**: Markdown with fixed sections below. Keep entries dated and condensed — one line per completed unit; details belong in git history.
> **Interacts with**: Root `context/` files (app implementation context), `../coordinator/workflow.md` (target behavior being built).

## Product

**AI Software Architect** (working title) — a SaaS platform where a multi-agent AI software factory transforms a project idea into a complete engineering deliverable: requirements, user stories, architecture, UML/C4/ERD diagrams, database schema, stack choice, roadmap, backlog, and exports.

Built on the Ghost AI foundation (Next.js 16, Clerk, Prisma/PostgreSQL, Liveblocks + React Flow canvas, Trigger.dev tasks, Vercel Blob).

## Current Phase

- **Phase 0 — Foundations of the agent system**: ✅ complete (2026-07-05). Brain in place, entry points rewritten, legacy artifacts cleaned up (user-approved), git history started (`4a0365d` snapshot → `17ef040` cleanup). Application code unchanged.
- **Phase 1 — Shared Memory runtime**: not started.

## Transformation Roadmap

1. **Phase 0 — Brain** ✅ `.claude/context/` knowledge base, coordinator spec, agent contracts, schemas, rules.
2. **Phase 1 — Shared Memory runtime**: Prisma model + persistence adapter for the project memory document; schema validation module.
3. **Phase 2 — Orchestrator runtime**: Trigger.dev orchestrator task implementing the state machine of `../coordinator/orchestrator.md`; agent invocation as child tasks loading prompts from `../agents/`.
4. **Phase 3 — Business Team** end-to-end (idea → clarifications → requirements → stories) surfaced in the existing AI sidebar.
5. **Phase 4 — Architecture Team** with canvas projection of UML/C4/ERD reusing the existing design-agent canvas writer.
6. **Phase 5 — Engineering + Documentation Teams**, exports replacing the current single-shot spec generator.
7. **Phase 6 — Multi-LLM abstraction, additional workflows** (review, reverse engineering).

## Inherited Foundation (Ghost AI, features 01–29 — all complete)

Auth (Clerk), project CRUD + collaborators, real-time canvas (Liveblocks + React Flow: shapes, colors, resize, edges, presence, cursors, undo/redo, templates, autosave to Vercel Blob), AI design agent (Gemini tool-calling → canvas mutations via Liveblocks Node SDK), AI spec generator (canvas + chat → Markdown spec → Blob + Prisma record, download API), AI sidebar with realtime run tracking (Trigger.dev react-hooks). Detailed history: `context/progress-tracker.md` (archived).

## Decisions Log

- 2026-07-05 — `.claude/context/` is the single knowledge base of the agent system; root `context/` remains the implementation context of the host application. Root `CLAUDE.md` stays the entry point because Claude Code auto-loads it.
- 2026-07-05 — Agent definition files are the *source of truth for runtime prompts*: the future orchestrator loads/compiles them, so design-time docs and runtime behavior cannot drift.
- 2026-07-05 — Inter-agent exchanges are schema-validated JSON only (`schemas/`); the existing free-text spec generator will be decomposed into Documentation Team agents in Phase 5.
- 2026-07-05 — Existing `design-agent` canvas conventions (shapes, color semantics, layout) promoted to system-wide diagram projection rules in `../prompts/output_formats.md`.
- 2026-07-05 — Git initialized (repo had none); safety snapshot `4a0365d` taken, then user-approved cleanup: removed `context/feature-specs/`, `context/screenshots/`, `docs/superpowers/`, `public/readme/`, `public/thumbnails/`; README rewritten for the new product (`17ef040`). Deleted content remains recoverable from the snapshot commit.
- 2026-07-05 — `memory/handoff.md` added as the live session-handoff journal (French, always loaded per `CLAUDE.md` § Context Loading); durable state stays here, session flow lives there.
- 2026-07-05 — `.claude/settings.json` allowlist (lint, build, `tsc --noEmit`, `prisma validate/format`) approved explicitly by the user.

## In Progress

- None.

## Open Questions

- Final product name (placeholder: **AI Software Architect**) — rename `package.json` (`ghost-ai`) at the same time.
- Create a remote (GitHub) repository and push the local history?
- Export formats beyond Markdown bundle (PDF? docx? OpenAPI file?) — decide before Phase 5.
- Multi-LLM strategy: current runtime uses Gemini via `@ai-sdk/google`; the AI SDK provider abstraction is the assumed seam for Phase 6.

## Next Up

- Phase 1: design the Prisma model for the project memory document + section statuses.
