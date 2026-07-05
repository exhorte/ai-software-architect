<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## AI Software Architect

This repository is a SaaS platform where a multi-agent AI software factory (Coordinator + Business / Architecture / Engineering / Documentation teams over a shared, schema-validated memory) turns a project idea into a complete engineering deliverable. `CLAUDE.md` is the canonical entry point — read it first; it defines the philosophy, the two planes (design-time vs. run-time), and the context-loading order.

### Knowledge Base

Everything lives in `.claude/context/` — structure and reading order: `CLAUDE.md` § Context Loading.

- Agent system: `coordinator/`, `agents/`, `memory/`, `prompts/`, `schemas/`, `templates/`, `rules/`.
- Application implementation context (read before implementing app code): `platform/`
  1. `platform/overview.md` — product definition, goals, features, and scope
  2. `platform/architecture.md` — system structure, boundaries, storage model, and invariants
  3. `platform/ui.md` — theme, tokens, typography, canvas design, and component conventions
  4. `platform/code_standards.md` — implementation rules and conventions
  5. `platform/dev_workflow.md` — development workflow, scoping rules, and delivery approach

### State Tracking

Update `.claude/context/memory/project_state.md` (durable build state) and `.claude/context/memory/handoff.md` (live session flow) after each meaningful implementation change. If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.
