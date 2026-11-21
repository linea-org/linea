import { z } from 'zod'
import type { ToolDefinition } from '@linealabs/ai'
import {
  db,
  repositories,
  type Execution,
  type ExecutionStep,
} from '@linealabs/db'
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
const MAX_DETAIL_CHARS = 1_500
const MAX_RESULT_CHARS = 12_000

function capped(lines: string[]): string {
  const text = lines.join('\n')
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n[cut at ${MAX_RESULT_CHARS} characters]`
    : text
}

/** With hideContent, only statuses and errors show, never what an End-User sent or got back. */
function describeStep(step: ExecutionStep, hideContent: boolean): string {
  let detail = `output: ${JSON.stringify(step.output ?? null)}`
  if (hideContent) detail = 'output hidden (End-User run)'
  if (step.error) detail = `error: ${step.error.message}`
  return `- ${step.nodeId} (${step.status}) ${detail.slice(0, MAX_DETAIL_CHARS)}`
}

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
      run.error ? `error: ${run.error.message.slice(0, MAX_DETAIL_CHARS)}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  )
  return {
    content: lines.length ? capped(lines) : 'This workflow has no runs yet.',
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
    execution?.workspaceId !== workspaceId ||
    execution.workflowId !== workflowId
  ) {
    return {
      content: 'No run of this workflow has that id. Use get_recent_runs.',
      action: null,
    }
  }
  const error = execution.error?.message.slice(0, MAX_DETAIL_CHARS)
  const ending = error ? `: ${error}` : '.'
  const hideContent = isEndUserRun(execution)
  const lines = (steps ?? [])
    .filter((step) => !step.isSystemEvent)
    .map((step) => describeStep(step, hideContent))
  return {
    content: capped([`The run ${execution.status}${ending}`, ...lines]),
    action: { kind: 'inspect_runs', executionId: execution.id },
  }
}
