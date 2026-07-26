# Phase 3 — Business Team End-to-End

> **Status**: ⬜ not started · **Depends on**: Phase 2 (orchestrator) · **Unblocks**: Phase 4 (architecture team)
> **Contract source**: `../../agents/business/*.md` (the four agent definitions), `../../coordinator/workflow.md` (INTAKE→REQUIREMENTS gates, clarification loop).

## Objective

Ship the first *real* value: a user types a project idea in the AI sidebar and receives validated `project`, `actors`, `clarifications`, `entities`, `businessRules`, `requirements`, and `userStories` sections — including the interactive clarification loop. This phase proves the whole architecture on the smallest complete slice (walking skeleton of the product itself).

## Scope

**In**: the four Business agents live (analyst, domain_expert, requirements, user_story), clarification loop UX in the sidebar, memory-section rendering in the UI, run launch/track from the sidebar, INTAKE/CLARIFICATION/REQUIREMENTS phase gates, consistency rules CON-01/CON-02.
**Out**: Architecture/Engineering/Documentation agents, canvas projection, exports. The run stops (cleanly, state `valid` through REQUIREMENTS) after the REQUIREMENTS gate.

## Deliverables

| # | Deliverable | Target location |
| --- | --- | --- |
| D1 | Business agent prompts finalized: each `agents/business/*.md` reviewed/tightened against real LLM behavior (prompt iterations happen in the `.md` files — never inline in code) | `.claude/context/agents/business/` |
| D2 | API: launch a pipeline run (`POST /api/ai/run` — replaces nothing yet; design-agent route untouched), reusing the TaskRun ownership/token pattern from the existing design routes | `app/api/ai/run/` |
| D3 | Clarification loop: run pauses in CLARIFICATION; sidebar renders blocking questions with `suggestedDefault`; answers commit to memory and resume the run (Trigger.dev waitpoint or resume-trigger — decide and record) | `trigger/orchestrator.ts` + `components/editor/ai-sidebar.tsx` |
| D4 | Memory viewer: sidebar tab rendering committed sections (project brief, actors, requirements with IDs/priorities, stories with scenarios) with status badges (`draft/valid/stale/blocked`) | `components/editor/` |
| D5 | Phase gates INTAKE/CLARIFICATION/REQUIREMENTS + consistency checks CON-01, CON-02 wired into the orchestrator's gate mechanism | `lib/orchestrator/gates.ts` |
| D6 | Realtime status: reuse the existing broadcast/feed pattern (ai-status events, run tracking via `@trigger.dev/react-hooks`) for pipeline progress | existing sidebar plumbing |

## Acceptance Criteria

- [ ] AC1 — From an empty project, a one-paragraph idea produces all seven Business sections, each `valid`, schema-conforming, with well-formed IDs.
- [ ] AC2 — A deliberately vague idea yields ≤5 ranked clarification questions; answering the blocking ones resumes the run; unanswered non-blocking ones appear in `project.assumptions`.
- [ ] AC3 — Traceability holds on real output: every story → existing requirement(s) (CON-01/02 pass); a seeded violation is caught by the gate and routed back per `../../rules/consistency.md`.
- [ ] AC4 — Two collaborators in the same project both see run progress and resulting sections in real time.
- [ ] AC5 — Cost/latency sanity: a standard run completes in bounded steps (no unbounded agent loops); token usage per agent logged in run metadata.
- [ ] AC6 — Lint, typecheck, tests, build pass; legacy design-agent and spec flows still work unchanged.

## Dependencies

- Phase 2 orchestrator + Phase 1 memory (hard).
- Existing sidebar architecture (feeds, presence, run tokens) — reuse, don't fork.
- Decision needed at start: pause/resume mechanism for CLARIFICATION (Trigger.dev waitpoints vs. run-per-segment).

## Validation Checkpoints

1. **Before coding**: UX sketch of the clarification loop + memory viewer (text/wireframe) validated with the user.
2. **Mid-phase**: live demo after D3 — idea in, questions out, answers in, requirements out.
3. **Close**: user runs the flow on a real project idea of their choice and accepts the output quality; ACs checked; roadmap + handoff updated.

## Change Log

