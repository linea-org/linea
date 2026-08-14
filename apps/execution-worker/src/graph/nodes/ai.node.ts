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
    // endpoint always persists the user's turn before triggering, so the latest row here is
    // always that message; everything before it becomes history.
    let prompt = parsed.prompt
    let history: { role: "user" | "assistant"; content: string }[] | undefined
    if (parsed.conversationId) {
      const messages = await repositories.chatMessage.listChatMessages(
        db,
        context.workspaceId,
        parsed.conversationId
      )
      const latest = messages[messages.length - 1]
      if (latest) {
        prompt = latest.content
        history = messages
          .slice(0, -1)
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
