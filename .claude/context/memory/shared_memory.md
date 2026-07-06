# Shared Memory

> **Role**: The contract for the single structured memory all agents read from and write to. This is the backbone of the system — agents communicate *through* memory, never with each other.
> **Used**: On every agent invocation (read) and every Orchestrator commit (write).
> **Read by**: All agents (scoped), Orchestrator, Response Composer.
> **Written by**: Orchestrator only — agents *propose* output; the Orchestrator validates and commits it.
> **Format**: One JSON document per project, conforming to `../schemas/project.schema.json`.
> **Interacts with**: `../schemas/*.json` (structure), `../rules/validation.md` + `../rules/consistency.md` (commit conditions), `../coordinator/routing_rules.md` (who writes what).

## Structure

Top-level sections of the memory document (authoritative definition: `../schemas/project.schema.json`):

| Section | Content | Producing agent |
| --- | --- | --- |
| `project` | Name, description, goals, scope, constraints, assumptions | `business/analyst` |
| `clarifications` | Questions, answers, blocking flags | `business/analyst` |
| `actors` | Human and system actors, their goals | `business/analyst` |
| `entities` | Domain entities, aggregates, value objects | `business/domain_expert` |
| `businessRules` | Invariants and policies of the domain | `business/domain_expert` |
| `requirements` | Functional + non-functional, prioritized | `business/requirements` (+ `REQ-S-*` from security) |
| `userStories` | Epics and stories with acceptance criteria | `business/user_story` |
| `architecture` | `style`, `components`, `adrs`, `uml`, `c4` | Architecture Team (subsection per agent) |
| `database` | ERD, engine choice, indexes, migration notes | `architecture/database_architect` |
| `security` | Threat model, auth model, data classification | `architecture/security_architect` |
| `api` | API style and operation contracts | `engineering/api_designer` |
| `stack` | Chosen technologies with justification | `architecture/solution_architect` |
| `engineering` | `backend`, `frontend`, `devops`, `testStrategy` | Engineering Team (subsection per agent) |
| `roadmap` / `backlog` | Phases, milestones, sprint-ready items | `documentation/roadmap` |
| `documentation` | README, tech docs, API docs, diagram narratives, exports | Documentation Team |
| `runState` | Current phase, plan, section statuses | Orchestrator |

## Section Lifecycle

Every section carries a status the Orchestrator maintains:

```text
missing → draft → valid → (stale | blocked)
```

- `draft`: committed but not yet through the phase gate.
- `valid`: passed structural validation and the owning phase gate.
- `stale`: an upstream dependency changed (see invalidation map in `../coordinator/planner.md`).
- `blocked`: production failed twice; reason recorded in `runState.blockages`.

Downstream agents may only consume sections that are `valid` (or `draft` within the same phase's parallel group).

## Access Rules

1. **Scoped reads.** An agent receives only the sections in its declared `Reads` contract — keeps prompts small and prevents solution bias (e.g. Business Team never sees `stack`).
2. **Single writer.** One agent owns each section per run (`../rules/consistency.md` holds the ownership map).
3. **Structured only.** Free text is legal *inside* designated fields (descriptions, narratives). The structure itself is always schema-conforming JSON.
4. **Append-only history.** Commits never destroy: `runState.history` keeps a lightweight entry per commit (version, agent, sections, timestamp) while the full superseded payloads live in the `MemoryRevision` table — together they enable diff-based revision plans without bloating the document.
5. **Traceability.** Cross-section references use IDs (`REQ-F-001`, `US-004`, `ENT-User`, `CMP-api-gateway`, `ADR-001`), never prose descriptions. ID grammar lives in `../rules/naming.md`.

## Persistence Mapping (platform runtime)

Memory persists through the existing storage layers (see `../platform/architecture.md`):

- Document + section statuses → PostgreSQL via Prisma (`ProjectMemory`, one versioned document per project; full commit history in `MemoryRevision`). Implemented in `lib/memory/` (Phase 1): `MemoryStore` is the single write path — ownership, schema validation, statuses, optimistic locking.
- Large rendered artifacts (exports, generated docs) → Vercel Blob, referenced by URL from `documentation.exports`.
- Diagram canvas projections → Liveblocks room storage, keyed by diagram ID (Phase 4).

The contract in this file is storage-agnostic; only the persistence adapter (`lib/memory/prisma-adapter.ts`) knows these layers.
