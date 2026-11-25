import type { z } from "zod"

type Issue = z.core.$ZodIssue
type Path = PropertyKey[]
// A tree of paths; a key without keys of its own is the field to remove.
type Removals = Map<PropertyKey, Removals>

/** Ignores fields this version of the SDK does not know, so the API can add one. */
export function safeParseResponse<T>(
  schema: z.ZodType<T>,
  value: unknown
): z.ZodSafeParseResult<T> {
  const result = schema.safeParse(value)
  if (result.success) return result
  const unknown = result.error.issues.flatMap(unknownFields)
  if (unknown.length === 0) return result
  return schema.safeParse(without(value, removals(unknown)))
}

export function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = safeParseResponse(schema, value)
  if (!result.success) throw result.error
  return result.data
}

function unknownFields(issue: Issue): Path[] {
  if (issue.code === "unrecognized_keys")
    return issue.keys.map((key) => [...issue.path, key])
  if (issue.code !== "invalid_union") return []
  // Of the members that fit apart from unknown fields, the one that knows the most.
  const [member = []] = issue.errors
    .filter((issues) => issues.every(onlyUnknownFields))
    .map((issues) => issues.flatMap(unknownFields))
    .sort((left, right) => left.length - right.length)
  return member.map((path) => [...issue.path, ...path])
}

function onlyUnknownFields(issue: Issue): boolean {
  return issue.code === "unrecognized_keys" || unknownFields(issue).length > 0
}

function removals(paths: Path[]): Removals {
  const root: Removals = new Map()
  for (const path of paths) {
    let node = root
    for (const key of path) {
      const next = node.get(key) ?? new Map<PropertyKey, Removals>()
      node.set(key, next)
      node = next
    }
  }
  return root
}

function without(value: unknown, fields: Removals): unknown {
  if (Array.isArray(value)) {
    const items: unknown[] = value
    return items.map((item, index) => {
      const inner = fields.get(index)
      return inner ? without(item, inner) : item
    })
  }
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, field]): [string, unknown][] => {
      const inner = fields.get(name)
      if (!inner) return [[name, field]]
      return inner.size === 0 ? [] : [[name, without(field, inner)]]
    })
  )
}
