import { isDeepStrictEqual } from "node:util"
import type { NodeType, WorkflowNode } from "@linea/runtime"

// Destinations, headers, tools and Memory scope are deliberately absent: a Replay may only vary how a node computes, never where it reaches.
const overridableKeys: Record<NodeType, "any" | readonly string[]> = {
  start: "any",
  end: "any",
  transform: "any",
  branch: "any",
  filter: "any",
  merge: "any",
  datetime: "any",
  variables: "any",
  ai: ["model", "systemPrompt", "prompt", "maxIterations", "retryPolicy"],
  extract: ["model", "sourcePath", "instructions", "schema", "retryPolicy"],
  evaluator: ["model", "sample", "metrics", "retryPolicy"],
  http: ["retryPolicy"],
  memory: ["retryPolicy"],
  connector: [],
  agent: [],
  approval: [],
  wait: [],
}

/** Override keys that change a value a Replay must keep as recorded; repeating the stored value is allowed because the dashboard sends the whole config. */
export function lockedOverrideKeys(
  node: WorkflowNode,
  overrideConfig: Record<string, unknown>
): string[] {
  const allowed = overridableKeys[node.type]
  if (allowed === "any") return []
  return Object.keys(overrideConfig).filter(
    (key) =>
      !allowed.includes(key) &&
      !isDeepStrictEqual(overrideConfig[key], node.config[key])
  )
}
