# Glossary

> **Role**: The ubiquitous language of the platform. One term, one meaning, used identically in code, prompts, schemas, UI, and documentation.
> **Used**: Whenever naming anything; whenever a term is ambiguous.
> **Read by**: Everyone — all agents, Claude Code, developers.
> **Written by**: Platform architects; `business/domain_expert` may *propose* additions for user-project domains (those live in the user project's memory, not here — this file covers the platform's own domain only).
> **Interacts with**: `../rules/naming.md` (ID grammar for these concepts), `../schemas/project.schema.json` (field names must match these terms).

## Orchestration

| Term | Definition |
| --- | --- |
| **Coordinator / Orchestrator** | The non-producing brain that plans, routes, validates, and commits. Synonyms — "Orchestrator" is preferred in code. |
| **Agent** | A specialized, stateless producer with a fixed Reads/Writes contract, defined by one file under `agents/`. |
| **Team** | A grouping of agents by concern: Business, Architecture, Engineering, Documentation. Organizational only — teams have no runtime behavior. |
| **Run** | One orchestrated execution triggered by a user request, from classification to composed response. |
| **Plan** | The ordered, validated list of steps the Orchestrator executes for a run. |
| **Step** | One agent invocation within a plan: agent + reads + writes + dependencies. |
| **Phase** | A named stage of a workflow (INTAKE, REQUIREMENTS, …) with an exit gate. |
| **Gate** | The checks a phase must pass to close. |
| **Workflow** | A named pipeline of phases. Default workflow: idea → export. |

## Memory & Artifacts

| Term | Definition |
| --- | --- |
| **Shared Memory** | The single structured JSON document per project that all agents read and enrich. |
| **Section** | A top-level key of Shared Memory with exactly one owning agent. |
| **Section status** | `missing / draft / valid / stale / blocked` — maintained by the Orchestrator. |
| **Artifact** | A rendered, user-facing output (document, diagram, export) derived from memory sections. |
| **Envelope** | The standard JSON wrapper of every agent output (`prompts/output_formats.md`). |
| **Clarification** | A question raised by the analyst; `blocking` clarifications pause the run. |
| **Assumption** | An unanswered non-blocking clarification converted into a recorded decision. |
| **ADR** | Architecture Decision Record: context, decision, alternatives, consequences. |

## Modeling

| Term | Definition |
| --- | --- |
| **Actor** | A human role or external system interacting with the user's future product. |
| **Entity** | A domain object with identity and lifecycle (DDD sense). |
| **Aggregate** | An entity cluster with a consistency boundary and a root. |
| **Business Rule** | A domain invariant or policy, independent of any technology. |
| **Requirement** | A testable statement of need; functional (`REQ-F-*`), non-functional (`REQ-N-*`), or security (`REQ-S-*`). |
| **User Story** | An actor-centric slice of functionality with acceptance criteria, traced to requirements. |
| **Component** | A deployable or logical building block of the designed architecture (`CMP-*`). |
| **C4** | Context / Container / Component (levels 1–3) architecture model. |
| **ERD** | Entity-Relationship Diagram — the database view of entities. |
| **DFD / BPMN** | Data Flow Diagram / Business Process Model — planned diagram types (post-Phase 4). |
| **Canvas projection** | The rendering of a structured diagram onto the collaborative React Flow canvas using the shape/color conventions of `prompts/output_formats.md`. |

## Platform

| Term | Definition |
| --- | --- |
| **Platform** | This SaaS product (the software factory itself). |
| **User project** | A project a *user* asks the platform to design. Never confuse with the platform's own codebase. |
| **Foundation** | The inherited Ghost AI application layer: canvas, realtime, auth, tasks, storage. |
| **Brain** | The `.claude/context/` knowledge base — this directory. |

## Conventions

- Terms are singular in schemas (`requirement`), plural for collections (`requirements`).
- A new concept enters code or schemas only after it enters this glossary.
- If two documents disagree with this file, this file wins; fix the documents.
