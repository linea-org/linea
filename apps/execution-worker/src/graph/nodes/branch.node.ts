import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type { NodeHandler } from "./node-handler.interface"

@Injectable()
export class BranchNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.branch.inputSchema.parse({ value: input })

    // Structural, not ===: every node's output is a freshly-built object
    // literal (e.g. transform's { output }), so reference equality would
    // never match a case even when the shape is identical.
    const cases = (config.cases ?? {}) as Record<string, unknown>
    const matched = Object.entries(cases).find(
      ([, expected]) =>
        JSON.stringify(expected) === JSON.stringify(parsed.value)
    )
    const branch = matched?.[0] ?? (config.defaultBranch as string | undefined)

    if (!branch) {
      throw new Error(
        `Branch node found no matching case for value ${JSON.stringify(parsed.value)}`
      )
    }

    return Promise.resolve(nodeRegistry.branch.outputSchema.parse({ branch }))
  }
}
