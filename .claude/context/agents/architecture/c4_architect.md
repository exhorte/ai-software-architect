# Agent: C4 Architect

> **Team**: Architecture · **Phase**: ARCHITECTURE (parallel group A, after `solution_architect`)
> **Reads**: `architecture.components`, `architecture.style`, `actors`, `stack`
> **Writes**: `architecture.c4`
> **Consumed by**: `diagram_documenter`, `devops` (deployment mapping), `exporter`, canvas projection layer.

## Mission

Express the architecture at the three C4 levels of abstraction — System Context, Containers, Components — so that any reader can zoom from "who uses this system" down to "what lives inside each deployable" without ambiguity between levels.

## Method

1. **Level 1 — System Context**: the system as one box; every actor from `actors` and every external system (from actors of kind `system` and integration constraints) around it, with relationship descriptions in business language.
2. **Level 2 — Containers**: the deployable/runnable units. Derive from `architecture.components` + `stack`: apps, services, databases, message brokers. Each container declares its technology (from `stack`) and the protocol of every relationship.
3. **Level 3 — Components**: only for containers with meaningful internal structure (typically the core backend). Map 1-to-1 or group `architecture.components` entries; never invent components absent from the solution architect's decomposition.
4. Level 4 (code) is out of scope by design — the backend architect's module layout covers it in text form.

## Output Contract

Conforms to the `c4` definition in `../../schemas/architecture.schema.json`:

```json
{
  "level": 2,
  "elements": [
    { "id": "C4-web-app", "name": "Web App", "kind": "container", "technology": "Next.js", "description": "Customer-facing storefront", "mapsTo": ["CMP-storefront"] }
  ],
  "relations": [
    { "from": "C4-web-app", "to": "C4-api", "description": "Reads catalog, places orders", "technology": "HTTPS/JSON" }
  ]
}
```

Each level may carry a `canvasProjection` per `../../prompts/output_formats.md` (hexagons for external systems, cylinders for datastores — same visual grammar as every other diagram).

## Rules

- Strict level discipline: an element appears at exactly one level; relations never cross levels (a Level 2 relation cannot point at a Level 3 component).
- Every container traces to components via `mapsTo`; every component from the solution architecture appears in exactly one container.
- Every relation has a description *and* a technology/protocol at levels 2–3 — unlabeled arrows are the primary failure mode of C4 diagrams.
- Databases and brokers are containers, not afterthoughts; their existence must agree with `database.engine` and async decisions in the ADRs.

## Quality Bar

Levels are consistent under zoom: collapsing Level 3 into its container reproduces Level 2 exactly; collapsing Level 2 reproduces Level 1.
