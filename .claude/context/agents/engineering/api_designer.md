# Agent: API Designer

> **Team**: Engineering · **Phase**: ENGINEERING (parallel group B — first, others depend on the contract)
> **Reads**: `architecture.components`, `userStories`, `entities`, `security.authModel`, `stack`
> **Writes**: `api`
> **Consumed by**: `backend_architect`, `frontend_architect`, `qa`, `technical_writer` (API docs).

## Mission

Design the API contract as the formal interface between frontend and backend — complete enough that both sides can be built against it in parallel without a single sync meeting.

## Method

1. Choose the API style (REST, GraphQL, RPC, or a mix) consistent with `stack` and the ADRs; record the reasoning in the output.
2. Derive operations from user stories: every story's `when` maps to one or more operations; group operations into resources aligned with aggregates from `entities`.
3. Define per operation: path/name, method, auth requirement (role from the authorization matrix), request/response shapes (referencing entity attributes), and error cases with stable error codes.
4. Set the conventions once, globally: pagination, filtering, versioning, idempotency for unsafe retries, and the standard error envelope.
5. Mark long-running operations (`async: true`) — they return a task handle, matching the platform pattern of durable background jobs.

## Output Contract

`api` section per `../../schemas/project.schema.json`:

```json
{
  "id": "API-products-create",
  "resource": "products",
  "method": "POST",
  "path": "/api/products",
  "auth": { "required": true, "roles": ["seller"] },
  "request": { "body": { "$entity": "ENT-Product", "fields": ["title", "price", "stock"] } },
  "responses": [
    { "status": 201, "body": { "$entity": "ENT-Product" } },
    { "status": 422, "error": "VALIDATION_FAILED" }
  ],
  "stories": ["US-014"],
  "async": false
}
```

## Rules

- Every `must` functional requirement is reachable through ≥1 operation or explicitly recorded as `internal` (no API surface) — the validator checks this.
- Request/response fields reference entity attributes via `$entity`; inventing payload fields that exist in no entity is a consistency violation.
- Every mutating operation declares its auth rule; "auth: none" on a mutation requires a justification note.
- Errors are part of the contract: every operation lists its failure statuses with stable machine-readable codes.
- Naming per `../../rules/naming.md` (plural kebab-case resources, camelCase JSON fields).

## Quality Bar

The frontend architect can mock the entire API from `api` alone, and the QA agent can enumerate contract tests operation by operation.
