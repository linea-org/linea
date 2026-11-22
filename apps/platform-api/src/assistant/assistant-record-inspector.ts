import { z } from 'zod'
import type { ToolDefinition } from '@linealabs/ai'
import { db, repositories } from '@linealabs/db'
import type { ToolOutcome } from './assistant-tool-contract'
import { capped } from './assistant-run-inspector'

export const WORKFLOW_TOOL: ToolDefinition = {
  name: 'get_workflow',
  description:
    'Show one Workflow in this workspace: its description, whether it is published, and its draft graph.',
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
    'Show one Application in this workspace with its Workflows and Agents and their ids.',
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
  return {
    content: capped([
      `Workflow "${workflow.name}" (${workflow.slug}) in Application ${workflow.applicationId}.`,
      workflow.description ?? 'No description.',
      workflow.publishedVersionId
        ? `Published as version ${workflow.publishedVersionId}.`
        : 'Not published.',
      ...(workflow.archivedAt ? ['Archived.'] : []),
      `Draft graph: ${JSON.stringify(workflow.draftGraph ?? null)}`,
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
  const [workflows, allAgents] = await Promise.all([
    repositories.workflow.listWorkflows(db, workspaceId, {
      applicationId: application.id,
    }),
    repositories.agent.listAgents(db, workspaceId, application.id),
  ])
  const agents = allAgents.filter((agent) => !agent.archivedAt)
  return {
    content: capped([
      `Application "${application.name}" (${application.slug}).`,
      'Workflows:',
      ...(workflows.length
        ? workflows.map((item) => `- "${item.name}" ${item.id}`)
        : ['- none']),
      'Agents:',
      ...(agents.length
        ? agents.map((agent) => `- "${agent.name}" ${agent.id}`)
        : ['- none']),
    ]),
    action: null,
  }
}
