import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"
import { nodeRegistry } from "@linea/runtime"
import { getPath } from "./dot-path"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

function resolveSubjectId(input: unknown, subjectPath: unknown): string {
  if (typeof subjectPath !== "string" || subjectPath.trim() === "") {
    throw new Error('Memory node requires a "subjectPath"')
  }
  const resolved = getPath(input, subjectPath)
  if (resolved === null || resolved === undefined) {
    throw new Error(
      `Memory node: no value found at subjectPath "${subjectPath}"`
    )
  }
  if (typeof resolved === "string") return resolved
  if (typeof resolved === "number" || typeof resolved === "boolean") {
    return String(resolved)
  }
  throw new Error(
    `Memory node: value at subjectPath "${subjectPath}" must be a string, number, or boolean`
  )
}

function resolveNamespace(
  config: Record<string, unknown>,
  context: NodeExecutionContext
): string {
  if (typeof config.namespace === "string" && config.namespace.trim() !== "") {
    return config.namespace
  }
  if (context.workflowId) return context.workflowId
  throw new Error("Memory node has no namespace and no workflowId in context")
}

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
    const externalSubjectId = resolveSubjectId(input, config.subjectPath)
    const namespace = resolveNamespace(config, context)
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

    const value =
      typeof config.valuePath === "string" && config.valuePath.trim() !== ""
        ? getPath(input, config.valuePath)
        : input
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
