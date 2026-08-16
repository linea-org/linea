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

    // In chat mode the authored `prompt` config isn't used for the turn's content — there's
    // no upstream-output templating in the interpreter yet, so the only way this node sees
    // the user's actual message is via the conversation's message log. The chat-preview
    // endpoint persists the user's turn and stamps its id into triggerPayload as
    // chatMessageId before triggering, so this execution can find its own turn precisely —
    // "whichever message is latest" breaks the moment a second turn is submitted before this
    // execution's AI node gets here, since both executions would then answer the second turn.
    let prompt = parsed.prompt
    let history: { role: "user" | "assistant"; content: string }[] | undefined
    if (parsed.conversationId && context.workflowId) {
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
      // A forged/stale chatMessageId could point at an assistant message — only a real user turn is a valid prompt.
      if (own?.role === "user") {
        prompt = own.content
        // Sliced up to (not including) this execution's own message, not the whole array minus
        // one — a later turn that landed in the table before this query ran, but after this
        // execution's own turn, must not be mistaken for history or for the prompt.
        history = messages
          .slice(0, ownIndex)
          .map((message) => ({ role: message.role, content: message.content }))
      }
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
