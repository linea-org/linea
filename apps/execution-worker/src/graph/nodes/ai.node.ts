import { Injectable } from "@nestjs/common"
import { resolveApiKey, resolveKeyName, resolveProvider } from "@linea/ai"
import { db } from "@linea/db"
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
    })

    const provider = resolveProvider(parsed.model)
    const keyName = resolveKeyName(parsed.model)
    const { apiKey } = await resolveApiKey(db, context.workspaceId, keyName)

    // Unlike HttpNode, context.idempotencyKey isn't forwarded here — none of the 4 supported
    // providers accept one (see the provider files under packages/ai/src/providers).
    const result = await provider.complete(apiKey, {
      model: parsed.model,
      prompt: parsed.prompt,
      systemPrompt: parsed.systemPrompt,
      signal: context.signal,
    })

    return nodeRegistry.ai.outputSchema.parse(result)
  }
}
