import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const datetimeUnitSchema = z.enum([
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
])

const datetimePartSchema = z.enum([
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "dayOfWeek",
  "dayOfYear",
])

// The builder only has text/textarea/select/code/key-value widgets — no dedicated numeric one —
// so "amount" always arrives as a string from the config editor. Preprocessed rather than
// z.coerce'd: an empty string must still read as "missing" (surfaced as the handler's own clear
// "Datetime node is missing amount" error), not silently coerce to 0 the way Number("") would.
const amountSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}, z.number().optional())

const datetimeInputSchema = z.object({
  // Runtime value from the upstream node — used as the date when the "date" config field below
  // is left empty, so this node can operate on a date coming from an earlier step without
  // requiring a literal to be typed in. Not a ui.fields entry.
  input: z.unknown().optional(),
  operation: z.enum([
    "add",
    "subtract",
    "extractPart",
    "format",
    "getCurrentDate",
    "difference",
  ]),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  unit: datetimeUnitSchema.optional(),
  amount: amountSchema,
  part: datetimePartSchema.optional(),
  // Custom token string (YYYY/MM/DD/HH/mm/ss) — empty means ISO 8601.
  format: z.string().optional(),
  // IANA zone, e.g. "America/New_York" — only affects formatting, never arithmetic.
  timezone: z.string().optional(),
})

const datetimeOutputSchema = z.object({
  result: z.union([z.string(), z.number()]),
})

const unitOptions = [
  { label: "Seconds", value: "seconds" },
  { label: "Minutes", value: "minutes" },
  { label: "Hours", value: "hours" },
  { label: "Days", value: "days" },
  { label: "Weeks", value: "weeks" },
  { label: "Months", value: "months" },
  { label: "Years", value: "years" },
]

export const datetimeNode: NodeDefinition<
  z.infer<typeof datetimeInputSchema>,
  z.infer<typeof datetimeOutputSchema>
> = {
  id: "datetime",
  inputSchema: datetimeInputSchema,
  outputSchema: datetimeOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Datetime",
    description: "Format, parse, and do date/time arithmetic.",
    category: "data",
    icon: "calendar-clock",
    fields: [
      {
        key: "operation",
        label: "Operation",
        widget: "select",
        options: [
          { label: "Add to a date", value: "add" },
          { label: "Subtract from a date", value: "subtract" },
          { label: "Extract part of a date", value: "extractPart" },
          { label: "Format a date", value: "format" },
          { label: "Get current date/time", value: "getCurrentDate" },
          { label: "Difference between two dates", value: "difference" },
        ],
      },
      {
        key: "date",
        label: "Date (ISO 8601)",
        widget: "text",
        description: "Leave empty to use the upstream node's output instead.",
        showIf: {
          key: "operation",
          equals: ["add", "subtract", "extractPart", "format"],
        },
      },
      {
        key: "startDate",
        label: "Start date (ISO 8601)",
        widget: "text",
        showIf: { key: "operation", equals: "difference" },
      },
      {
        key: "endDate",
        label: "End date (ISO 8601)",
        widget: "text",
        showIf: { key: "operation", equals: "difference" },
      },
      {
        key: "unit",
        label: "Unit",
        widget: "select",
        options: unitOptions,
        showIf: { key: "operation", equals: ["add", "subtract", "difference"] },
      },
      {
        key: "amount",
        label: "Amount",
        widget: "text",
        showIf: { key: "operation", equals: ["add", "subtract"] },
      },
      {
        key: "part",
        label: "Part",
        widget: "select",
        options: [
          { label: "Year", value: "year" },
          { label: "Month", value: "month" },
          { label: "Day", value: "day" },
          { label: "Hour", value: "hour" },
          { label: "Minute", value: "minute" },
          { label: "Second", value: "second" },
          { label: "Day of week", value: "dayOfWeek" },
          { label: "Day of year", value: "dayOfYear" },
        ],
        showIf: { key: "operation", equals: "extractPart" },
      },
      {
        key: "format",
        label: "Format (YYYY, MM, DD, HH, mm, ss — empty for ISO 8601)",
        widget: "text",
        showIf: { key: "operation", equals: "format" },
      },
      {
        key: "timezone",
        label: "Timezone (IANA, e.g. America/New_York)",
        widget: "text",
        showIf: { key: "operation", equals: ["format", "getCurrentDate"] },
      },
    ],
    summaryField: "operation",
  },
}