- 2026-07-17 — **V1 (engine)**: `ClarificationGate` port + single-round clarification loop (unanswered → recorded assumptions); `consistency.ts` (CON-01/CON-02) with the REQUIREMENTS gate routing findings back to their owning agent for one corrective re-run, grouped per agent; `MemoryStore.commitSection` gains `preserveStatus` so the orchestrator's bookkeeping writes (answers, assumptions) don't demote a gate-`valid` section to `draft`. Commit `d0b7aec`.
- 2026-07-17 — **V2 (waitpoint adapter)**. Decision recorded — **clarification pause/resume = Trigger.dev v4 waitpoint tokens** (not run-per-segment). Verified against the installed `@trigger.dev/sdk` **4.5.3** types: `wait.createToken({ idempotencyKey, timeout, tags })` → `{ id, isCached, url }`; `wait.forToken<T>(id)` → `{ ok, output }|{ ok:false, error }` (checkpoints the run — no compute billed while waiting); `wait.completeToken(id, data)` and `wait.retrieveToken(id)` for the V3 route. `trigger/clarification-gate.ts` implements the port with **no business logic**; the engine keeps no Trigger dependency and the V1 mock still drives its tests.
  - **`RESUMING`** added to `RunStatus` (no canonical equivalent); `COMPLETED`→existing `DONE`; **no `BLOCKED`** run status (a run with blocked sections is `DONE` + `blockages`). `Run` gains `stepId` + `clarification` JSON (token id, asked question ids, expiry, suspend/resume timestamps — question *text* stays in Shared Memory). Migration `20260717120633_add_run_clarification_state`.
  - **Idempotency**: one token per run, key `clarification:<runId>` → a retried run re-attaches (`isCached`) instead of asking twice. **Expiry 24h**: a timeout is a business outcome (no answers → engine records assumptions); any other waitpoint error is technical and rethrown, never laundered into an assumption. Recorder mirrors phase/stepId/status/clarification into Trigger metadata, never a token value/secret. 126 tests (18 new).
  - **Cloud demo deferred to V3**: the real "run suspended → API answer → resume" walkthrough needs `POST /api/ai/run/answers` (ownership + token-status + single-consumption), so V2 and V3 are demonstrated together at V3 close.
- 2026-07-17 — **V3 (API routes)** `211295d`: `POST /api/ai/run` (launch), run public-token route (1h, scoped to one run), `POST /api/ai/run/answers` following the mandatory order — authenticate → project access → load Run by `triggerRunId` → status/token checks → validate → complete. Codes 400/401/403/404/409/410/500, with **410 (expired) distinguished from 409 (already consumed)** via `retrieveToken().status`. The route **never commits**: it only calls `wait.completeToken`, and the resumed engine performs the single canonical commit — a double commit is structurally impossible since the route has no store access. Pure helpers moved to `lib/orchestrator/clarification.ts` so the route needs no Trigger import and both sides share one validation. 148 tests.
- 2026-07-17 — **Engine robustness** `8ee01c2`, found by the first live pipeline run: `business/analyst` failed with `AI_APICallError` and the **whole run FAILED**, because a thrown invocation propagated out of `executeStep`. Now a thrown invocation is retried once (transient recovery) and then **blocks its section** while the run continues; a whole-batch failure degrades to per-step execution. 151 tests.
- 2026-07-17 — **V2+V3 cloud demo: GREEN** (controlled path, independent of the analyst LLM — the full-pipeline variant is blocked on V8 prompt/model work, see below). Real Trigger.dev prod run: suspended at `WAITING_CLARIFICATION` on a real waitpoint (`status=WAITING`, **no compute billed**), token + question ids + 24h expiry persisted on the Run row; answered via `wait.completeToken` (the route's step 10); resumed `RESUMING → COMPLETED`; **single canonical commit verified in memory (1/1)**.
  - *Honest nuance*: raw `wait.completeToken` is **idempotent** — a second completion succeeds at SDK level. Single-consumption is enforced by the **route** (409 when `retrieveToken().status === COMPLETED`, unit-tested), not by the token. The demo calls the token directly (headless Clerk auth is unavailable), so it cannot exercise that route guard.
  - *Full-pipeline live demo still owed*: it requires the Business agents to actually produce a blocking clarification, which depends on **V8** (prompt/model finalization). DeepSeek's `deepseek-v4-pro` currently fails to emit the analyst's large structured envelope (`AI_APICallError: Failed to process successful response`).
- 2026-07-25 — **V4 (Pipeline UI tab)** `[pending commit]`:
  - `ClarificationRunState` enriched with `questions: ClarificationQuestion[]` — question text stored alongside IDs so the Pipeline tab fetches once, no memory round-trip.
  - `GET /api/ai/run/state?runId=<triggerRunId>` — returns phase, step, status, plan (for stepper), clarification questions (when WAITING_CLARIFICATION), and blockages. Auth/access gates identical to the answers route.
  - `components/editor/pipeline-tab.tsx` — launch form (idea → `POST /api/ai/run` → runId + token), phase stepper (INTAKE → CLARIFICATION → REQUIREMENTS with live status from `useRealtimeRun`), clarification Q&A cards (submits via `POST /api/ai/run/answers`), terminal summary (DONE/Failed with blockages).
  - Integrated as default "Pipeline" tab in `ai-sidebar.tsx` (alongside Architect, Chat, Specs).
  - **157 tests** (6 new: state route).
