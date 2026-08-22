import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
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
    const [first, second] = parsed.inputs

    let result: unknown
    switch (parsed.mode) {
      case "concat": {
        if (!isUnknownArray(first) || !isUnknownArray(second)) {
          throw new Error(
            "Merge node (concat) requires both inputs to be arrays"
          )
        }
        result = [...first, ...second]
        break
      }
      case "deepMerge": {
        if (!isPlainObject(first) || !isPlainObject(second)) {
          throw new Error(
            "Merge node (deepMerge) requires both inputs to be objects"
          )
        }
        result = deepMerge(
          first,
          second,
          parsed.conflictStrategy === "preferSecond"
        )
        break
      }
      case "zip": {
        if (!isUnknownArray(first) || !isUnknownArray(second)) {
          throw new Error("Merge node (zip) requires both inputs to be arrays")
        }
        // Truncates to the shorter input, no padding — matches n8n's own documented Combine-by-
        // Position behavior for uneven lengths, not an invented default.
        const length = Math.min(first.length, second.length)
        const preferSecond = parsed.conflictStrategy === "preferSecond"
        result = Array.from({ length }, (_, i) => {
          const left = first[i] as Record<string, unknown>
          const right = second[i] as Record<string, unknown>
          return preferSecond ? { ...left, ...right } : { ...right, ...left }
        })
        break
      }
    }

    return Promise.resolve(nodeRegistry.merge.outputSchema.parse({ result }))
  }
}
