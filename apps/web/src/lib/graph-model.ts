import type { JsonValue } from "./executions-api"

/** A template from another workspace names models this one may not have a key for, so every model step runs on the chosen one. */
export function withModel(
  graph: Record<string, JsonValue>,
  model: string
): Record<string, JsonValue> {
  const nodes = graph.nodes
  if (!Array.isArray(nodes)) return graph
  return {
    ...graph,
    nodes: nodes.map((node) => {
      if (typeof node !== "object" || node === null || Array.isArray(node)) {
        return node
      }
      const config = node.config
      if (
        typeof config !== "object" ||
        config === null ||
        Array.isArray(config) ||
        typeof config.model !== "string"
      ) {
        return node
      }
      return { ...node, config: { ...config, model } }
    }),
  }
}
