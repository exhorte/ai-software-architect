# Phase 5 — Engineering & Documentation Teams + Export

> **Status**: ⬜ not started · **Depends on**: Phase 4 · **Unblocks**: Phase 6
> **Contract source**: `../../agents/engineering/*.md`, `../../agents/documentation/*.md`, `../../templates/roadmap.json`, `../../agents/documentation/exporter.md` (bundle layout).
> **Note**: This phase covers *both* remaining teams — Engineering (5 agents) and Documentation (4 agents) — because Documentation's read contracts require Engineering's output; splitting them would leave a phase with nothing demonstrable.

## Objective

Complete the pipeline: API contract, backend/frontend blueprints, DevOps plan, test strategy, then roadmap/backlog, documentation, diagram narratives — and a downloadable **Markdown bundle export** that replaces the legacy single-shot spec generator. After this phase, the product delivers its full promise end to end.

## Scope

**In**: nine agents live, ENGINEERING/DOCUMENTATION/VALIDATION/EXPORT phases with gates, full consistency sweep (CON-01…CON-15), Mermaid projection for exported diagrams, bundle assembly to Vercel Blob (zip), export UI, retirement of `trigger/generate-spec.ts` and its routes/UI.
**Out**: non-Markdown export formats (OpenAPI file, PDF — Phase 6 candidates), code generation.

## Deliverables

| # | Deliverable | Target location |
| --- | --- | --- |
| D1 | Engineering + Documentation agent prompts finalized against real output | `.claude/context/agents/{engineering,documentation}/` |
| D2 | Remaining orchestrator phases + parallel groups B and C; QA last-in-phase ordering; full VALIDATION sweep implementing CON-01…15 with routed findings | `lib/orchestrator/gates.ts` + `lib/orchestrator/consistency.ts` |
| D3 | Mermaid projection: deterministic structured-diagram → Mermaid source per `output_formats.md` § 2b (all five diagram types) | `lib/diagrams/mermaid.ts` |
| D4 | Exporter: assemble the bundle layout from `exporter.md` (README, docs/, diagrams with narratives, database, planning, manifest.json), zip, upload to Blob, `documentation.exports` manifest committed to memory | `trigger/export.ts` + `lib/export/` |
| D5 | Export & documentation UI: browse rendered docs (reuse `react-markdown` viewer), roadmap/backlog view, download bundle (reuse spec download pattern) | `components/editor/` + `app/api/projects/[projectId]/exports/` |
| D6 | Legacy retirement: remove `trigger/generate-spec.ts`, `/api/ai/spec*` routes and Specs-tab generation UI once the new path is accepted; migrate nothing (old specs stay downloadable via their records) | deletions + `ProjectSpec` kept read-only |

## Acceptance Criteria

- [ ] AC1 — A full `NEW_PROJECT` run (idea → export) completes with zero unaccepted consistency findings on a realistic test project.
- [ ] AC2 — Every `must` requirement is API-covered or `internal` (CON-07); frontend routes agree with the auth matrix (CON-09); every `must` requirement appears in test coverage or gaps (CON-11).
- [ ] AC3 — Roadmap phase 1 is a walking skeleton; backlog has no dependency inversions (CON-12) — checked on real output, not just templates.
- [ ] AC4 — The downloaded bundle is self-contained: links resolve offline, every diagram file contains rendering + narrative, `manifest.json` lists statuses and assumptions honestly.
- [ ] AC5 — Re-exporting an unchanged project yields a byte-identical bundle modulo timestamps (exporter determinism).
- [ ] AC6 — Legacy spec generator fully removed; no dead routes/UI; old spec downloads still work.
- [ ] AC7 — Lint, typecheck, tests, build pass.

## Dependencies

- Phases 1–4 (hard). Existing Blob + download-route patterns; `react-markdown` viewer.
- Decision needed at start: zip library / bundling approach in the Trigger.dev worker; whether `REVISION`/`REFINEMENT` intents ship here or in Phase 6 (default: Phase 6, keep this phase linear).

## Validation Checkpoints

1. **Before coding**: bundle layout + retirement plan (D6) confirmed with the user — removing a shipped feature needs explicit sign-off.
2. **Mid-phase**: after D4, user reviews a generated bundle for a real idea; quality bar: "could hand this to a dev team".
3. **Close**: full-pipeline demo, ACs checked, legacy removed, roadmap + handoff updated.

## Change Log

- (none yet)
