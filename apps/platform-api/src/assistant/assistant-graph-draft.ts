import { z } from 'zod'
import type { ToolDefinition } from '@linealabs/ai'
import {
  workflowGraphSchema,
  workflowTriggerSchema,
  type WorkflowGraph,
} from '@linealabs/runtime'
import { validateAssistantGraph } from './assistant-graph'
import { AssistantOutputError } from './assistant-output-error'

const config = z.record(z.string(), z.unknown())
const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    id: z.string(),
    type: z.string(),
    config: config.default({}),
  }),
  z.object({ op: z.literal('update_node'), id: z.string(), config }),
  z.object({ op: z.literal('remove_node'), id: z.string() }),
  z.object({
    op: z.literal('connect'),
    from: z.string(),
    to: z.string(),
    condition: z.string().optional(),
  }),
  z.object({ op: z.literal('disconnect'), from: z.string(), to: z.string() }),
  z.object({ op: z.literal('set_trigger'), trigger: workflowTriggerSchema }),
])
type Operation = z.infer<typeof operationSchema>

export const EDIT_TOOL: ToolDefinition = {
  name: 'edit_draft',
  description:
    'Apply operations to the draft graph, which starts as the current workflow graph. All operations apply or none do. update_node replaces the whole config; remove_node also removes its edges; set_trigger updates the trigger and the start node together.',
  parameters: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: [
                'add_node',
                'update_node',
                'remove_node',
                'connect',
                'disconnect',
                'set_trigger',
              ],
            },
            id: { type: 'string' },
            type: { type: 'string' },
            config: { type: 'object' },
            from: { type: 'string' },
            to: { type: 'string' },
            condition: { type: 'string' },
            trigger: { type: 'object' },
          },
          required: ['op'],
        },
      },
    },
    required: ['operations'],
  },
}

const EMPTY_GRAPH: WorkflowGraph = {
  version: 1,
  trigger: { type: 'manual' },
  entryNodeId: 'start',
  nodes: [{ id: 'start', type: 'start', config: { triggerType: 'manual' } }],
  edges: [],
}

class OperationError extends Error {}

function apply(graph: WorkflowGraph, operation: Operation): void {
  const node = (id: string) => {
    const found = graph.nodes.find((item) => item.id === id)
    if (!found) throw new OperationError(`there is no node "${id}"`)
    return found
  }
  const edgeIndex = (from: string, to: string) =>
    graph.edges.findIndex((edge) => edge.from === from && edge.to === to)
  switch (operation.op) {
    case 'add_node': {
      if (graph.nodes.some((item) => item.id === operation.id)) {
        throw new OperationError(`node "${operation.id}" already exists`)
      }
      const added = workflowGraphSchema.shape.nodes.element.safeParse(operation)
      if (!added.success) {
        throw new OperationError(
          added.error.issues[0]?.message ?? 'it is malformed',
        )
      }
      graph.nodes.push(added.data)
      return
    }
    case 'update_node':
      node(operation.id).config = operation.config
      return
    case 'remove_node':
      if (operation.id === graph.entryNodeId) {
        throw new OperationError('the start node cannot be removed')
      }
      graph.nodes.splice(graph.nodes.indexOf(node(operation.id)), 1)
      graph.edges = graph.edges.filter(
        (edge) => edge.from !== operation.id && edge.to !== operation.id,
      )
      return
    case 'connect':
      node(operation.from)
      node(operation.to)
      if (edgeIndex(operation.from, operation.to) !== -1) {
        throw new OperationError(
          `"${operation.from}" is already connected to "${operation.to}"`,
        )
      }
      graph.edges.push({
        from: operation.from,
        to: operation.to,
        ...(operation.condition ? { condition: operation.condition } : {}),
      })
      return
    case 'disconnect': {
      const index = edgeIndex(operation.from, operation.to)
      if (index === -1) {
        throw new OperationError(
          `"${operation.from}" is not connected to "${operation.to}"`,
        )
      }
      graph.edges.splice(index, 1)
      return
    }
    case 'set_trigger': {
      const { type, ...schedule } = operation.trigger
      graph.trigger = operation.trigger
      node(graph.entryNodeId).config = { triggerType: type, ...schedule }
    }
  }
}

/** The graph the model builds up with edit_draft during one reply; null when the canvas graph could not be read. */
export class GraphDraft {
  private constructor(private graph: WorkflowGraph | null) {}

  static from(canvas: Record<string, unknown> | undefined): GraphDraft {
    if (!canvas) return new GraphDraft(structuredClone(EMPTY_GRAPH))
    const parsed = workflowGraphSchema.safeParse(canvas)
    return new GraphDraft(parsed.success ? parsed.data : null)
  }

  get current(): WorkflowGraph | null {
    return this.graph
  }

  edit(args: Record<string, unknown>): string {
    if (!this.graph) {
      return 'The current graph could not be read, so it cannot be edited. Answer with a complete graph instead.'
    }
    const parsed = z.array(operationSchema).safeParse(args.operations)
    if (!parsed.success) {
      return `Nothing applied, the operations are malformed: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`
    }
    const next = structuredClone(this.graph)
    for (const [index, operation] of parsed.data.entries()) {
      try {
        apply(next, operation)
      } catch (error) {
        if (!(error instanceof OperationError)) throw error
        return `Nothing applied: operation ${index + 1} (${operation.op}) failed because ${error.message}.`
      }
    }
    this.graph = next
    try {
      validateAssistantGraph(next)
      return `Applied ${parsed.data.length} operations. The draft is valid.`
    } catch (error) {
      if (!(error instanceof AssistantOutputError)) throw error
      return `Applied ${parsed.data.length} operations. The draft is not valid yet: ${error.message}`
    }
  }
}
