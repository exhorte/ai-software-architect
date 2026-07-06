# Phase 2 — Orchestrator Runtime

> **Status**: ✅ done (2026-07-06) — live-cloud smoke test deferred with the env setup, see Change Log · **Depends on**: Phase 1 (memory) · **Unblocks**: Phase 3 (first real team)
> **Contract source**: `../../coordinator/orchestrator.md` (state machine, directives), `../../coordinator/planner.md` (plans), `../../coordinator/routing_rules.md` (routing), `../../prompts/output_formats.md` (envelope).

## Objective

Implement the Coordinator as a durable Trigger.dev workflow: classify a request, build a plan, invoke agents as child tasks with layered prompts, validate their envelopes, commit through the Phase-1 memory layer, and walk the run state machine — with **no real agents yet** (stub agents prove the machinery).

## Scope

**In**: orchestrator task, agent-runner child task, prompt assembly from agent definition files, plan builder, envelope validation, retry/blocked policy, run persistence, stub agents for testing.
**Out**: real agent prompts/behavior (Phase 3+), clarification UI (Phase 3), canvas projection (Phase 4), consistency validator beyond structural checks (grows per team phase).

## Deliverables

| # | Deliverable | Target location |
| --- | --- | --- |
| D1 | `Run` Prisma model: runId, projectId, intent, phase, plan JSON, status, blockages; linked to `TaskRun` pattern already in place | `prisma/models/memory.prisma` (extend) |
| D2 | Prompt assembler: builds the 4-layer agent prompt (agent file → transversal rules → memory slice → step instruction) per `../../memory/session_context.md` § Plane 2; loads agent `.md` files as build-time assets | `lib/orchestrator/prompt.ts` |
| D3 | Plan builder: intent classification (`NEW_PROJECT`/`REVISION`/`REFINEMENT`/`QUESTION`/`EXPORT`) + step generation from the routing table, encoded as data mirroring `routing_rules.md` | `lib/orchestrator/planner.ts` |
| D4 | Envelope handling: parse/validate agent output envelopes; map violations to the retry-with-errors flow (1 retry → blocked) | `lib/orchestrator/envelope.ts` |
| D5 | Orchestrator task: state machine INTAKE→…→DONE with phase gates as pluggable checks; invokes agent-runner via `triggerAndWait` (respecting Trigger.dev v4 rules — see `.claude/skills/trigger-*`) | `trigger/orchestrator.ts` |
| D6 | Agent-runner task: one agent invocation = assemble prompt → call LLM (Gemini via existing `@ai-sdk/google` setup, behind a thin provider interface for Phase 6) → return raw envelope | `trigger/agent-runner.ts` |
| D7 | Stub agent fixtures: two fake agent definitions + deterministic mock LLM mode for tests (env-gated), exercising success, invalid-envelope, and second-failure paths | `lib/orchestrator/__tests__/` |

## Acceptance Criteria

- [x] AC1 — A `NEW_PROJECT` run with stub agents traverses INTAKE→DONE, committing each stub section through the memory layer; `runState` in memory matches the run recorder at every step (recorder exercised via its port; the live `Run` row needs the deferred env).
- [x] AC2 — An invalid envelope triggers exactly one retry with the structured errors appended; a second failure marks the section `blocked` and the run continues with independent steps.
- [x] AC3 — Parallel-group steps (disjoint writes) execute concurrently (`batchTriggerAndWait` in the adapter); `validatePlan` rejects two writers of one section in a group (tested).
- [x] AC4 — The prompt assembler produces byte-stable prompts from unchanged inputs (determinism test), and injects only the sections in the step's `reads`.
- [x] AC5 — Agent definition files are the only prompt source: the generated module quotes them verbatim (tested); editing a `.md` + `npm run prompts:build` changes the runtime prompt with no code change.
- [x] AC6 — Typecheck 0 errors, 60/60 tests, build OK, new code lints clean; design-agent and spec flows untouched.

## Dependencies

- Phase 1 memory layer (commit path, statuses, scoped reads).
- Trigger.dev v4 patterns: `triggerAndWait` result checking, no `Promise.all` with waits (`.claude/skills/trigger-tasks`).
- Decision needed at start: how agent `.md` files ship to the Trigger.dev worker bundle (build-time import vs. copy step).

## Validation Checkpoints

1. **Before coding**: one-page technical note (task topology, Run model sketch) reviewed with the user — this is the architectural heart of the product.
2. **Mid-phase**: demo of a stub run's trace (plan → steps → envelopes → commits) after D5.
3. **Close**: ACs checked, decisions logged (bundling strategy, provider seam), roadmap + handoff updated.

## Change Log

- 2026-07-06 — **Envelope promoted to a canonical schema** (`schemas/envelope.schema.json`, 5th in the registry) rather than staying prose-only in `output_formats.md`; `session_context.md` layer-2 rule adjusted (output_formats always included — the envelope contract lives there).
- 2026-07-06 — **Agent `.md` bundling**: codegen module (`scripts/build-agent-prompts.ts` → `lib/orchestrator/generated/agent-prompts.ts`, committed, hooked on prebuild/pretest) chosen over an esbuild loader — works identically for Next and Trigger workers, prompt diffs reviewable.
- 2026-07-06 — **Intent classification is deterministic in Phase 2** (virgin memory ⇒ NEW_PROJECT; other intents refused with NOT_IMPLEMENTED). LLM classification of free-form follow-ups ships with the UI (Phase 3).
- 2026-07-06 — **CLARIFICATION auto-passes** when no blocking unanswered question exists; the interactive pause/resume (waitpoints) is Phase 3 D3 scope.
- 2026-07-06 — **Deferred**: live smoke test of `pipeline-orchestrator` on Trigger.dev (needs the `.env` setup already tracked in Open Questions); engine fully tested in-process via its ports.
