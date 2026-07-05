# Validation Rules

> **Role**: The structural checks the Orchestrator runs on every agent output *before* committing it to Shared Memory, and on every section before its phase gate. Validation answers "is this well-formed and internally complete?" — cross-artifact coherence belongs to `consistency.md`.
> **Used**: At every commit (per-output) and at every phase gate (per-section).
> **Read by**: Orchestrator/validator. Agents see validation *errors*, not this file.
> **Written by**: Platform architects.
> **Interacts with**: `../schemas/*.json` (level 1), `naming.md` (level 2), `../coordinator/workflow.md` (gates invoke these levels), `consistency.md` (level 4, cross-artifact).

## Validation Levels

Run in order; fail fast at the first failing level.

### Level 1 — Envelope & Schema

- Output is exactly one JSON envelope per `../prompts/output_formats.md`; `status`, `writes`, `issues`, `confidence` present and well-typed.
- `writes` keys ⊆ the step's declared write contract.
- Every section in `writes` validates against its schema (`project.schema.json` and delegated schemas).

### Level 2 — Identifiers

- Every ID matches its family grammar in `naming.md`.
- No duplicate IDs within a section; no reuse of tombstoned IDs (checked against `runState.history`).
- IDs referenced across sections use the reference patterns (`^REQ-`, `^ENT-`…) — prose references to identifiable things are rejected.

### Level 3 — Internal Completeness (per section)

Checks that need only the section itself plus its declared inputs:

| Section | Checks |
| --- | --- |
| `project` | goals each have an ID; scope has both `in` and `out`; every assumption cites its source |
| `clarifications` | every item has `why` and `blocking`; blocking items without `suggestedDefault` are flagged |
| `requirements` | ≥1 acceptance criterion each; no compound titles (heuristic: " and " in title triggers review); priority present |
| `userStories` | ≥1 scenario each; scenario fields non-empty; `points` in the allowed scale |
| `architecture` | every ADR has ≥1 alternative and ≥1 consequence; `style.adr` points at an existing ADR in the same payload |
| `database` | every table has a PK; every FK references a table in the payload; every index has a `justification` |
| `api` | every operation has ≥1 response; mutating operations with `auth.required: false` carry `auth.justification` |
| `security` | every threat has `mitigation`; `mitigation: "accepted"` requires `acceptedBecause` |
| `roadmap`/`backlog` | no `dependsOn` cycles; every `dependsOn` target exists; sprint numbers respect dependency order |
| `documentation` | every rendered document has its generation header |

## Error Reporting

Validation errors are returned to the producing agent on retry as a structured list appended to its step input:

```json
{ "level": 3, "section": "database", "path": "tables[2].indexes[0]", "rule": "index-justification", "message": "Index on orders(seller_id) has no justification." }
```

Per `../prompts/response_rules.md` rule 13, the agent fixes exactly these violations. Two consecutive failures on the same step → section `blocked` (Orchestrator policy).

## Non-Goals

- No semantic judgment ("is this a *good* architecture?") — that is agent quality, reviewed via `confidence` and phase gates.
- No cross-section checks — those run at VALIDATION phase per `consistency.md`.
