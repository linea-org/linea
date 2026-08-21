import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import { getPath } from "./dot-path"
import type { NodeHandler } from "./node-handler.interface"

function toComparableNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

function matchesCondition(
  item: unknown,
  condition: { path: string; operator: string; value?: unknown }
): boolean {
  const actual = getPath(item, condition.path)

  switch (condition.operator) {
    case "exists":
      return actual !== undefined
    case "notExists":
      return actual === undefined
    case "isEmpty":
      return isEmptyValue(actual)
    case "isNotEmpty":
      return !isEmptyValue(actual)
    case "equals":
      return actual === condition.value
    case "notEquals":
      return actual !== condition.value
    case "contains":
      if (typeof actual === "string" && typeof condition.value === "string") {
        return actual.includes(condition.value)
      }
      return Array.isArray(actual) && actual.includes(condition.value)
    case "notContains":
      return !matchesCondition(item, { ...condition, operator: "contains" })
    case "greaterThan":
    case "lessThan":
    case "greaterThanOrEqual":
    case "lessThanOrEqual": {
      const left = toComparableNumber(actual)
      const right = toComparableNumber(condition.value)
      if (left === undefined || right === undefined) return false
      if (condition.operator === "greaterThan") return left > right
      if (condition.operator === "lessThan") return left < right
      if (condition.operator === "greaterThanOrEqual") return left >= right
      return left <= right
    }
    default:
      throw new Error(`Filter node: unknown operator "${condition.operator}"`)
  }
}

@Injectable()
export class FilterNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.filter.inputSchema.parse({
      items: input,
      conditions: config.conditions,
      combinator: config.combinator,
    })

    const items = parsed.items.filter((item) => {
      if (parsed.conditions.length === 0) return true
      return parsed.combinator === "and"
        ? parsed.conditions.every((condition) =>
            matchesCondition(item, condition)
          )
        : parsed.conditions.some((condition) =>
            matchesCondition(item, condition)
          )
    })

    return Promise.resolve(nodeRegistry.filter.outputSchema.parse({ items }))
  }
}
