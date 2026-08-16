import { Injectable } from "@nestjs/common"
import { resolveApiKey, resolveKeyName, resolveProvider } from "@linea/ai"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

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
    })

    const provider = resolveProvider(parsed.model)
    const keyName = resolveKeyName(parsed.model)
    const { apiKey } = await resolveApiKey(db, context.workspaceId, keyName)

    // Chat mode ignores the authored prompt — the turn's real content comes from chatMessageId, since there's no upstream-output templating yet.
    let prompt = parsed.prompt
    let history: { role: "user" | "assistant"; content: string }[] | undefined
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

    // Unlike HttpNode, idempotencyKey isn't forwarded — no supported provider accepts one.
    const result = await provider.complete(apiKey, {
      model: parsed.model,
      prompt,
      systemPrompt: parsed.systemPrompt,
      history,
      signal: context.signal,
    })

    return nodeRegistry.ai.outputSchema.parse(result)
  }
}
