import { aiNode } from "./definitions/ai.node.js"
import { approvalNode } from "./definitions/approval.node.js"
import { branchNode } from "./definitions/branch.node.js"
import { endNode } from "./definitions/end.node.js"
import { httpNode } from "./definitions/http.node.js"
import { memoryNode } from "./definitions/memory.node.js"
import { startNode } from "./definitions/start.node.js"
import { transformNode } from "./definitions/transform.node.js"
import type { NodeDefinition } from "./node-definition.js"

export const nodeRegistry = {
  start: startNode,
  end: endNode,
  http: httpNode,
  transform: transformNode,
  branch: branchNode,
  ai: aiNode,
  approval: approvalNode,
  memory: memoryNode,
} satisfies Record<string, NodeDefinition>

export type NodeTypeId = keyof typeof nodeRegistry
