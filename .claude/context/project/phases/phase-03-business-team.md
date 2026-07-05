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

- (none yet)
