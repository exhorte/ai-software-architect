/**
 * Document validation: level 1 (schema) + level 2 (identifier uniqueness),
 * producing the structured error list of rules/validation.md § Error Reporting.
 * Level 3+ (completeness, cross-artifact consistency) belongs to the
 * orchestrator's gates (Phase 2+), not to the memory layer.
 */
import type { ErrorObject } from "ajv"

import { getDocumentValidator } from "./schemas"
import type { MemoryDocument, ValidationError } from "./types"

/** Collections whose items carry a unique identifier, as "path → id field". */
const ID_COLLECTIONS: Array<{ path: string; idField: string }> = [
  { path: "clarifications", idField: "id" },
  { path: "actors", idField: "id" },
  { path: "entities", idField: "id" },
  { path: "businessRules", idField: "id" },
  { path: "requirements", idField: "id" },
  { path: "userStories", idField: "id" },
  { path: "backlog", idField: "id" },
  { path: "architecture.components", idField: "id" },
  { path: "architecture.adrs", idField: "id" },
  { path: "architecture.uml", idField: "id" },
  { path: "api.operations", idField: "id" },
  { path: "security.threats", idField: "id" },
  { path: "database.tables", idField: "name" },
]

function sectionOf(instancePath: string): string {
  const [first] = instancePath.replace(/^\//, "").split("/")
  return first || "(document)"
}

function fromAjvError(error: ErrorObject): ValidationError {
  return {
    level: 1,
    section: sectionOf(error.instancePath),
    path: error.instancePath || "/",
    rule: error.keyword,
    message: `${error.instancePath || "document"} ${error.message ?? "is invalid"}`,
  }
}

function resolvePath(document: MemoryDocument, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[key]
    return undefined
  }, document)
}

function findDuplicateIds(document: MemoryDocument): ValidationError[] {
  const errors: ValidationError[] = []

  for (const { path, idField } of ID_COLLECTIONS) {
    const collection = resolvePath(document, path)
    if (!Array.isArray(collection)) continue

    const seen = new Set<string>()
    collection.forEach((item, index) => {
      const id = (item as Record<string, unknown>)?.[idField]
      if (typeof id !== "string") return
      if (seen.has(id)) {
        errors.push({
          level: 2,
          section: sectionOf(`/${path.replace(".", "/")}`),
          path: `/${path.replace(".", "/")}/${index}/${idField}`,
          rule: "unique-id",
          message: `Duplicate identifier "${id}" in ${path}.`,
        })
      }
      seen.add(id)
    })
  }

  return errors
}

/**
 * Validates a full Shared Memory document. Returns an empty array when the
 * document is valid; otherwise every violation found (levels 1 and 2).
 */
export function validateDocument(document: MemoryDocument): ValidationError[] {
  const validate = getDocumentValidator()

  const errors: ValidationError[] = []
  if (!validate(document)) {
    for (const error of validate.errors ?? []) {
      errors.push(fromAjvError(error))
    }
    // Schema-invalid documents can still be scanned for duplicates safely,
    // but level-1 errors come first in the list agents receive.
  }

  errors.push(...findDuplicateIds(document))
  return errors
}
