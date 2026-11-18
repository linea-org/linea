import { Injectable } from '@nestjs/common'
import type { ToolCall, ToolDefinition } from '@linealabs/ai'
import { AGENTS_TOOL, listAgents } from './assistant-agents'
import {
  inspectRun,
  listRecentRuns,
  RECENT_RUNS_TOOL,
  RUN_TOOL,
} from './assistant-run-inspector'
import { AssistantSelfTest, TEST_TOOL } from './assistant-self-test'
import type { AssistantToolScope, ToolOutcome } from './assistant-tool-contract'
import { fetchPage, WEB_TOOL } from './assistant-web-fetch'

export function assistantTools(
  scope: Pick<AssistantToolScope, 'web' | 'workflowId'>,
): ToolDefinition[] {
  return [
    TEST_TOOL,
    AGENTS_TOOL,
    ...(scope.workflowId ? [RECENT_RUNS_TOOL, RUN_TOOL] : []),
    ...(scope.web ? [WEB_TOOL] : []),
  ]
}

/** The only things the assistant can do besides talk; each call is untrusted model output. */
@Injectable()
export class AssistantTools {
  constructor(private readonly selfTest: AssistantSelfTest) {}

  async run(call: ToolCall, scope: AssistantToolScope): Promise<ToolOutcome> {
    const { name, arguments: args } = call
    const offered = assistantTools(scope).map((tool) => tool.name)
    if (!offered.includes(name)) {
      return {
        content: `The tool call was not valid. Available tools: ${offered.join(', ')}.`,
        action: null,
      }
    }
    const { url, executionId } = args
    const { workflowId } = scope
    if (name === TEST_TOOL.name) return this.selfTest.run(scope, args)
    if (name === AGENTS_TOOL.name) return listAgents(scope)
    if (name === WEB_TOOL.name && typeof url === 'string') return fetchPage(url)
    if (name === RECENT_RUNS_TOOL.name && workflowId) {
      return listRecentRuns(workflowId)
    }
    if (name === RUN_TOOL.name && workflowId) {
      return inspectRun(scope.workspaceId, workflowId, executionId)
    }
    return { content: `${name} needs different arguments.`, action: null }
  }
}
