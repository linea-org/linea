import type { z } from "zod"

type Issue = z.core.$ZodIssue
type Path = PropertyKey[]

/** Ignores fields this version of the SDK does not know, so the API can add one. */
export function safeParseResponse<T>(
  schema: z.ZodType<T>,
  value: unknown
): z.ZodSafeParseResult<T> {
  const result = schema.safeParse(value)
  if (result.success) return result
  const unknown = result.error.issues.flatMap(unknownFields)
  if (unknown.length === 0) return result
  return safeParseResponse(schema, unknown.reduce(withoutField, value))
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

function withoutField(value: unknown, [key, ...rest]: Path): unknown {
  if (Array.isArray(value)) {
    const items: unknown[] = value
    return items.map((item, index) =>
      index === key ? withoutField(item, rest) : item
    )
  }
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, field]): [string, unknown][] => {
      if (name !== key) return [[name, field]]
      return rest.length === 0 ? [] : [[name, withoutField(field, rest)]]
    })
  )
}
