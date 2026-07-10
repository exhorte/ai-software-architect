# Project State

> **Role**: The living build-state of the *platform itself* — what has been built, what is in progress, what was decided. Successor to the legacy `context/progress-tracker.md`.
> **Used**: Loaded at the start of every Claude Code working session; updated after every meaningful implementation change.
> **Read by**: Claude Code (as Coordinator of platform development) and human developers.
> **Written by**: Claude Code / developers at the end of each unit of work. This is the only file in `memory/` that tracks *our* build, not a user's project.
> **Format**: Markdown with fixed sections below. Keep entries dated and condensed — one line per completed unit; details belong in git history.
> **Interacts with**: `../platform/` (app implementation context), `../coordinator/workflow.md` (target behavior being built).

## Product

**AI Software Architect** (working title) — a SaaS platform where a multi-agent AI software factory transforms a project idea into a complete engineering deliverable: requirements, user stories, architecture, UML/C4/ERD diagrams, database schema, stack choice, roadmap, backlog, and exports.

Built on the Ghost AI foundation (Next.js 16, Clerk, Prisma/PostgreSQL, Liveblocks + React Flow canvas, Trigger.dev tasks, Vercel Blob).

## Current Phase

- **Phase 0 — Foundations of the agent system**: ✅ complete (2026-07-05). Brain in place, entry points rewritten, legacy artifacts cleaned up (user-approved), git history started (`4a0365d` snapshot → `17ef040` cleanup). Application code unchanged.
- **Phase 1 — Shared Memory runtime**: ✅ complete (2026-07-06). `lib/memory/` ships the validated, versioned memory layer (33 tests); `ProjectMemory`/`MemoryRevision` models with an offline migration. Deferred: apply the migration once `DATABASE_URL` is configured (no `.env` on this workstation).
- **Phase 2 — Orchestrator runtime**: ✅ complete (2026-07-06). `lib/orchestrator/` ships the engine (state machine, planner, envelope, 4-layer prompts, LLM seam) behind ports; `trigger/orchestrator.ts` + `trigger/agent-runner.ts` wrap it; `Run` model + offline migration. 60/60 tests. Deferred: live Trigger.dev smoke test (needs env).
- **Phase 3 — Business Team end-to-end**: not started (current — spec: `../project/phases/phase-03-business-team.md`).

## Transformation Roadmap

Moved to `../project/roadmap.md` (master index + statuses) with one mini-specification per phase in `../project/phases/` (objectives, deliverables, acceptance criteria, dependencies, validation checkpoints). Load only the current phase's file per the roadmap's loading rule.

## Inherited Foundation (Ghost AI, features 01–29 — all complete)

Auth (Clerk), project CRUD + collaborators, real-time canvas (Liveblocks + React Flow: shapes, colors, resize, edges, presence, cursors, undo/redo, templates, autosave to Vercel Blob), AI design agent (Gemini tool-calling → canvas mutations via Liveblocks Node SDK), AI spec generator (canvas + chat → Markdown spec → Blob + Prisma record, download API), AI sidebar with realtime run tracking (Trigger.dev react-hooks). Detailed feature-by-feature history: `git show 4a0365d:context/progress-tracker.md`.

## Decisions Log

