# Phase 6 — Advanced Platform

> **Status**: ⬜ not started · **Depends on**: Phase 5 (one proven end-to-end pipeline) · **Unblocks**: product growth tracks
> **Contract source**: `../../coordinator/planner.md` (intents + invalidation map), `../../coordinator/workflow.md` § Future Workflows, `../../memory/project_state.md` § Open Questions.
> **Note**: This phase is a *container for generalization tracks*; each track below should be promoted to its own phase file when it starts (this file then becomes an index — same scoped-loading principle).

## Objective

Turn the single-pipeline product into a platform: users revise instead of regenerate, agents can run on different LLMs, and new workflows (architecture review, reverse engineering) plug in without touching the orchestrator core. This is where the Phase-0 architecture pays off — if any track requires restructuring the brain, that is a defect to fix in the brain first.

## Tracks

### T1 — Revision & Refinement intents

Full `REVISION`/`REFINEMENT` support: intent classification on follow-up requests, invalidation map execution (`markStale` from Phase 1), partial replans reusing valid sections, diff view ("what changed and why") in the UI.
**Acceptance**: changing one requirement regenerates only downstream-stale sections; user-confirmed decisions are never silently overwritten; revision history is inspectable.

### T2 — Multi-LLM abstraction

Provider registry behind the Phase-2 seam: per-agent model configuration (e.g. cheap/fast for formatting agents, strongest for solution_architect), env-driven defaults, cost/latency telemetry per agent per run.
**Acceptance**: switching a team to another provider requires configuration only — zero contract or prompt-assembler changes; a mixed-provider run completes with identical envelope guarantees.

### T3 — New workflows

At least one non-default workflow live, named in `workflow.md` per its § Future Workflows protocol. First candidate: **Architecture Review** (user supplies an existing design/description → Business INTAKE variant → Architecture agents in review mode → findings report). Second candidate: **Reverse Engineering** (repo/scheme input → entities/components extraction).
**Acceptance**: the new workflow is defined as phases + gates in `workflow.md` and routed via `routing_rules.md` additions — the orchestrator state machine itself is untouched (proves workflow-agnosticism).

### T4 — Export formats

OpenAPI file generated from `api`; per-diagram Mermaid source files; optional PDF pipeline. Each format a pure function of memory (exporter rule).
**Acceptance**: formats added to the exporter manifest without touching agents.

### T5 — Operational hardening

Run observability dashboard (steps, tokens, costs, gate results), rate limiting per plan tier (pre-billing groundwork), memory-document size budgets and pruning strategy for `runState.history`.
**Acceptance**: a failed production run is diagnosable from the dashboard alone.

## Sequencing Inside the Phase

T1 first (most user value, exercises Phase-1 invalidation machinery) → T2 (cost control before scale) → T3/T4 in either order → T5 continuous. Re-cut into individual phase files at T1 kickoff.

## Dependencies

- Phase 5 complete. Open decisions inherited from `project_state.md`: final product name (affects exports branding), remote repo/CI (should exist before T5).

## Validation Checkpoints

1. **At phase start**: re-cut this container into per-track phase files; get the track order confirmed by the user.
2. **Per track**: each track's acceptance bullet demonstrated live before the next track starts.
3. **Close**: platform claims of `platform/overview.md` § Goals all demonstrably true; roadmap + handoff updated.

## Change Log

- (none yet)
