# Transformation Roadmap

> **Role**: The master index of the platform build: phase sequence, status, and the scoped-loading rule. The single place that answers "where are we and what comes next". Phase details live in `phases/` — one mini-specification each.
> **Used**: At session start to identify the current phase; when a phase closes to update statuses.
> **Read by**: Claude Code and developers.
> **Written by**: Claude Code / developers — status column on every phase transition; sequence changes are architecture decisions (log them in `../memory/project_state.md`).
> **Loading rule**: Load this file + **only the current phase file**. Other phase files are loaded only when explicitly planning ahead or revising the cut. This keeps session context small and decisions sharp.
> **Interacts with**: `../memory/project_state.md` (points here; records decisions and session-level state), `phases/*.md` (the specifications), `development_manifesto.md` (the beliefs every phase must honor).

## Phase Sequence

| # | Phase | Specification | Status | Depends on |
| --- | --- | --- | --- | --- |
| 0 | Brain & foundations | (done in place — see `../memory/project_state.md` § Decisions Log) | ✅ done (2026-07-05) | — |
| 1 | Shared Memory runtime | `phases/phase-01-shared-memory.md` | ✅ done (2026-07-06) | 0 |
| 2 | Orchestrator runtime | `phases/phase-02-orchestrator.md` | ✅ done (2026-07-06) | 1 |
| 3 | Business Team end-to-end | `phases/phase-03-business-team.md` | ⬜ not started | 2 |
| 4 | Architecture Team + canvas projection | `phases/phase-04-architecture-team.md` | ⬜ not started | 3 |
| 5 | Engineering & Documentation Teams + export | `phases/phase-05-engineering-team.md` | ⬜ not started | 4 |
| 6 | Advanced platform (multi-LLM, new workflows) | `phases/phase-06-advanced-platform.md` | ⬜ not started | 5 |

**Current phase: 3 — Business Team end-to-end.** Unblocked 2026-07-17: the inherited base is verified live end to end (Clerk → Prisma → Liveblocks → Trigger.dev prod → LLM → Blob), on both Gemini and DeepSeek.

## Phase Discipline

1. **One phase at a time.** Work items outside the current phase's scope are logged (in the target phase file or `../memory/project_state.md` § Open Questions), never started opportunistically.
2. **A phase closes** when every acceptance criterion in its file is checked, its validation checkpoints are confirmed, and `project_state.md` + `handoff.md` + this table are updated. Closing a phase is a commit of its own.
3. **Statuses**: `⬜ not started` → `🔶 in progress` → `✅ done`. A phase reopened by a revision gets `🔁 reopened` with a dated note.
4. **Scope changes** to a phase file are allowed while it is `not started`; once `in progress`, scope changes are recorded in the file's Change Log section with a one-line justification.
5. Each phase must end with the platform **deployable and demonstrable** — no phase leaves the app broken (walking-skeleton principle, same rule our own roadmap agent enforces on user projects).

## Sequencing Rationale

Memory before orchestration (nothing to coordinate without a validated store) → orchestration before teams (agents need an invoker) → Business before Architecture (upstream sections feed downstream preconditions) → Engineering/Documentation last among teams (widest read contracts) → platform generalization only once one full pipeline is proven end to end.
