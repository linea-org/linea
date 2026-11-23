import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linealabs/runtime"
import type { NodeHandler } from "./node-handler.interface"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Array.isArray's own type guard narrows to `any[]`, not `unknown[]` — this local wrapper keeps
// the narrowing safe so a later spread doesn't produce unsafe-assignment lint errors.
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function deepMerge(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  preferSecond: boolean
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...first }
  for (const [key, secondValue] of Object.entries(second)) {
    const firstValue = result[key]
    if (isPlainObject(firstValue) && isPlainObject(secondValue)) {
      result[key] = deepMerge(firstValue, secondValue, preferSecond)
      continue
    }
    // A key only on one side always survives — the conflict strategy only decides ties.
    if (!(key in result) || preferSecond) {
      result[key] = secondValue
    }
  }
  return result
}

@Injectable()
export class MergeNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.merge.inputSchema.parse({
      mode: config.mode,
      conflictStrategy: config.conflictStrategy,
      inputs: input,
    })
    const { inputs } = parsed
    const preferLater = parsed.conflictStrategy === "preferSecond"

    let result: unknown
    switch (parsed.mode) {
      case "concat": {
        if (!inputs.every(isUnknownArray)) {
          throw new Error(
            "Merge node (concat) requires every input to be an array"
          )
        }
        result = inputs.flat(1)
        break
      }
      case "deepMerge": {
        if (!inputs.every(isPlainObject)) {
          throw new Error(
            "Merge node (deepMerge) requires every input to be an object"
          )
        }
        result = inputs.reduce((merged, next) =>
          deepMerge(merged, next, preferLater)
        )
        break
      }
      case "zip": {
        if (!inputs.every(isUnknownArray)) {
          throw new Error(
            "Merge node (zip) requires every input to be an array"
          )
        }
        // Truncates to the shortest input, no padding — matches n8n's own documented Combine-by-
        // Position behavior for uneven lengths, not an invented default.
        const length = Math.min(...inputs.map((input) => input.length))
        const ordered = preferLater ? inputs : inputs.toReversed()
        result = Array.from({ length }, (_, i) =>
          ordered.reduce<Record<string, unknown>>(
            (row, input) => ({
              ...row,
              ...(input[i] as Record<string, unknown>),
            }),
            {}
          )
        )
        break
      }
    }

    return Promise.resolve(nodeRegistry.merge.outputSchema.parse({ result }))
  }
}
