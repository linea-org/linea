import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type { NodeHandler } from "./node-handler.interface"

const MS_PER_UNIT: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
}

// Calendar-aware units can't be a fixed millisecond count — handled via UTC calendar arithmetic
// so they respect variable month lengths and leap years, unlike the fixed-unit branch below.
function addToDate(date: Date, unit: string, amount: number): Date {
  if (unit === "months") {
    const result = new Date(date)
    result.setUTCMonth(result.getUTCMonth() + amount)
    return result
  }
  if (unit === "years") {
    const result = new Date(date)
    result.setUTCFullYear(result.getUTCFullYear() + amount)
    return result
  }
  const msPerUnit = MS_PER_UNIT[unit]
  if (msPerUnit === undefined) {
    throw new Error(`Datetime node: unknown unit "${unit}"`)
  }
  return new Date(date.getTime() + amount * msPerUnit)
}

// Month/year difference ignores day-of-month, matching the common simplification most date
// libraries make for calendar-unit diffs rather than pretending to a false day-level precision.
function diffInUnit(startMs: number, endMs: number, unit: string): number {
  if (unit === "months" || unit === "years") {
    const start = new Date(startMs)
    const end = new Date(endMs)
    const totalMonths =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth())
    return unit === "years" ? Math.trunc(totalMonths / 12) : totalMonths
  }
  const msPerUnit = MS_PER_UNIT[unit]
  if (msPerUnit === undefined) {
    throw new Error(`Datetime node: unknown unit "${unit}"`)
  }
  return Math.trunc((endMs - startMs) / msPerUnit)
}

// A small hand-rolled token formatter, not a full parser — deliberately, matching Transform's
// "no expression language" scope. Reads wall-clock fields for the given timezone (or UTC).
function formatWithTokens(
  date: Date,
  format: string,
  timezone: string | undefined
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00"
  const tokens: Record<string, string> = {
    YYYY: get("year"),
    MM: get("month"),
    DD: get("day"),
    HH: get("hour"),
    mm: get("minute"),
    ss: get("second"),
  }
  return format.replace(
    /YYYY|MM|DD|HH|mm|ss/g,
    (token) => tokens[token] ?? token
  )
}

function extractDatePart(date: Date, part: string): number {
  switch (part) {
    case "year":
      return date.getUTCFullYear()
    case "month":
      return date.getUTCMonth() + 1
    case "day":
      return date.getUTCDate()
    case "hour":
      return date.getUTCHours()
    case "minute":
      return date.getUTCMinutes()
    case "second":
      return date.getUTCSeconds()
    case "dayOfWeek":
      return date.getUTCDay()
    case "dayOfYear": {
      const start = Date.UTC(date.getUTCFullYear(), 0, 1)
      return Math.floor((date.getTime() - start) / MS_PER_UNIT.days) + 1
    }
    default:
      throw new Error(`Datetime node: unknown part "${part}"`)
  }
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Datetime node is missing "${label}"`)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Datetime node could not parse "${label}": "${value}"`)
  }
  return date
}

@Injectable()
export class DatetimeNode implements NodeHandler {
  execute(config: Record<string, unknown>, input: unknown): Promise<unknown> {
    const parsed = nodeRegistry.datetime.inputSchema.parse({ ...config, input })
    // An explicit config value wins; otherwise fall back to the upstream node's output, so this
    // node can operate on a dynamic date without a literal typed into config.
    const primaryDate =
      parsed.date || (typeof input === "string" ? input : undefined)

    switch (parsed.operation) {
      case "getCurrentDate": {
        const now = new Date()
        const result =
          parsed.timezone || parsed.format
            ? formatWithTokens(
                now,
                parsed.format || "YYYY-MM-DDTHH:mm:ss",
                parsed.timezone
              )
            : now.toISOString()
        return Promise.resolve(
          nodeRegistry.datetime.outputSchema.parse({ result })
        )
      }
      case "add":
      case "subtract": {
        const date = parseDate(primaryDate, "date")
        if (!parsed.unit) throw new Error('Datetime node is missing "unit"')
        if (parsed.amount === undefined) {
          throw new Error('Datetime node is missing "amount"')
        }
        const signedAmount =
          parsed.operation === "subtract" ? -parsed.amount : parsed.amount
        const result = addToDate(date, parsed.unit, signedAmount)
        return Promise.resolve(
          nodeRegistry.datetime.outputSchema.parse({
            result: result.toISOString(),
          })
        )
      }
      case "extractPart": {
        const date = parseDate(primaryDate, "date")
        if (!parsed.part) throw new Error('Datetime node is missing "part"')
        return Promise.resolve(
          nodeRegistry.datetime.outputSchema.parse({
            result: extractDatePart(date, parsed.part),
          })
        )
      }
      case "format": {
        const date = parseDate(primaryDate, "date")
        const result = parsed.format
          ? formatWithTokens(date, parsed.format, parsed.timezone)
          : date.toISOString()
        return Promise.resolve(
          nodeRegistry.datetime.outputSchema.parse({ result })
        )
      }
      case "difference": {
        const start = parseDate(parsed.startDate, "startDate")
        const end = parseDate(parsed.endDate, "endDate")
        if (!parsed.unit) throw new Error('Datetime node is missing "unit"')
        const result = diffInUnit(start.getTime(), end.getTime(), parsed.unit)
        return Promise.resolve(
          nodeRegistry.datetime.outputSchema.parse({ result })
        )
      }
    }
  }
}
