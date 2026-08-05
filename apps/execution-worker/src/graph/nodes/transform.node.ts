import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type { NodeHandler } from "./node-handler.interface"

/** Dot-path only, e.g. "body.items" — no expression language, deliberately, for Phase 0's scope. */
function getPath(value: unknown, path: string): unknown {
  if (!path) return value
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, value)
}

@Injectable()
export class TransformNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.transform.inputSchema.parse({
      expression: config.expression ?? "",
      input,
    })

    const output = getPath(parsed.input, parsed.expression)

    return Promise.resolve(
      nodeRegistry.transform.outputSchema.parse({ output })
    )
  }
}
