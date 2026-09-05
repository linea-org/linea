import { aiNode } from "./definitions/ai.node.js"
import { approvalNode } from "./definitions/approval.node.js"
import { branchNode } from "./definitions/branch.node.js"
import { datetimeNode } from "./definitions/datetime.node.js"
import { endNode } from "./definitions/end.node.js"
import { evaluatorNode } from "./definitions/evaluator.node.js"
import { extractNode } from "./definitions/extract.node.js"
import { filterNode } from "./definitions/filter.node.js"
import { httpNode } from "./definitions/http.node.js"
import { memoryNode } from "./definitions/memory.node.js"
import { mergeNode } from "./definitions/merge.node.js"
import { startNode } from "./definitions/start.node.js"
import { transformNode } from "./definitions/transform.node.js"
import { variablesNode } from "./definitions/variables.node.js"
import { waitNode } from "./definitions/wait.node.js"
import type { NodeDefinition } from "./node-definition.js"

export const nodeRegistry = {
  start: startNode,
  end: endNode,
  evaluator: evaluatorNode,
  http: httpNode,
  transform: transformNode,
  branch: branchNode,
  ai: aiNode,
  extract: extractNode,
  approval: approvalNode,
  memory: memoryNode,
  wait: waitNode,
  datetime: datetimeNode,
  filter: filterNode,
  merge: mergeNode,
  variables: variablesNode,
} satisfies Record<string, NodeDefinition>

export type NodeTypeId = keyof typeof nodeRegistry
