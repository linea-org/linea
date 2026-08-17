import { Injectable } from "@nestjs/common"
import {
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  type ConversationTurn,
  type ToolDefinition,
} from "@linea/ai"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

const DEFAULT_MAX_ITERATIONS = 10

type AiTool = {
  name: string
  description?: string
  parameters: Record<string, unknown>
  url: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
}

async function callTool(
  tool: AiTool,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<unknown> {
  const url = new URL(tool.url)
  // GET can't carry a body — the only way to pass arguments is the query string.
  if (tool.method === "GET") {
    for (const [key, value] of Object.entries(args)) {
      url.searchParams.set(key, String(value))
    }
  }
  const response = await fetch(url, {
    method: tool.method,
    headers:
      tool.method === "GET"
        ? undefined
        : { "Content-Type": "application/json" },
    body: tool.method === "GET" ? undefined : JSON.stringify(args),
    signal,
  })
  const contentType = response.headers.get("content-type") ?? ""
  const body: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text()
  return { status: response.status, body }
}

@Injectable()
export class AiNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    _input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const parsed = nodeRegistry.ai.inputSchema.parse({
      prompt: config.prompt,
      model: config.model,
      systemPrompt: config.systemPrompt,
      conversationId: context.conversationId,
      tools: config.tools,
      maxIterations: config.maxIterations,
    })

    const provider = resolveProvider(parsed.model)
    const keyName = resolveKeyName(parsed.model)
    const { apiKey } = await resolveApiKey(db, context.workspaceId, keyName)

    // Chat mode ignores the authored prompt — the turn's real content comes from chatMessageId, since there's no upstream-output templating yet.
    let prompt = parsed.prompt
    let history: ConversationTurn[] | undefined
    if (parsed.conversationId) {
      if (!context.workflowId) {
        throw new Error(
          `Chat execution for conversation ${parsed.conversationId} is missing workflowId`
        )
      }
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        context.workspaceId,
        context.workflowId,
        parsed.conversationId
      )
      const ownIndex = context.chatMessageId
        ? messages.findIndex((message) => message.id === context.chatMessageId)
        : messages.length - 1
      const own = ownIndex === -1 ? undefined : messages[ownIndex]
      // A chatMessageId that doesn't resolve to a real user turn must fail the node, not silently call the provider with the authored fallback.
      if (own?.role !== "user") {
        throw new Error(
          `Chat execution's chatMessageId did not resolve to a user turn in conversation ${parsed.conversationId}`
        )
      }
      prompt = own.content
      // Sliced up to (not including) this execution's own message — a later turn queried before it lands must not be mistaken for history.
      const priorMessages = messages.slice(0, ownIndex)
      const repliedToIds = new Set(
        priorMessages
          .filter((message) => message.role === "assistant")
          .map((message) => message.respondsToMessageId)
      )
      // Drops a still-unanswered earlier turn — otherwise overlapping turns could send the provider consecutive unreplied user messages.
      history = priorMessages
        .filter(
          (message) => message.role !== "user" || repliedToIds.has(message.id)
        )
        .map((message) => ({ role: message.role, content: message.content }))
    }

    const tools: ToolDefinition[] | undefined = parsed.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
    const toolsByName = new Map(
      (parsed.tools ?? []).map((tool) => [tool.name, tool])
    )
    const maxIterations = parsed.maxIterations ?? DEFAULT_MAX_ITERATIONS

    // Empty/no tools resolves on the first iteration exactly like the old single-call path — history
    // stays undefined instead of [] so this is a no-op for every caller that isn't using tools.
    const conversation: ConversationTurn[] = history ?? []
    let nextPrompt: string | undefined = prompt
    let tokensInput = 0
    let tokensOutput = 0

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Unlike HttpNode, idempotencyKey isn't forwarded — no supported provider accepts one.
      const result = await provider.complete(apiKey, {
        model: parsed.model,
        prompt: nextPrompt,
        systemPrompt: parsed.systemPrompt,
        // A snapshot, not the live array — conversation is mutated right after this call returns, and that must not retroactively change what this call was seen to send.
        history: conversation.length > 0 ? [...conversation] : undefined,
        tools,
        signal: context.signal,
      })
      tokensInput += result.tokensInput
      tokensOutput += result.tokensOutput

      if (nextPrompt !== undefined) {
        conversation.push({ role: "user", content: nextPrompt })
      }
      nextPrompt = undefined

      if (!result.toolCalls || result.toolCalls.length === 0) {
        return nodeRegistry.ai.outputSchema.parse({
          text: result.text,
          tokensInput,
          tokensOutput,
        })
      }

      conversation.push({ role: "assistant", toolCalls: result.toolCalls })
      for (const call of result.toolCalls) {
        const tool = toolsByName.get(call.name)
        const output = tool
          ? await callTool(tool, call.arguments, context.signal)
          : { error: `Unknown tool "${call.name}"` }
        conversation.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(output),
        })
      }
    }

    throw new Error(
      `AI node exceeded maxIterations (${maxIterations}) without a final answer`
    )
  }
}
