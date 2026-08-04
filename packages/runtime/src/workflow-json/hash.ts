import { createHash } from "node:crypto"
import type { WorkflowGraph } from "./schema.js"

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

/** Canonicalizes key order first, so two semantically equal graphs always hash the same. */
export function hashWorkflowGraph(graph: WorkflowGraph): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(graph)))
    .digest("hex")
}
