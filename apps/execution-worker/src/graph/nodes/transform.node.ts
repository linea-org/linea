import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import { getPath } from "./dot-path"
import type { NodeHandler } from "./node-handler.interface"

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
