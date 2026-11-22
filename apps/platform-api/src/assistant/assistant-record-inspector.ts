import { z } from 'zod'
import type { ToolDefinition } from '@linealabs/ai'
import { db, repositories } from '@linealabs/db'
import type { ToolOutcome } from './assistant-tool-contract'
import { capped } from './assistant-run-inspector'

const MAX_DESCRIPTION_CHARS = 300
const MAX_LISTED = 50

const outlineSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), type: z.string() })),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      condition: z.string().optional(),
    }),
  ),
})

function listed(lines: string[]): string[] {
  if (lines.length === 0) return ['- none']
  const shown = lines.slice(0, MAX_LISTED)
  if (lines.length === shown.length) return shown
  return [...shown, `- and ${lines.length - shown.length} more`]
}

function describeEdge(edge: { from: string; to: string; condition?: string }) {
  const condition = edge.condition ? ` [${edge.condition}]` : ''
  return `- ${edge.from} -> ${edge.to}${condition}`
}

/** Only ids and types: node config can hold secrets, headers and prompts. */
function outlineGraph(draftGraph: unknown): string[] {
  const outline = outlineSchema.safeParse(draftGraph)
  if (!outline.success) return ['Draft graph: none yet.']
  const { nodes, edges } = outline.data
  return [
    'Draft nodes:',
    ...listed(nodes.map((node) => `- ${node.id} (${node.type})`)),
    'Draft edges:',
    ...listed(edges.map(describeEdge)),
  ]
}

export const WORKFLOW_TOOL: ToolDefinition = {
  name: 'get_workflow',
  description:
    'Show one Workflow in this workspace: its description, status, published version and an outline of its draft graph (nodes and edges, without node settings).',
  parameters: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: 'The Workflow id' },
    },
    required: ['workflowId'],
  },
}

export const APPLICATION_TOOL: ToolDefinition = {
  name: 'get_application',
  description:
    'Show one Application in this workspace with the ids, names and status of its Workflows and Agents.',
  parameters: {
    type: 'object',
    properties: {
      applicationId: { type: 'string', description: 'The Application id' },
    },
    required: ['applicationId'],
  },
}

export async function inspectWorkflow(
  workspaceId: string,
  workflowId: unknown,
): Promise<ToolOutcome> {
  const id = z.uuid().safeParse(workflowId)
  const workflow = id.success
    ? await repositories.workflow.getWorkflowById(db, workspaceId, id.data)
    : undefined
  if (!workflow) {
    return {
      content: 'No Workflow in this workspace has that id.',
      action: null,
    }
  }
  const published = workflow.publishedVersionId
    ? await repositories.workflow.getWorkflowVersionById(
        db,
        workflow.publishedVersionId,
      )
    : undefined
  let status = 'draft only'
  if (workflow.archivedAt) status = 'archived'
  else if (published) status = `published, version ${published.version}`
  return {
    content: capped([
      `Workflow "${workflow.name}" (${workflow.slug}), ${status}.`,
      workflow.description?.slice(0, MAX_DESCRIPTION_CHARS) ??
        'No description.',
      ...outlineGraph(workflow.draftGraph),
    ]),
    action: null,
  }
}

export async function inspectApplication(
  workspaceId: string,
  applicationId: unknown,
): Promise<ToolOutcome> {
  const id = z.uuid().safeParse(applicationId)
  const application = id.success
    ? await repositories.application.getApplicationById(
        db,
        workspaceId,
        id.data,
      )
    : undefined
  if (!application) {
    return {
      content: 'No Application in this workspace has that id.',
      action: null,
    }
  }
  const [workflows, agents] = await Promise.all([
    repositories.workflow.listWorkflows(db, workspaceId, {
      applicationId: application.id,
    }),
    repositories.agent.listAgents(db, workspaceId, application.id),
  ])
  return {
    content: capped([
      `Application "${application.name}" (${application.slug}).`,
      'Workflows:',
      ...listed(
        workflows.map(
          (item) =>
            `- ${item.id} "${item.name}" (${item.publishedVersionId ? 'published' : 'draft only'})`,
        ),
      ),
      'Agents:',
      ...listed(
        agents
          .filter((agent) => !agent.archivedAt)
          .map((agent) => `- ${agent.id} "${agent.name}"`),
      ),
    ]),
    action: null,
  }
}
