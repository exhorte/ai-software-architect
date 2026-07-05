# Coding Rules

> **Role**: Rules for all code the system produces — illustrative snippets in blueprints today, generated application code in future workflows — and the pointer to the platform's own coding standards.
> **Used**: Layer 2 of prompts for agents that emit code (backend/frontend architects, future code generators); by Claude Code when writing platform code.
> **Read by**: Engineering agents, code-generation workflows, Claude Code.
> **Written by**: Platform architects.
> **Interacts with**: Root `context/code-standards.md` (platform-specific standards), `output_formats.md` (code-block formatting), `../rules/naming.md` (identifier conventions).

## Scope Split

- **Generated code for user projects** (agents' output) → rules below, applied in the user project's chosen stack.
- **The platform's own codebase** (Claude Code working on this repo) → root `context/code-standards.md` is authoritative (TypeScript strict, RSC-first Next.js, token-based styling, thin route handlers, background tasks for long work). This file does not duplicate it.

## Rules for Generated Code

### Correctness before cleverness

1. Code must compile/parse in the target language of `stack` — no pseudo-code presented as code.
2. Types are explicit at public boundaries; no `any`-equivalents in signatures.
3. External input is validated at the boundary before use, matching the validation strategy in `engineering.backend`.
4. Error handling is real: failures propagate through the error taxonomy the blueprint defines — no empty catch blocks, no error-swallowing examples that would be copied verbatim.

### Architecture fidelity

5. Generated code lands in the module the backend/frontend blueprint assigns it to and respects the declared layer dependencies — a snippet that violates the blueprint is wrong even if it runs.
6. Names follow `../rules/naming.md` and the domain glossary: an entity named `Order` in memory is `Order` in code, not `Purchase`.
7. No hidden dependencies: every import a snippet needs is shown or explicitly noted.

### Snippet discipline (blueprint illustrations)

8. Illustrative snippets are ≤ 10 lines, show one pattern each, and carry the language tag plus their target path (`// modules/catalog/service.ts`).
9. Snippets never contain secrets, real URLs, or environment-specific values — use placeholder env-var references.
10. If a snippet demonstrates a trade-off, its comment states the constraint that motivates it — comments explain *why*, never *what the next line does*.

### Security floor (all generated code)

11. Parameterized queries only; no string-built SQL.
12. AuthN/AuthZ checks appear where the authorization matrix demands them — example code for a protected operation includes the check, because examples get copied.
13. Secrets via environment/secret manager, never literals; sensitive data (per `security.dataClassification`) never appears in log statements.
