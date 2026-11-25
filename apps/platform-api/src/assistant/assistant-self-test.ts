import { setTimeout as sleep } from 'node:timers/promises'
import { Injectable } from '@nestjs/common'
import type { ToolDefinition } from '@linealabs/ai'
import {
  db,
  repositories,
  type Execution,
  type ExecutionStep,
} from '@linealabs/db'
import {
  hashWorkflowGraph,
  nodeReferences,
  type WorkflowGraph,
} from '@linealabs/runtime'
import { validateAssistantGraph } from './assistant-graph'
import { AssistantOutputError } from './assistant-output-error'
import type { AssistantToolScope, ToolOutcome } from './assistant-tool-contract'

export const TEST_TOOL: ToolDefinition = {
  name: 'test_run_draft',
  description:
    "Run a draft workflow graph once and return each step's status, output and error. Nothing is saved or published.",
  parameters: {
    type: 'object',
    properties: {
      graph: {
        type: 'object',
        description:
          'A complete workflow graph; omit it to test the draft built with edit_draft',
      },
      input: {
        type: 'object',
        description: 'A realistic trigger payload for the start node',
      },
    },
  },
}

export type SelfTestScope = Pick<
  AssistantToolScope,
  'workspaceId' | 'applicationId' | 'userId'
>

const SETTLED: ReadonlySet<Execution['status']> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'paused',
])
const POLL_INTERVAL_MS = 500
const MAX_WAIT_MS = 30_000
const MAX_STEP_CHARS = 1_500
const MAX_RESULT_CHARS = 12_000

/** Refuses drafts whose run could change something outside Linea, send a secret the user has not
 * agreed to send, or outlive the chat turn. A web page can steer what Inky drafts. */
function untestableReason(graph: WorkflowGraph): string | null {
  for (const node of graph.nodes) {
    if (node.type === 'wait') return `"${node.id}" is a wait node`
    if (node.type === 'ai' && !onlyReadTools(node.config.tools)) {
      return `"${node.id}" gives its model a tool that is not GET`
    }
    if (node.config.mcpServers !== undefined) {
      return `"${node.id}" connects to an MCP server`
    }
    if (nodeReferences(node).some(({ root }) => root === 'secrets')) {
      return `"${node.id}" sends a secret`
    }
    if (node.type === 'agent') return `"${node.id}" runs an Agent`
    const method = node.type === 'http' ? (node.config.method ?? 'GET') : 'GET'
    if (method !== 'GET') return `"${node.id}" sends a request that is not GET`
  }
  return null
}

function onlyReadTools(tools: unknown): boolean {
  if (tools === undefined) return true
  if (!Array.isArray(tools)) return false
  return tools.every(
    (tool: unknown) =>
      typeof tool === 'object' &&
      tool !== null &&
      (!('method' in tool) || tool.method === 'GET'),
  )
}

function readInput(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined
  const isObject =
    typeof value === 'object' && value !== null && !Array.isArray(value)
  return isObject ? Object.fromEntries(Object.entries(value)) : null
}

function describeStep(step: ExecutionStep): string {
  const detail = step.error
    ? `error: ${step.error.message}`
    : `output: ${JSON.stringify(step.output ?? null)}`
  return `- ${step.nodeId} (${step.status}) ${detail.slice(0, MAX_STEP_CHARS)}`
}

/** Runs on the Application's hidden scratch workflow, where a member's proposal runs too. */
@Injectable()
export class AssistantSelfTest {
  async run(
    scope: SelfTestScope,
    args: Record<string, unknown>,
  ): Promise<ToolOutcome> {
    let graph: WorkflowGraph
    try {
      graph = validateAssistantGraph(args.graph)
    } catch (error) {
      if (!(error instanceof AssistantOutputError)) throw error
      return {
        content: `Not run, the graph is invalid: ${error.message}`,
        action: null,
      }
    }
    const reason = untestableReason(graph)
    if (reason) {
      return {
        content: `Not run: ${reason}, so a test could have side effects. Propose it untested and say so.`,
        action: null,
      }
    }
    const input = readInput(args.input)
    if (input === null) {
      return { content: 'Not run: input must be a JSON object.', action: null }
    }

    const execution = await this.start(scope, graph, input)
    let settled = await waitToSettle(execution.id)
    const unfinished = !SETTLED.has(settled.execution.status)
    if (unfinished) {
      await repositories.execution.cancelDraftExecution(
        db,
        scope.workspaceId,
        execution.id,
      )
      settled = await readRun(execution.id)
    }
    const steps = settled.steps.filter((step) => !step.isSystemEvent)
    const summary =
      unfinished && settled.execution.status === 'cancelled'
        ? `The run had not finished after ${MAX_WAIT_MS / 1000}s, so it was stopped.`
        : `The run ${settled.execution.status}.`
    return {
      content: [summary, ...steps.map(describeStep)]
        .join('\n')
        .slice(0, MAX_RESULT_CHARS),
      action: {
        kind: 'test_run',
        executionId: execution.id,
        status: settled.execution.status,
      },
    }
  }

  private async start(
    scope: SelfTestScope,
    graph: WorkflowGraph,
    input: Record<string, unknown> | undefined,
  ): Promise<Execution> {
    const scratch = await repositories.workflow.findOrCreateScratchWorkflow(
      db,
      scope.workspaceId,
      scope.applicationId,
    )
    const version = await repositories.workflow.ensureVersionForGraph(
      db,
      scratch.id,
      {
        graph,
        contentHash: hashWorkflowGraph(graph),
      },
    )
    const result =
      await repositories.execution.triggerWorkflowExecutionForVersion(
        db,
        scope.workspaceId,
        scratch.id,
        version.id,
        {
          trigger: 'manual',
          environment: 'draft',
          triggerPayload: input,
          triggeredByUserId: scope.userId,
        },
      )
    if (result.outcome !== 'created') {
      throw new Error(`Could not start the scratch run: ${result.outcome}`)
    }
    return result.execution
  }
}

async function readRun(executionId: string) {
  const found = await repositories.execution.getExecutionWithSteps(
    db,
    executionId,
  )
  if (!found) throw new Error(`Execution ${executionId} disappeared`)
  return found
}

async function waitToSettle(executionId: string) {
  const deadline = Date.now() + MAX_WAIT_MS
  for (;;) {
    const found = await readRun(executionId)
    if (SETTLED.has(found.execution.status) || Date.now() >= deadline) {
      return found
    }
    await sleep(POLL_INTERVAL_MS)
  }
}
