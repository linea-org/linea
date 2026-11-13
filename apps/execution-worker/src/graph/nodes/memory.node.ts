import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { getPath } from "./dot-path"
import { resolveMemoryScope } from "./memory-scope"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

const MAX_TTL_SECONDS = 365 * 24 * 60 * 60

function resolveExpiresAt(ttlSeconds: unknown): Date {
  if (ttlSeconds === undefined || ttlSeconds === null || ttlSeconds === "") {
    return new Date(Date.now() + repositories.memory.DEFAULT_MEMORY_TTL_MS)
  }
  const seconds = Number(ttlSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_TTL_SECONDS) {
    throw new Error(
      `Memory node (write) "ttlSeconds" must be between 1 and ${MAX_TTL_SECONDS}`
    )
  }
  return new Date(Date.now() + seconds * 1000)
}

@Injectable()
export class MemoryNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const scope = resolveMemoryScope(
      context,
      input,
      { subjectPath: config.subjectPath, namespace: config.namespace },
      "Memory node"
    )
    const key = typeof config.key === "string" ? config.key : ""
    if (!key) {
      throw new Error('Memory node requires a "key"')
    }
    if (config.operation === "read") {
      const row = await repositories.memory.readMemory(db, { ...scope, key })
      return nodeRegistry.memory.outputSchema.parse({
        found: row !== undefined,
        value: row?.value ?? null,
      })
    }
    if (config.operation !== "write") {
      throw new Error('Memory node requires operation to be "read" or "write"')
    }

    const hasValuePath =
      typeof config.valuePath === "string" && config.valuePath.trim() !== ""
    const value = hasValuePath
      ? getPath(input, config.valuePath as string)
      : input
    if (hasValuePath && value === undefined) {
      throw new Error(
        `Memory node: no value found at valuePath "${config.valuePath as string}"`
      )
    }
    const expiresAt = resolveExpiresAt(config.ttlSeconds)

    // No content restriction on `value` here — it's stored as whatever this workflow wrote,
    // including free-form text. If an Agent node later recalls it (see ai.node.ts's memory-recall
    // block), that string reaches a model call as plain text; see the trust-boundary comment there
    // for why that's a documented, unresolved limitation rather than something to guard against here.
    await repositories.memory.writeMemory(db, {
      ...scope,
      key,
      value,
      expiresAt,
    })

    return nodeRegistry.memory.outputSchema.parse({
      key,
      expiresAt: expiresAt.toISOString(),
    })
  }
}
