import { createHash } from "node:crypto"
import type { WorkflowGraph } from "./schema.js"

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === "object") {
    // Code-unit order, not locale order, so the hash never depends on the host locale.
    return Object.keys(value)
      .sort((a, b) => Number(a > b) - Number(a < b))
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
