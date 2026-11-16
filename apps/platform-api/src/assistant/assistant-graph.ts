import {
  assertNoReservedNodeIds,
  validateGraphStructure,
  WorkflowGraphError,
  workflowGraphSchema,
  type WorkflowGraph,
} from '@linea/runtime'
import { ASSISTANT_NODE_TYPES } from './assistant-nodes'
import { AssistantOutputError } from './assistant-output-error'

export function validateAssistantGraph(raw: unknown): WorkflowGraph {
  const parsed = workflowGraphSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || 'graph'}: ${issue.message}`)
    throw new AssistantOutputError(`Invalid graph shape. ${issues.join('; ')}`)
  }
  const graph = parsed.data
  const allowed: readonly string[] = ASSISTANT_NODE_TYPES
  const forbidden = graph.nodes.find((node) => !allowed.includes(node.type))
  if (forbidden) {
    throw new AssistantOutputError(
      `Node "${forbidden.id}" has type "${forbidden.type}", which you may not use. Allowed types: ${ASSISTANT_NODE_TYPES.join(', ')}.`,
    )
  }
  try {
    assertNoReservedNodeIds(graph)
    validateGraphStructure(graph)
  } catch (error) {
    if (error instanceof WorkflowGraphError) {
      throw new AssistantOutputError(error.message)
    }
    throw error
  }
  return graph
}
