import { z } from "zod"
import { jsonValueSchema } from "../shared/json-value"
import type { JsonValue } from "../shared/json-value"
import { timestampSchema } from "../shared/timestamp"
import { publicRuntimeIdSchema } from "./conversation"

export const publicExecutionInputLimitBytes = 64 * 1024
const publicExecutionInputDepth = 16
const publicExecutionInputNodes = 2048
const publicExecutionInputCollectionSize = 256

function utf8ByteLength(value: string): number {
  let length = 0
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)
    if (point === undefined) throw new Error("Invalid string index")
    if (point <= 0x7f) length += 1
    else if (point <= 0x7ff) length += 2
    else if (point <= 0xffff) length += 3
    else {
      length += 4
      index += 1
    }
  }
  return length
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isBoundedExecutionInput(
  value: unknown
): value is Record<string, JsonValue> {
  if (!isUnknownRecord(value)) return false
  const rootEntries = Object.entries(value)
  if (rootEntries.length > publicExecutionInputCollectionSize) return false
  const pending = rootEntries.map(([, item]) => ({ item, depth: 1 }))
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) throw new Error("Execution input traversal lost an item")
    nodes += 1
    if (nodes > publicExecutionInputNodes) return false
    if (current.depth > publicExecutionInputDepth) return false
    if (
      current.item === null ||
      typeof current.item === "boolean" ||
      typeof current.item === "string"
    ) {
      continue
    }
    if (typeof current.item === "number") {
      if (!Number.isFinite(current.item)) return false
      continue
    }
    if (Array.isArray(current.item)) {
      if (current.item.length > publicExecutionInputCollectionSize) return false
      for (const item of current.item) {
        pending.push({ item, depth: current.depth + 1 })
      }
      continue
    }
    if (!isUnknownRecord(current.item)) return false
    const entries = Object.entries(current.item)
    if (entries.length > publicExecutionInputCollectionSize) return false
    for (const [, item] of entries) {
      pending.push({ item, depth: current.depth + 1 })
    }
  }
  return utf8ByteLength(JSON.stringify(value)) <= publicExecutionInputLimitBytes
}

export const publicExecutionInputSchema = z.custom<Record<string, JsonValue>>(
  isBoundedExecutionInput,
  { message: "Execution input exceeds public limits" }
)

export const publicExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
])

export const startApplicationExecutionSchema = z.strictObject({
  workflowId: publicRuntimeIdSchema,
  externalSubjectId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema.optional(),
  input: publicExecutionInputSchema,
})

export const startEndUserExecutionSchema = z.strictObject({
  workflowId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema.optional(),
  input: publicExecutionInputSchema,
})

export const publicExecutionSchema = z.strictObject({
  id: publicRuntimeIdSchema,
  applicationId: publicRuntimeIdSchema,
  workflowId: publicRuntimeIdSchema,
  externalSubjectId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema.nullable(),
  status: publicExecutionStatusSchema,
  output: jsonValueSchema.nullable(),
  error: z
    .strictObject({ code: z.string().min(1), message: z.string().min(1) })
    .nullable(),
  createdAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
})

export type StartApplicationExecution = z.infer<
  typeof startApplicationExecutionSchema
>
export type StartEndUserExecution = z.infer<typeof startEndUserExecutionSchema>
export type PublicExecution = z.infer<typeof publicExecutionSchema>
