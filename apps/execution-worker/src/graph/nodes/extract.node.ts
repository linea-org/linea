import { Injectable } from "@nestjs/common"
import { parseExtractionSchema, nodeRegistry } from "@linea/runtime"
import {
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  type ToolDefinition,
} from "@linea/ai"
import { db } from "@linea/db"
import { getPath } from "./dot-path"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"
import { UsageError } from "./usage-error"

const EXTRACTION_TOOL: ToolDefinition = {
  name: "report_extraction",
  description: "Return the fields extracted from the source text.",
  parameters: {},
}

function resolveSource(input: unknown, sourcePath: string | undefined): string {
  const source = sourcePath ? getPath(input, sourcePath) : input
  if (typeof source !== "string") {
    throw new NonRetryableError(
      sourcePath
        ? `Extract node source path "${sourcePath}" must resolve to text`
        : "Extract node input must be text when source path is empty"
    )
  }
  return source
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseConfig(config: Record<string, unknown>) {
  const result = nodeRegistry.extract.inputSchema.safeParse(config)
  if (!result.success) {
    throw new NonRetryableError(
      `Extract node has invalid configuration: ${result.error.message}`,
      { cause: result.error }
    )
  }
  return result.data
}

@Injectable()
export class ExtractNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const parsed = parseConfig(config)
    const source = resolveSource(input, parsed.sourcePath)
    const extractionSchema = parseExtractionSchema(parsed.schema)
    const provider = resolveProvider(parsed.model)
    const keyName = resolveKeyName(parsed.model)
    const { apiKey } = await resolveApiKey(db, context.workspaceId, keyName)
    const result = await provider.complete(apiKey, {
      model: parsed.model,
      systemPrompt:
        "Extract structured data from the source text. Always call report_extraction exactly once. Do not add facts that are not present in the source.",
      prompt: `${parsed.instructions}\n\nSource text:\n${source}`,
      tools: [{ ...EXTRACTION_TOOL, parameters: parsed.schema }],
      signal: context.signal,
    })
    const call = result.toolCalls?.find(
      (toolCall) => toolCall.name === EXTRACTION_TOOL.name
    )
    if (!call) {
      throw new UsageError(
        "Extract model did not return an extraction",
        result.tokensInput,
        result.tokensOutput
      )
    }
    const validation = extractionSchema.safeParse(call.arguments)
    if (!validation.success) {
      throw new UsageError(
        `Extract model returned data that does not match the schema: ${validation.error.message}`,
        result.tokensInput,
        result.tokensOutput
      )
    }
    if (
      validation.data === null ||
      typeof validation.data !== "object" ||
      Array.isArray(validation.data)
    ) {
      throw new UsageError(
        "Extract model returned a non-object extraction",
        result.tokensInput,
        result.tokensOutput
      )
    }
    try {
      return nodeRegistry.extract.outputSchema.parse({
        data: validation.data,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
      })
    } catch (error) {
      throw new UsageError(
        `Extract model returned invalid data: ${errorMessage(error)}`,
        result.tokensInput,
        result.tokensOutput,
        { cause: error }
      )
    }
  }
}
