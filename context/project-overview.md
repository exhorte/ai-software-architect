# AI Software Architect

## Overview

AI Software Architect (working title) is a SaaS platform that acts as a complete AI software-architecture team. A user describes a project idea in plain language; a coordinated multi-agent system analyzes the business domain, asks targeted clarification questions, extracts requirements and user stories, designs the architecture (UML, C4, ERD, security), defines the API and engineering blueprints, and delivers a roadmap, backlog, and exportable documentation bundle. Collaborators watch diagrams appear on a shared real-time canvas and refine the result together.

The agent system itself (teams, coordinator, shared memory, schemas) is specified in `.claude/context/` — this file covers the product surface only.

## Target Workflow

Project description → business analysis → automatic clarification → requirements extraction → architecture → UML diagrams → C4 model → database schema → stack choice → roadmap → backlog → export.

## Goals

1. Turn a plain-language idea into a coherent, traceable engineering deliverable with minimal user effort.
2. Make every artifact explorable and refinable on a collaborative real-time canvas.
3. Keep all artifacts consistent with each other — one validated shared memory, not disconnected documents.
4. Let users export a complete, self-contained documentation bundle.
5. Support revision: users change their mind, and only the affected artifacts regenerate.

## Features

### Platform Surface (inherited Ghost AI foundation — live)

- Authentication and route protection (Clerk); project creation, ownership, collaborators.
- Real-time collaborative canvas (Liveblocks + React Flow): shapes, colors, inline editing, presence, cursors, undo/redo, autosave, starter templates.
- AI sidebar with chat feed, realtime task-run tracking, and spec generation/download.
- Durable AI background tasks (Trigger.dev) writing into the shared canvas.

### Agent System (target — built in phases, see `.claude/context/memory/project_state.md`)

- Coordinator + Hub & Spoke multi-agent pipeline over a schema-validated Shared Memory.
- Business Team: analyst, domain expert, requirements engineer, user-story writer.
- Architecture Team: solution, UML, C4, database, and security architects.
- Engineering Team: API designer, backend/frontend architects, DevOps, QA.
- Documentation Team: technical writer, diagram documenter, roadmap planner, exporter.
- Consistency validation across all artifacts; clarification loop with the user.

## Scope

### In Scope

- The full idea-to-export pipeline described above.
- Canvas projection of generated diagrams (UML, C4, ERD) with collaborative refinement.
- Persistent per-project shared memory with revision support.
- Markdown bundle export (further formats added incrementally).

### Out of Scope (for now)

- Billing and subscription systems.
- Enterprise permission tiers beyond owner and collaborator.
- Code generation, reverse engineering of existing codebases, architecture review workflows (planned post-Phase 6, architecture must not preclude them).
- Mobile-native applications.

## Success Criteria

1. A signed-in user can submit an idea and receive a complete, internally consistent deliverable without writing any artifact by hand.
2. Clarification questions are few, targeted, and only asked when genuinely blocking.
3. Generated diagrams appear on the shared canvas and remain editable by collaborators.
4. Every artifact traces to its upstream sources (story → requirement → goal).
5. The exported bundle is self-contained and honest about assumptions and gaps.
