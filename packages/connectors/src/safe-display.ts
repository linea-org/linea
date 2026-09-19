import { z } from "zod"
import type { ApprovalRequestDisplay } from "@linea/db"

const safeDisplaySchema = z.strictObject({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  details: z.record(z.string(), z.string()).optional(),
})

export function escapeSafeDisplayText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function validateSafeDisplay(value: unknown): ApprovalRequestDisplay {
  const display = safeDisplaySchema.parse(value)
  if (new TextEncoder().encode(JSON.stringify(display)).length > 8_192) {
    throw new Error("Action Intent display must not exceed 8 KiB")
  }
  return display
}
