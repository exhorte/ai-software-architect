/**
 * Schema registry: loads the canonical JSON Schemas from .claude/context/schemas/
 * (imported at build time — the single source of truth, never copied) and
 * exposes a compiled validator for the Shared Memory document.
 *
 * Decision D1 (see project_state.md): build-time JSON import keeps the runtime
 * bundle self-contained (Trigger.dev workers in Phase 2) and makes schema/code
 * drift impossible.
 */
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020"

import projectSchema from "../../.claude/context/schemas/project.schema.json"
import architectureSchema from "../../.claude/context/schemas/architecture.schema.json"
import umlSchema from "../../.claude/context/schemas/uml.schema.json"
import databaseSchema from "../../.claude/context/schemas/database.schema.json"
import envelopeSchema from "../../.claude/context/schemas/envelope.schema.json"

const SCHEMA_BASE = "https://ai-software-architect.dev/schemas/"
export const PROJECT_SCHEMA_ID = `${SCHEMA_BASE}project.schema.json`
export const UML_SCHEMA_ID = `${SCHEMA_BASE}uml.schema.json`
export const ARCHITECTURE_SCHEMA_ID = `${SCHEMA_BASE}architecture.schema.json`
export const DATABASE_SCHEMA_ID = `${SCHEMA_BASE}database.schema.json`
export const ENVELOPE_SCHEMA_ID = `${SCHEMA_BASE}envelope.schema.json`

let cachedAjv: Ajv2020 | null = null

function getAjv(): Ajv2020 {
  if (cachedAjv) return cachedAjv

  const ajv = new Ajv2020({
    // Collect every violation instead of stopping at the first: agents receive
    // the complete error list on retry (rules/validation.md).
    allErrors: true,
    // The canonical schemas are hand-authored; strict-mode heuristics
    // (e.g. unknown-format warnings) must not reject them.
    strict: false,
  })

  ajv.addSchema(architectureSchema)
  ajv.addSchema(umlSchema)
  ajv.addSchema(databaseSchema)
  ajv.addSchema(projectSchema)
  ajv.addSchema(envelopeSchema)

  cachedAjv = ajv
  return ajv
}

/** Compiled validator for any registered canonical schema, by $id (cached). */
export function getValidator(schemaId: string): ValidateFunction {
  const validate = getAjv().getSchema(schemaId)
  if (!validate) {
    throw new Error(`Schema ${schemaId} is not registered`)
  }
  return validate
}

/** Compiled validator for the full Shared Memory document. */
export function getDocumentValidator(): ValidateFunction {
  return getValidator(PROJECT_SCHEMA_ID)
}
