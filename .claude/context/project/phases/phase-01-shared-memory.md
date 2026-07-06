# Phase 1 — Shared Memory Runtime

> **Status**: ✅ done (2026-07-06) — one environment item deferred, see Change Log · **Depends on**: Phase 0 (brain) · **Unblocks**: Phase 2 (orchestrator)
> **Contract source**: `../../memory/shared_memory.md` (behavioral contract), `../../schemas/*.json` (structure). This phase implements those contracts — any mismatch discovered here is fixed in the contract *first*, then in code.

## Objective

Give the platform a real, persistent, validated Shared Memory: one versioned document per project that code can read, and that can only be mutated through a commit path enforcing schema validation, section ownership, and status lifecycle. Everything later (orchestrator, agents) writes through this layer — its correctness is the foundation of the whole factory.

## Scope

**In**: Prisma models, persistence adapter, validation module, section-status lifecycle, revision history, unit tests.
**Out**: Orchestrator, agents, any UI, any LLM call, canvas projection (Phase 2+). No consumer exists yet — this phase ships a library, not a feature.

## Deliverables

| # | Deliverable | Target location |
| --- | --- | --- |
| D1 | Prisma models: `ProjectMemory` (1-per-project, `document` JSONB, `memoryVersion`, timestamps) + `MemoryRevision` (append-only history: version, changed sections, envelope metadata, run/step refs) | `prisma/models/memory.prisma` + migration |
| D2 | Schema loading strategy: runtime access to `.claude/context/schemas/*.json` (direct JSON import at build time; document the choice and its trade-off in `../../memory/project_state.md` § Decisions Log) | `lib/memory/schemas.ts` |
| D3 | Validation module: JSON Schema validation (draft 2020-12) of any section payload against `project.schema.json` and delegated schemas; structured error list matching the format of `../../rules/validation.md` § Error Reporting | `lib/memory/validate.ts` |
| D4 | Persistence adapter: `getMemory(projectId)`, `getSections(projectId, keys[])` (scoped reads), `commitSection(projectId, agentId, writes, envelopeMeta)` — commit validates, checks single-writer ownership (table from `../../rules/consistency.md`), bumps `memoryVersion`, appends a revision, updates section status | `lib/memory/store.ts` |
| D5 | Section status lifecycle: `missing/draft/valid/stale/blocked` transitions per `../../memory/shared_memory.md`, including `markStale(sections[])` implementing the invalidation map of `../../coordinator/planner.md` | `lib/memory/status.ts` |
| D6 | Unit tests for D3–D5 (happy paths + every rejection class) | `lib/memory/__tests__/` (choose and install the test runner — record as decision) |

## Acceptance Criteria

- [x] AC1 — Committing a schema-valid section persists it, bumps `memoryVersion` by exactly 1, and appends one `MemoryRevision`.
- [x] AC2 — Committing an invalid payload (wrong shape, bad ID pattern, unknown section key) is rejected atomically with a structured error list; the stored document is untouched.
- [x] AC3 — A commit by an agent that does not own the target section is rejected (the `REQ-S-*` append exception is honored).
- [x] AC4 — Scoped reads return only the requested sections, never the whole document.
- [x] AC5 — `markStale` on `requirements` flips exactly the sections listed in the invalidation map, nothing else.
- [x] AC6 — Revision history allows reconstructing any prior version of a section (test proves one round-trip).
- [x] AC7 — `npx tsc --noEmit` (0 errors), 33/33 tests, `npm run build` pass; no existing app behavior changed. Lint: new code clean; 4 **pre-existing** errors in canvas/liveblocks code remain (logged as open question, out of phase scope).

## Dependencies

- Phase 0 artifacts: `schemas/*.json`, `rules/validation.md`, `rules/consistency.md`, `memory/shared_memory.md`.
- Existing foundation: Prisma 7 setup (`prisma/` multi-file schema, adapter-pg, client in `app/generated/prisma/`), conventions in `../../platform/code_standards.md`.
- Decision needed at start: test runner (none installed today).

## Validation Checkpoints

1. **Before coding**: Prisma model proposal reviewed against `shared_memory.md` § Persistence Mapping — one message to the user with the model sketch before migrating.
2. **Mid-phase**: after D3, demonstrate a validation run on the `templates/*.json` instances (they must all pass — they are the canonical conforming examples).
3. **Close**: all ACs checked, decision log updated (schema-loading strategy, test runner), roadmap status flipped, `handoff.md` updated.

## Change Log

- 2026-07-06 — **Migration created offline**: no `.env`/`DATABASE_URL` exists on this workstation, so `prisma migrate dev` was replaced by `prisma migrate diff --script` (datamodel→datamodel) written to `prisma/migrations/20260706120000_add_project_memory/`. Apply with `npx prisma migrate deploy` once the database env is configured — required before Phase 3's live runs (Phase 2 tests use the in-memory adapter).
- 2026-07-06 — **Checkpoint 1 folded into plan validation**: the Prisma model sketch was reviewed and approved as part of the phase TDD instead of a separate message.
- 2026-07-06 — **Invalidation map extended in the contract** (`coordinator/planner.md`): `security`, `engineering`, `backlog` added as downstream targets — they existed in the ownership/consistency contracts but were missing from the map.
- 2026-07-06 — **Lint hygiene fix** (T6): `app/generated/**` and `.trigger/**` excluded from ESLint; `npm run lint` was reporting 549 errors from build artifacts.
