# AI Software Architect

> Working title — final product name TBD.

**AI Software Architect** is a SaaS platform where a multi-agent AI software factory turns a plain-language project idea into a complete engineering deliverable: business analysis, targeted clarifications, requirements, user stories, architecture with ADRs, UML / C4 / ERD diagrams on a collaborative real-time canvas, database schema, API contract, stack choice, security model, test strategy, roadmap, backlog, and an exportable documentation bundle.

The system is not a chatbot. A **Coordinator** plans and routes work across four specialized agent teams — **Business**, **Architecture**, **Engineering**, **Documentation** — that communicate exclusively through a schema-validated **Shared Memory**. Every artifact carries an ID and traces upstream (story → requirement → goal; component → requirement; test → acceptance criterion).

## How It Works

```text
Idea → Business analysis → Clarification → Requirements & stories
     → Architecture (style, ADRs, UML, C4, ERD, security, stack)
     → Engineering (API, backend/frontend blueprints, DevOps, tests)
     → Documentation (roadmap, backlog, docs, diagram narratives)
     → Consistency validation → Composed response / Export
```

The full specification of this pipeline lives in [`.claude/context/`](.claude/context/) — the project brain: coordinator specs, 18 agent contracts, memory contract, JSON schemas, templates, and validation/consistency rules. Start with [`CLAUDE.md`](CLAUDE.md).

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 + TypeScript + React 19 |
| UI | Tailwind CSS v4 + shadcn/ui (dark theme) |
| Auth | Clerk |
| Database | Prisma 7 + PostgreSQL |
| Realtime canvas | Liveblocks + React Flow |
| Background AI tasks | Trigger.dev v4 |
| Artifact storage | Vercel Blob |
| LLM | Google Gemini via Vercel AI SDK (multi-LLM planned) |

## Getting Started

**Prerequisites**: Node.js ≥ 20, npm, a PostgreSQL database, and accounts for Clerk, Liveblocks, Trigger.dev, Google AI Studio, Vercel Blob.

```bash
npm install
```

Create `.env` at the project root:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Liveblocks
LIVEBLOCKS_SECRET_KEY=

# Trigger.dev
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=
NEXT_PUBLIC_TRIGGER_PUBLIC_API_KEY=

# Database
DATABASE_URL=

# Storage
BLOB_READ_WRITE_TOKEN=

# Google AI
GOOGLE_AI_API_KEY=

APP_URL=http://localhost:3000
```

Run the app and the background-task worker in two terminals:

```bash
npm run dev
npx trigger.dev@latest dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Create/apply a migration |
| `npx prisma studio` | Database GUI |

## Project Structure

```text
.
├── .claude/context/      # The brain: coordinator, agents, memory, schemas, rules
├── context/              # Host-app implementation context (architecture, UI, standards)
├── app/                  # Next.js routes: pages + API (auth, projects, AI, specs)
├── components/           # UI (editor, canvas) + shadcn primitives (ui/ — do not modify)
├── hooks/                # Client hooks (autosave, shortcuts, project actions)
├── lib/                  # Prisma client, Liveblocks client, access control
├── prisma/               # Schema (multi-file) + migrations
├── trigger/              # Durable AI tasks (design agent, spec generator)
└── types/                # Shared TypeScript types
```

## Status

Phase 0 (foundations of the agent system) is complete; the platform currently ships the inherited collaborative-canvas foundation with single-task AI generation. The transformation roadmap toward the full multi-agent pipeline is tracked in [`.claude/context/memory/project_state.md`](.claude/context/memory/project_state.md).
