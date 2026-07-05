# Output Formats

> **Role**: The shared formats every agent output and every rendered artifact must use: the agent envelope, diagram projections (canvas + Mermaid), and Markdown conventions.
> **Used**: Layer 2 of every agent prompt that produces diagrams or documents (`../memory/session_context.md`); by the Response Composer and the exporter for all rendering.
> **Read by**: All agents, Orchestrator, exporter.
> **Written by**: Platform architects.
> **Interacts with**: `response_rules.md` (behavioral counterpart), `../schemas/*.json` (payload structure inside the envelope), `../rules/naming.md` (IDs used in projections).

## 1. Agent Output Envelope

Every agent returns exactly one JSON envelope. No prose before or after it.

```json
{
  "agent": "architecture/database_architect",
  "version": 1,
  "status": "ok",
  "writes": { "database": { /* schema-conforming section content */ } },
  "issues": [
    { "severity": "warning", "target": "entities.ENT-Coupon", "message": "No access pattern implies persistence; marked notPersisted." }
  ],
  "confidence": "high",
  "assumptionsUsed": ["ASM-002"]
}
```

- `status`: `ok` | `partial` (some `writes` complete, blockers in `issues`) | `failed` (nothing usable; `issues` explains).
- `writes`: only sections in the step's contract — extra keys are rejected at commit.
- `issues`: the *only* channel for talking to other agents (via the Orchestrator): upstream defects, unmet preconditions, proposals outside own authority. Severities: `info` | `warning` | `blocking`.
- `confidence`: `high` | `medium` | `low` — `low` triggers Orchestrator attention at the phase gate.

## 2. Diagram Projections

Every structured diagram (`uml`, `c4`, ERD) can be rendered two ways from the same document — never hand-author either form.

### 2a. Canvas projection (collaborative React Flow canvas)

Inherited from the proven Ghost AI design-agent conventions:

**Shape semantics** (exact values):

| Shape | Meaning |
| --- | --- |
| `rectangle` | services, APIs, components, classes |
| `cylinder` | databases, storage, caches, ERD tables |
| `hexagon` | external systems, third parties, boundaries |
| `circle` | events, endpoints, actors' entry points |
| `diamond` | decisions, gateways |
| `pill` | processes, workflows, jobs, use cases |

**Color semantics** (palette indexes 0–7, defined in `types/canvas.ts` `NODE_COLORS`):

| Index | Color | Use for |
| --- | --- | --- |
| 1 | blue | APIs, services, servers |
| 7 | teal | databases, storage |
| 3 | orange | queues, brokers, async flows |
| 6 | green | success paths, healthy/CDN |
| 2 | purple | auth, security, identity |
| 5 | pink | user-facing UI, clients, actors |
| 4 | red | failure paths, alerts |
| 0 | neutral | generic / unclassified |

**Layout rules**: origin ≈ (100, 80); horizontal gap 240–280px between siblings; vertical gap 160–200px between rows; related nodes in horizontal rows, sequential flows top→bottom or left→right; 5–15 nodes per diagram — split rather than overcrowd.

**IDs**: node IDs are the memory IDs they project (`ENT-Order` → node `ent-order`); edge IDs `edge-<source>-<target>`. Grammar in `../rules/naming.md`.

### 2b. Mermaid projection (exports, Markdown embedding)

Deterministic mapping per diagram type: class diagrams → `classDiagram`, sequences → `sequenceDiagram`, use cases → `flowchart` with actor/pill styling, C4 → `C4Context`/`C4Container` syntax, ERD → `erDiagram`. Element display names come from the structured document; Mermaid IDs are the kebab-case memory IDs.

## 3. Markdown Conventions (rendered documents)

- One `#` title per document; sections start at `##`; never skip levels.
- Code blocks always carry a language tag.
- Tables for enumerable facts; prose for reasoning — never a table of paragraphs.
- Cross-references by ID with a link where the bundle layout allows (`[REQ-F-012](./requirements.md#REQ-F-012)`).
- Generation header on every rendered document: source memory version, run ID, ISO date.
