import { z } from "zod"

export const cursorSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/)
export const eventCursorSchema = cursorSchema

export type Cursor = z.infer<typeof cursorSchema>
export type EventCursor = z.infer<typeof eventCursorSchema>
