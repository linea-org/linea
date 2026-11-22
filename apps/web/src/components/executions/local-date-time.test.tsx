import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { formatCost } from "./execution-list"
import { LocalDateTime } from "./local-date-time"

describe("LocalDateTime", () => {
  it("renders the ISO value on the server, whatever its locale and time zone", () => {
    const value = "2026-11-18T09:36:34.000Z"
    expect(renderToString(<LocalDateTime value={value} />)).toBe(
      `<time dateTime="${value}">${value}</time>`
    )
  })
})

describe("formatCost", () => {
  it("formats USD the same on every runtime locale", () => {
    expect(formatCost("1234500000")).toBe("$1,234.50")
    expect(formatCost("10000", true)).toBe("$0.01 (partial)")
    expect(formatCost("0", null)).toBe("—")
  })
})
