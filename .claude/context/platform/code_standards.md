# Platform Code Standards

> **Role**: Implementation rules for the platform's own codebase. Authoritative for all app code; `../prompts/coding_rules.md` governs code the *agents* generate for user projects and defers to this file for platform work.
> **Used**: While writing or reviewing any application code.
> **Read by**: Claude Code and developers.
> **Written by**: Platform architects when conventions evolve (update *before* merging code that departs from them).
> **Interacts with**: `architecture.md` (the boundaries these rules protect), `ui.md` (token-based styling), `dev_workflow.md` (how changes are scoped and verified).

## General

- Keep modules small and single-purpose.
- Fix root causes — do not layer workarounds.
- Do not mix unrelated concerns in one component or route.
- Respect the system boundaries defined in `architecture.md`.

## TypeScript

- Strict mode is required throughout the project.
- Avoid `any`; use explicit interfaces or narrowly scoped types.
- Validate unknown external input at system boundaries before trusting it.
- Use `interface` for object contracts.

## Next.js

- Default to React Server Components.
- Add `"use client"` only when the component needs browser interactivity, hooks, or real-time state.
- Keep route handlers focused on a single responsibility.
- Long-running work belongs in background tasks, not in request handlers.
- Next.js 16 has breaking changes (e.g. `proxy.ts` replaces `middleware.ts`) — check `node_modules/next/dist/docs/` before framework-touching code.

## Styling

- Use CSS custom property tokens defined in `globals.css` — no raw Tailwind color classes like `zinc-*` or hardcoded hex values.
- Reference tokens through their Tailwind utility names: `bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, etc.
- Maintain the border radius scale: `rounded-xl` for small elements, `rounded-2xl` for cards, `rounded-3xl` for modals.

## API Routes

- Validate and parse request input before any logic runs.
- Enforce auth and project ownership checks before any mutation.
- Return consistent, predictable response shapes.
- Keep route handlers thin — push complexity into shared modules or background tasks.

## Data and Storage

- Project metadata and relationships belong in PostgreSQL via Prisma.
- Canvas snapshots and generated artifacts belong in Vercel Blob; Prisma stores only the blob URL reference.
- Do not store large generated content directly in the database.
- Task run records are first-class relational data — treat ownership and run IDs as verified before any token issuance.
- Prisma 7: generated client lives in `app/generated/prisma/`; the constructor requires `{ adapter }` (`@prisma/adapter-pg`).

## File Organization

- `lib/` — shared infrastructure: Prisma client, auth helpers, utilities.
- `trigger/` — all durable background tasks and AI workflows.
- `components/` — UI composition only; no business logic.
- `app/api/` — route handlers for auth, triggering, and persistence.
- Name files after the responsibility they contain, not the technology.
