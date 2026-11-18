import { z } from 'zod'
import type { ToolDefinition } from '@linealabs/ai'
import { db, repositories, type Execution } from '@linealabs/db'
import { describeSteps } from './assistant-run-summary'
import type { ToolOutcome } from './assistant-tool-contract'

export const RECENT_RUNS_TOOL: ToolDefinition = {
  name: 'get_recent_runs',
  description:
    "List this workflow's most recent runs with their status, trigger and error.",
  parameters: { type: 'object', properties: {} },
}

export const RUN_TOOL: ToolDefinition = {
  name: 'get_run',
  description:
    "Show one run of this workflow: each step's status, output and error.",
  parameters: {
    type: 'object',
    properties: {
      executionId: { type: 'string', description: 'The run id' },
    },
    required: ['executionId'],
  },
}

const RECENT_LIMIT = 10

function isEndUserRun(execution: Execution): boolean {
  return (
    execution.externalSubjectId !== null ||
    execution.externalSubjectRecordId !== null
  )
}

export async function listRecentRuns(workflowId: string): Promise<ToolOutcome> {
  const runs = await repositories.execution.listExecutions(db, workflowId, {
    limit: RECENT_LIMIT,
  })
  const lines = runs.map((run) =>
    [
      `- ${run.id} ${run.status}`,
      `${run.trigger} in ${run.environment}`,
      run.createdAt.toISOString(),
      run.error ? `error: ${run.error.message}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  )
  return {
    content: lines.length ? lines.join('\n') : 'This workflow has no runs yet.',
    action: { kind: 'inspect_runs', executionId: null },
  }
}

export async function inspectRun(
  workspaceId: string,
  workflowId: string,
  executionId: unknown,
): Promise<ToolOutcome> {
  const id = z.uuid().safeParse(executionId)
  const found = id.success
    ? await repositories.execution.getExecutionWithSteps(db, id.data)
    : undefined
  const { execution, steps } = found ?? {}
  if (
    !execution ||
    execution.workspaceId !== workspaceId ||
    execution.workflowId !== workflowId
  ) {
    return {
      content: 'No run of this workflow has that id. Use get_recent_runs.',
      action: null,
    }
  }
  const summary = `The run ${execution.status}${execution.error ? `: ${execution.error.message}` : '.'}`
  return {
    content: [
      summary,
      ...describeSteps(steps ?? [], isEndUserRun(execution)),
    ].join('\n'),
    action: { kind: 'inspect_runs', executionId: execution.id },
  }
}
