import { aiNode } from "./definitions/ai.node.js"
import { branchNode } from "./definitions/branch.node.js"
import { httpNode } from "./definitions/http.node.js"
import { transformNode } from "./definitions/transform.node.js"
import type { NodeDefinition } from "./node-definition.js"

export const nodeRegistry = {
  http: httpNode,
  transform: transformNode,
  branch: branchNode,
  ai: aiNode,
} satisfies Record<string, NodeDefinition>

export type NodeTypeId = keyof typeof nodeRegistry
