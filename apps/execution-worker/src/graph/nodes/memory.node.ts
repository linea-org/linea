import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { getPath } from "./dot-path"
import { resolveNamespace, resolveSubjectId } from "./memory-scope"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

function resolveExpiresAt(ttlSeconds: unknown): Date | undefined {
  if (ttlSeconds === undefined || ttlSeconds === null || ttlSeconds === "") {
    return undefined
  }
  const seconds = Number(ttlSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      'Memory node (write) "ttlSeconds" must be a positive number'
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
    const externalSubjectId = resolveSubjectId(
      input,
      config.subjectPath,
      "Memory node"
    )
    const namespace = resolveNamespace(
      config.namespace,
      context.workflowId,
      "Memory node"
    )
    const key = typeof config.key === "string" ? config.key : ""
    if (!key) {
      throw new Error('Memory node requires a "key"')
    }
    const scope = {
      workspaceId: context.workspaceId,
      externalSubjectId,
      namespace,
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

    await repositories.memory.writeMemory(db, {
      ...scope,
      key,
      value,
      expiresAt,
    })

    return nodeRegistry.memory.outputSchema.parse({
      key,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    })
  }
}
