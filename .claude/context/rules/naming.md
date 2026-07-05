# Naming Rules

> **Role**: The single ID grammar and naming convention set for everything in Shared Memory and its projections. Names are contracts — the traceability system works only because IDs are predictable.
> **Used**: By every agent when creating any identifiable thing; by `validation.md` to reject malformed IDs.
> **Read by**: All agents, Orchestrator, validator.
> **Written by**: Platform architects. New ID families are added here *before* the schema that uses them.
> **Interacts with**: `../schemas/*.json` (patterns enforce this grammar), `../memory/glossary.md` (terms these names are built from).

## ID Grammar

| Family | Pattern | Example | Issued by |
| --- | --- | --- | --- |
| Goal | `GOAL-NN` | `GOAL-02` | analyst |
| Assumption | `ASM-NNN` | `ASM-002` | analyst / Orchestrator (from unanswered clarifications) |
| Clarification | `CLR-NNN` | `CLR-003` | analyst |
| Actor | `ACT-PascalCase` | `ACT-Seller` | analyst |
| Entity | `ENT-PascalCase` | `ENT-OrderLine` | domain_expert |
| Business rule | `BR-NNN` | `BR-007` | domain_expert |
| Requirement | `REQ-F-NNN` / `REQ-N-NNN` / `REQ-S-NNN` | `REQ-F-012` | requirements (F/N), security_architect (S) |
| Epic / Story | `EPIC-NN` / `US-NNN` | `US-014` | user_story |
| Component | `CMP-kebab-case` | `CMP-order-service` | solution_architect |
| ADR | `ADR-NNN` | `ADR-001` | solution_architect (proposals from others via `issues`) |
| C4 element | `C4-kebab-case` | `C4-web-app` | c4_architect |
| Threat | `THR-NNN` | `THR-004` | security_architect |
| UML diagram | `UML-<type>-kebab` (`class`, `seq`, `usecase`, `activity`, `deploy`) | `UML-seq-checkout` | uml_architect / devops (deploy) |
| API operation | `API-<resource>-<action>` kebab | `API-products-create` | api_designer |
| Roadmap phase / risk | `PH-NN` / `RSK-NN` | `PH-01` | roadmap |
| Backlog item / enabler | `BLG-NNN` / `ENB-kebab-case` | `ENB-ci-pipeline` | roadmap |

Rules: numeric suffixes are zero-padded and never reused after deletion (tombstoned, not recycled); IDs are immutable once committed — renaming a concept changes its `name`, never its ID.

## Canvas & Diagram Projections

- Node ID = lowercased, kebab-cased memory ID: `ENT-OrderLine` → `ent-order-line`.
- Edge ID = `edge-<source>-<target>` (append `-N` only on multi-edges): `edge-order-customer`.
- Diagram element display names use the memory `name`, never the ID.

## Domain & Code Naming

- **Memory JSON fields**: camelCase, singular for objects, plural for arrays.
- **Entities**: singular PascalCase business nouns (`Order`); no technical suffixes (`OrderData`, `OrderInfo` are defects).
- **Domain events**: PascalCase past tense (`OrderPlaced`).
- **Database**: `snake_case`; tables plural (`orders`), columns singular (`unit_price`), junction tables `<a>_<b>` alphabetical (`orders_products`), indexes `idx_<table>_<cols>`.
- **API**: resources plural kebab-case (`/api/order-lines`), JSON payload fields camelCase, error codes SCREAMING_SNAKE (`PAYMENT_DECLINED`).
- **Bounded contexts**: PascalCase business names (`Fulfillment`), used consistently in `entities.context` and component `boundedContext`.

## Meta (this repository)

- Context files: `snake_case.md` inside `.claude/context/` (matching the established tree); agent files named after the role, not the person-metaphor (`qa.md`, not `tester-bob.md`).
- One glossary term per concept — before naming something new, check `../memory/glossary.md`; if the concept is new, add the term there first.
