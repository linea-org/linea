import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

@Injectable()
export class VariablesNode implements NodeHandler {
  execute(
    config: Record<string, unknown>,
    _input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const current = context.variables ?? {}

    if (config.operation === "get") {
      const key = typeof config.key === "string" ? config.key : ""
      if (!key.trim()) {
        return Promise.resolve(
          nodeRegistry.variables.outputSchema.parse({
            found: true,
            value: current,
          })
        )
      }
      return Promise.resolve(
        nodeRegistry.variables.outputSchema.parse({
          found: Object.hasOwn(current, key),
          value: current[key] ?? null,
        })
      )
    }

    if (config.operation !== "set") {
      throw new Error('Variables node requires operation to be "set" or "get"')
    }

    const entries =
      config.entries !== null && typeof config.entries === "object"
        ? (config.entries as Record<string, unknown>)
        : {}
    const merged = { ...current, ...entries }

    return Promise.resolve(
      nodeRegistry.variables.outputSchema.parse({ variables: merged })
    )
  }
}
