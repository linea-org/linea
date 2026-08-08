import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type { NodeHandler } from "./node-handler.interface"

// Order-independent for object keys (JSON.stringify isn't — {a,b} and {b,a}
// serialize differently despite being the same value), order-dependent for
// arrays, since array order is semantically meaningful.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => deepEqual(item, b[i]))
    )
  }
  const aEntries = Object.entries(a as Record<string, unknown>)
  const bRecord = b as Record<string, unknown>
  return (
    aEntries.length === Object.keys(bRecord).length &&
    aEntries.every(([key, value]) => deepEqual(value, bRecord[key]))
  )
}

@Injectable()
export class BranchNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.branch.inputSchema.parse({ value: input })

    // Structural, not ===: every node's output is a freshly-built object
    // literal (e.g. transform's { output }), so reference equality would
    // never match a case even when the shape is identical.
    const cases = (config.cases ?? {}) as Record<string, unknown>
    const matched = Object.entries(cases).find(([, expected]) =>
      deepEqual(expected, parsed.value)
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
