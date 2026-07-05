# Development Manifesto

> The non-negotiable beliefs that govern how AI Software Architect is designed, built, and evolved. Every contributor — human or agent — reads this before writing a single line.

---

## I. Identity

We are building a **software factory**, not a chatbot. The product turns an idea into a complete, traceable engineering deliverable through coordinated multi-agent work. The output is a body of interconnected artifacts — requirements, stories, architecture, diagrams, schemas, roadmap, backlog — not a conversation thread.

## II. Core Beliefs

### 1. Memory Over Messages

Agents do not talk to each other. They read and write a schema-validated Shared Memory document. Free-text handoffs between agents are defects. The memory document is the single source of truth for a project's state — it is versioned, validated, and inspectable.

### 2. Traceability Is the Product

Every artifact carries an ID and traces upstream:

- Story → requirement → goal
- Component → requirement
- Test → acceptance criterion

If a piece of output cannot prove its lineage, it has no business existing. Traceability is what separates this from prompt-and-pray.

### 3. Schema First, Code Second

Data contracts (`schemas/`) define the shape of every inter-agent exchange before implementation begins. The Coordinator routes and validates — it never produces content. When behavior changes, the contract changes first; the code follows.

### 4. Reuse Before Rebuild

The inherited foundation — canvas, realtime collaboration, auth, background tasks, storage — is the delivery vehicle for the agent system. Extend it, don't replace it. New features prove they need new infrastructure before building any.

### 5. Consistency Is Non-Negotiable

A generated system design where the ERD contradicts the C4 model is worse than no design at all. Validation rules (`rules/consistency.md`, `rules/validation.md`) run after every agent output. Inconsistency is a blocking error, not a warning.

## III. Development Discipline

### Small, Verifiable Increments

- One feature unit or subsystem per implementation step.
- If UI changes and background task changes touch the same step — split.
- If a change cannot be verified end to end quickly, the scope is too broad.

### Spec-Driven, Not Inference-Driven

- Context files define what to build. Do not infer or invent behavior.
- If a requirement is ambiguous, resolve it in the relevant context file *before* implementing.
- If a requirement is missing, log an open question — do not guess.

### Fix Root Causes

No workarounds, no duct tape, no "we'll fix it later" patches. If something is broken, trace it to the root and fix it there. Layers of band-aids are a compounding debt.

### Keep the Knowledge Base Alive

- Update `project_state.md` after every meaningful change.
- If implementation changes architecture, scope, or standards, update the relevant context file *before* continuing.
- Documentation that drifts from code is documentation that lies.

## IV. Technical Principles

### Separation of Concerns

| Boundary             | Responsibility                                          |
| -------------------- | ------------------------------------------------------- |
| `app/api/`           | Auth, validation, ownership checks, task triggering     |
| `trigger/`           | Durable long-running AI work — never in request handlers |
| `lib/`               | Shared infrastructure — no business logic               |
| `components/`        | UI composition — no business logic                      |
| `prisma/`            | Schema and generated client only                        |

### Storage Duality

- **Metadata → PostgreSQL** (Prisma): projects, collaborators, relationships, run records.
- **Artifacts → Vercel Blob**: canvas snapshots, generated specs, heavy content. The database stores only the blob URL reference.
- Large generated content never lives in the database.

### Auth at Every Boundary

Ownership and membership are verified before any mutation. Liveblocks room tokens are issued only after project membership is confirmed. There are no implicit trust paths.

### Server-First by Default

Default to React Server Components. `"use client"` is added only when browser interactivity, hooks, or real-time state demand it. Route handlers stay thin — complexity lives in shared modules or background tasks.

## V. Design Language

- **Dark only.** No light mode. Near-black backgrounds, layered surfaces, vivid accents for interactive elements.
- **Token-driven.** Every color references a CSS custom property — no hardcoded hex, no raw Tailwind colors.
- **Radius hierarchy.** `rounded-xl` → `rounded-2xl` → `rounded-3xl` as surface depth increases.
- **Typography.** Geist Sans for UI, Geist Mono for code. No other fonts.
- **Icons.** Lucide React, stroke-only. No filled variants.

## VI. The Two Planes

This manifesto governs both planes of the project:

- **Design-time** — when *we* build the platform, Claude Code acts as the Coordinator of the work: plan, scope, respect context files, update state.
- **Run-time** — the deployed platform executes the same coordination model as Trigger.dev tasks; agent files under `.claude/context/agents/` are the source of truth for runtime prompts.

The symmetry is intentional. The way we build is the way the product works.

## VII. What We Will Not Do

1. Ship inconsistent artifacts and call them "drafts."
2. Combine unrelated system boundaries in one implementation step.
3. Modify shadcn/ui components or third-party internals without explicit justification.
4. Store large generated content in the database.
5. Invent product behavior not defined in the context files.
6. Let the Coordinator produce content — it plans, routes, validates, and composes.
7. Use free-text for inter-agent communication.
8. Sacrifice long-term clarity for short-term speed.

---

*This manifesto is a living document. When a belief changes, the manifesto changes first — and the codebase follows.*
