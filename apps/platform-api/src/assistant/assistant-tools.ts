import { Injectable } from '@nestjs/common'
import type { ToolCall, ToolDefinition } from '@linealabs/ai'
import { AGENTS_TOOL, listAgents } from './assistant-agents'
import { EDIT_TOOL, type GraphDraft } from './assistant-graph-draft'
import {
  APPLICATION_TOOL,
  inspectApplication,
  inspectWorkflow,
  WORKFLOW_TOOL,
} from './assistant-record-inspector'
import {
  inspectRun,
  listRecentRuns,
  RECENT_RUNS_TOOL,
  RUN_TOOL,
} from './assistant-run-inspector'
import { ANSWER_TOOL } from './assistant-reply'
import { AssistantSelfTest, TEST_TOOL } from './assistant-self-test'
import type { AssistantToolScope, ToolOutcome } from './assistant-tool-contract'
import { fetchPage, WEB_TOOL } from './assistant-web-fetch'

export function assistantTools(
  scope: Pick<AssistantToolScope, 'web' | 'workflowId' | 'mentions'>,
): ToolDefinition[] {
  return [
    ANSWER_TOOL,
    EDIT_TOOL,
    TEST_TOOL,
    AGENTS_TOOL,
    ...(scope.workflowId ? [RECENT_RUNS_TOOL] : []),
    RUN_TOOL,
    ...(scope.mentions ? [WORKFLOW_TOOL, APPLICATION_TOOL] : []),
    ...(scope.web ? [WEB_TOOL] : []),
  ]
}

/** The only things the assistant can do besides talk; each call is untrusted model output. */
@Injectable()
export class AssistantTools {
  constructor(private readonly selfTest: AssistantSelfTest) {}

  async run(
    call: ToolCall,
    scope: AssistantToolScope,
    draft: GraphDraft,
  ): Promise<ToolOutcome> {
    const { name, arguments: args } = call
    const offered = assistantTools(scope).map((tool) => tool.name)
    if (!offered.includes(name)) {
      return {
        content: `The tool call was not valid. Available tools: ${offered.join(', ')}.`,
        action: null,
      }
    }
    if (name === ANSWER_TOOL.name) {
      return {
        content: 'Read the other results first, then answer on its own.',
        action: null,
      }
    }
    const { url, executionId } = args
    const { workflowId } = scope
    if (name === EDIT_TOOL.name) {
      return { content: draft.edit(args), action: null }
    }
    if (name === TEST_TOOL.name) {
      return this.selfTest.run(scope, {
        ...args,
        graph: args.graph ?? draft.current,
      })
    }
    if (name === AGENTS_TOOL.name) return listAgents(scope)
    if (name === WEB_TOOL.name && typeof url === 'string') return fetchPage(url)
    if (name === RECENT_RUNS_TOOL.name && workflowId) {
      return listRecentRuns(workflowId)
    }
    if (name === RUN_TOOL.name) {
      return inspectRun(scope.workspaceId, workflowId, executionId)
    }
    if (name === WORKFLOW_TOOL.name) {
      return inspectWorkflow(scope.workspaceId, args.workflowId)
    }
    if (name === APPLICATION_TOOL.name) {
      return inspectApplication(scope.workspaceId, args.applicationId)
    }
    return { content: `${name} needs different arguments.`, action: null }
  }
}