- 2026-07-05 — `.claude/context/` is the single knowledge base of the agent system; root `context/` remains the implementation context of the host application. Root `CLAUDE.md` stays the entry point because Claude Code auto-loads it.
- 2026-07-05 — Agent definition files are the *source of truth for runtime prompts*: the future orchestrator loads/compiles them, so design-time docs and runtime behavior cannot drift.
- 2026-07-05 — Inter-agent exchanges are schema-validated JSON only (`schemas/`); the existing free-text spec generator will be decomposed into Documentation Team agents in Phase 5.
- 2026-07-05 — Existing `design-agent` canvas conventions (shapes, color semantics, layout) promoted to system-wide diagram projection rules in `../prompts/output_formats.md`.
- 2026-07-05 — Git initialized (repo had none); safety snapshot `4a0365d` taken, then user-approved cleanup: removed `context/feature-specs/`, `context/screenshots/`, `docs/superpowers/`, `public/readme/`, `public/thumbnails/`; README rewritten for the new product (`17ef040`). Deleted content remains recoverable from the snapshot commit.
- 2026-07-05 — `memory/handoff.md` added as the live session-handoff journal (French, always loaded per `CLAUDE.md` § Context Loading); durable state stays here, session flow lives there.
- 2026-07-05 — `.claude/settings.json` allowlist (lint, build, `tsc --noEmit`, `prisma validate/format`) approved explicitly by the user.
- 2026-07-05 — **Supersedes the "root `context/` remains" decision above**: all knowledge consolidated into `.claude/context/`. Root `context/` absorbed as `platform/` (overview, architecture, ui, code_standards, dev_workflow); `progress-tracker.md` deleted (recoverable at `4a0365d`); `docs/vendor/trigger-v4-rules.md` deleted (redundant with `.agents/skills/trigger-*`). Root `context/` and `docs/` removed.
- 2026-07-05 — Roadmap decomposed into per-phase specifications (`../project/roadmap.md` + `../project/phases/`), each with objectives, deliverables, acceptance criteria, dependencies, and validation checkpoints. Scoped loading: only the current phase file enters session context. Phase 5 covers Engineering *and* Documentation teams (Documentation's read contracts need Engineering's output); Phase 6 is a container to re-cut into tracks at kickoff.
- 2026-07-06 — Phase 1 design decisions (validated TDD): **D1** canonical JSON Schemas imported at build time (no copies, Ajv 2020 registry); **D2** whole-document validation on a draft copy (atomic commits); **D3** statuses live in `runState.sectionStatus`, full history in `MemoryRevision`, lightweight refs in `runState.history`; **D4** optimistic locking on `memoryVersion`; **D5** persistence port + Prisma/in-memory adapters (hexagonal seam, reused by Phase 2); **D6** Vitest as test runner; **D7** ownership/invalidation maps encoded as typed data mirroring the contracts (`lib/memory/ownership.ts`, `lib/memory/status.ts`).
- 2026-07-06 — Phase 2 design decisions (validated TDD): the orchestration **engine lives in `lib/orchestrator/engine.ts`** behind `AgentInvoker`/`RunRecorder` ports — Trigger tasks are thin wrappers, everything unit-tested in-process; the **envelope is the 5th canonical schema** (`envelope.schema.json`); agent `.md` files reach the runtime via a **committed codegen module** (`npm run prompts:build`); **semantic retries** (errors appended to the prompt) belong to the engine, Trigger retry stays at 1 for agent-runner; **LLM registry** per agent (`lib/orchestrator/llm.ts`) is the Phase 6 multi-LLM seam; routing table and plan guards mirror `routing_rules.md`/`planner.md` as typed data.
- 2026-07-10 — **Infrastructure: fresh Prisma Postgres DB + Prisma Compute deployment** (user-directed). Fresh Prisma project `software_architect` (`proj_cmrf5nufq10mbwfdv0gxmgbff`, Personal workspace) with a `production` database (`db_cmrf5outc10obwfdviwymva8k`, eu-central-1). Prisma schema **consolidated to a single file** `prisma/schema.prisma` (`prisma.config.ts` now points there, not the `prisma/models/` multi-file layout — models deleted); migration history **reset** to one fresh `20260710163659_init` (the 4 ghost-ai + 2 Phase-1/2 migrations dropped). Prisma stack reinstalled fresh (`prisma`/`@prisma/client`/`@prisma/adapter-pg`/`pg`/`dotenv`/`tsx`/`@types/*` had been stripped from `package.json`). `next.config.ts` gained `output: "standalone"` (Compute requirement). App deployed to Compute (branch `main`, production, app name `ghost-ai` from `package.json name`): **https://bdm8rc1y6wusqz15cjh1972a.fra.prisma.build**. Only `DATABASE_URL` is wired — the app is live but returns 500 until Clerk (and Liveblocks/Trigger/Google) keys are added and it is redeployed.

## In Progress

- None.

## Open Questions

- **Deployed app is live but non-functional (500)** until fresh services are created and their keys added to `.env` (then redeploy): Clerk (auth), Liveblocks (canvas), Trigger.dev (tasks), Vercel Blob (storage), Google Gemini (LLM). `.env` keeps them as commented placeholders (Compute rejects empty values). This is the "create new services" step the user owns.
- App name on Compute is `ghost-ai` (from `package.json name`); the Prisma **project** is `software_architect`. Rename `package.json name` → `software-architect` when the final product name is settled, then redeploy (or `app` rename).
- Final product name (placeholder: **AI Software Architect**).
- DB is now live (Prisma Postgres, eu-central-1) with `init` applied — the earlier "no `.env`/migrate pending" blocker is **cleared**. `PrismaPersistence` live smoke test still worth running once the app has auth.
- 4 pre-existing lint errors in `components/editor/canvas/*` and `liveblocks.config.ts` (React hooks rules, `{}` types) — fix in a dedicated cleanup unit, not opportunistically.
- Export formats beyond Markdown bundle (PDF? docx? OpenAPI file?) — decide before Phase 5.
- Multi-LLM strategy: current runtime uses Gemini via `@ai-sdk/google`; the AI SDK provider abstraction is the assumed seam for Phase 6.

## Next Up

- Phase 3 (Business Team end-to-end) — full specification: `../project/phases/phase-03-business-team.md`. First step per its checkpoints: UX sketch of the clarification loop + memory viewer for user validation. Blocker to clear early: the `.env` setup (DB migration deploy + Trigger.dev + Clerk keys) — Phase 3 is the first phase that runs live.
