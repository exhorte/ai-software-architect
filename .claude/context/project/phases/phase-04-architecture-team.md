# Phase 4 — Architecture Team + Canvas Projection

> **Status**: ⬜ not started · **Depends on**: Phase 3 (business sections exist) · **Unblocks**: Phase 5
> **Contract source**: `../../agents/architecture/*.md`, `../../schemas/{architecture,uml,database}.schema.json`, `../../prompts/output_formats.md` § Diagram Projections, `../../templates/*.json`.

## Objective

The visual heart of the product: the five Architecture agents produce style/components/ADRs, UML, C4, ERD, and the security model — and the diagrams **appear on the collaborative canvas**, drawn through the same Liveblocks mechanics the design-agent already uses. Users watch the architecture materialize and can refine it.

## Scope

**In**: five architecture agents live, ARCHITECTURE phase gate, parallel group A execution, canvas projection renderer (structured diagram → Liveblocks room), diagram navigation UI (one room view per diagram), ADR/stack display, consistency rules CON-03…CON-06, CON-10, CON-13.
**Out**: Mermaid rendering and exports (Phase 5), engineering agents, editing diagrams *back* into memory (one-way projection this phase — record as known limitation).

## Deliverables

| # | Deliverable | Target location |
| --- | --- | --- |
| D1 | Architecture agent prompts finalized against real output (same discipline as Phase 3 D1) | `.claude/context/agents/architecture/` |
| D2 | Canvas projection writer: generalize the design-agent's storage-mutation code (`LiveObject.from`, sync configs, shapes/colors) into a reusable `projectDiagramToCanvas(roomId, canvasProjection)` used by all diagram types | `lib/canvas/projection.ts` (extracted from `trigger/design-agent.ts`) |
| D3 | Deterministic layout pass: compute `canvasProjection` coordinates per the layout rules in `output_formats.md` when agents omit/violate them (agents propose, layout normalizes) | `lib/canvas/layout.ts` |
| D4 | Diagram rooms: one Liveblocks room (or one namespaced storage area) per diagram ID; sidebar/workspace navigation between project canvas and generated diagrams | `components/editor/` + room-ID scheme decision |
| D5 | ARCHITECTURE gate + parallel group A in the orchestrator (uml/c4/database/security concurrent after solution_architect), with CON-03…06/10/13 checks | `lib/orchestrator/gates.ts` |
| D6 | ADR & stack viewer in the sidebar (decision cards: context/decision/alternatives/consequences) | `components/editor/` |

## Acceptance Criteria

- [ ] AC1 — A completed Phase-3 project run continues through ARCHITECTURE: components trace to requirements, ≥1 ADR with a rejected alternative, stack entries all justified (CON-03/13 pass on real output).
- [ ] AC2 — Class diagram, ≥1 sequence diagram, C4 levels 1–2, and the ERD each render on canvas respecting the visual grammar (shapes/colors/spacing) — verified against the `templates/*.json` projections as reference.
- [ ] AC3 — Diagram elements resolve to memory IDs (CON-05); the ERD covers every entity (CON-04); C4 zoom consistency holds (CON-06).
- [ ] AC4 — Collaborators see diagrams drawn live (existing presence/status UX) and can manually adjust layout afterward without corrupting memory (one-way projection documented in UI).
- [ ] AC5 — Security section produced: data classification + threats each mitigated (`REQ-S-*`) or accepted (CON-10).
- [ ] AC6 — Lint, typecheck, tests, build pass.

## Dependencies

- Phases 1–3 (hard). Existing canvas node/edge types and `NODE_COLORS`/`SHAPE_DEFAULTS` (`types/canvas.ts`).
- Decision needed at start: diagram storage model — separate Liveblocks rooms per diagram vs. namespaced maps in the project room (impacts autosave and tokens).

## Validation Checkpoints

1. **Before coding**: diagram-room storage decision + projection extraction plan reviewed with the user.
2. **Mid-phase**: after D2/D3, project the four `templates/*.json` onto a canvas as a golden test — visual review with the user.
3. **Close**: full run demo (idea → diagrams on canvas); ACs checked; roadmap + handoff updated.

## Change Log

- (none yet)
