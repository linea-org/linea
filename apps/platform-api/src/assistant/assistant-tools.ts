import { Injectable } from '@nestjs/common'
import type { ToolCall, ToolDefinition } from '@linealabs/ai'
import {
  AssistantSelfTest,
  TEST_TOOL,
  type SelfTestScope,
} from './assistant-self-test'
import type { ToolOutcome } from './assistant-tool-outcome'
import { fetchPage, WEB_TOOL } from './assistant-web-fetch'

export function assistantTools({ web }: { web: boolean }): ToolDefinition[] {
  return web ? [TEST_TOOL, WEB_TOOL] : [TEST_TOOL]
}

/** The only things the assistant can do besides talk; each call is untrusted model output. */
@Injectable()
export class AssistantTools {
  constructor(private readonly selfTest: AssistantSelfTest) {}

  async run(
    call: ToolCall,
    scope: SelfTestScope & { web: boolean },
  ): Promise<ToolOutcome> {
    const url = call.arguments.url
    if (scope.web && call.name === WEB_TOOL.name && typeof url === 'string') {
      return fetchPage(url)
    }
    if (call.name === TEST_TOOL.name) {
      return this.selfTest.run(scope, call.arguments)
    }
    const names = assistantTools(scope).map((tool) => tool.name)
    return {
      content: `The tool call was not valid. Available tools: ${names.join(', ')}.`,
      action: null,
    }
  }
}
