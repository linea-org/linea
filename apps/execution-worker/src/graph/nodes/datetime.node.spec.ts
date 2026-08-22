import { DatetimeNode } from "./datetime.node"

describe("DatetimeNode", () => {
  it("adds a duration to a date", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "add",
        date: "2026-01-01T00:00:00.000Z",
        unit: "days",
        amount: 5,
      },
      undefined
    )

    expect(output).toEqual({ result: "2026-01-06T00:00:00.000Z" })
  })

  it("accepts amount as a string, matching what the builder's text-widget config actually sends", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "add",
        date: "2026-01-01T00:00:00.000Z",
        unit: "days",
        amount: "5",
      },
      undefined
    )

    expect(output).toEqual({ result: "2026-01-06T00:00:00.000Z" })
  })

  it("treats an empty string amount as missing, not as zero", () => {
    const node = new DatetimeNode()

    expect(() =>
      node.execute(
        {
          operation: "add",
          date: "2026-01-01T00:00:00.000Z",
          unit: "days",
          amount: "",
        },
        undefined
      )
    ).toThrow('missing "amount"')
  })

  it("treats a whitespace-only string amount as missing, not as zero", () => {
    const node = new DatetimeNode()

    expect(() =>
      node.execute(
        {
          operation: "add",
          date: "2026-01-01T00:00:00.000Z",
          unit: "days",
          amount: "   ",
        },
        undefined
      )
    ).toThrow('missing "amount"')
  })

  it("subtracts a duration from a date", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "subtract",
        date: "2026-01-06T00:00:00.000Z",
        unit: "days",
        amount: 5,
      },
      undefined
    )

    expect(output).toEqual({ result: "2026-01-01T00:00:00.000Z" })
  })

  it("adds calendar months, respecting variable month length", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "add",
        date: "2026-01-31T00:00:00.000Z",
        unit: "months",
        amount: 1,
      },
      undefined
    )

    // JS Date's own month-overflow rule (Jan 31 + 1 month rolls into March, not clamped to Feb 28).
    expect(output).toEqual({ result: "2026-03-03T00:00:00.000Z" })
  })

  it("extracts a part of a date", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "extractPart",
        date: "2026-03-15T10:30:00.000Z",
        part: "day",
      },
      undefined
    )

    expect(output).toEqual({ result: 15 })
  })

  it("formats a date with custom tokens", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "format",
        date: "2026-03-05T09:07:03.000Z",
        format: "YYYY-MM-DD HH:mm:ss",
      },
      undefined
    )

    expect(output).toEqual({ result: "2026-03-05 09:07:03" })
  })

  it("formats as ISO 8601 when no format string is given", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      { operation: "format", date: "2026-03-05T09:07:03.000Z" },
      undefined
    )

    expect(output).toEqual({ result: "2026-03-05T09:07:03.000Z" })
  })

  it("falls back to the upstream input when no literal date is configured", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      { operation: "extractPart", part: "year" },
      "2026-05-01T00:00:00.000Z"
    )

    expect(output).toEqual({ result: 2026 })
  })

  it("prefers a configured literal date over the upstream input", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "extractPart",
        date: "2020-01-01T00:00:00.000Z",
        part: "year",
      },
      "2026-05-01T00:00:00.000Z"
    )

    expect(output).toEqual({ result: 2020 })
  })

  it("returns the current date as ISO 8601 by default", async () => {
    const node = new DatetimeNode()
    const before = Date.now()

    const output = (await node.execute(
      { operation: "getCurrentDate" },
      undefined
    )) as { result: string }
    const after = Date.now()

    const resultMs = new Date(output.result).getTime()
    expect(resultMs).toBeGreaterThanOrEqual(before)
    expect(resultMs).toBeLessThanOrEqual(after)
  })

  it("computes the difference between two dates in days", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "difference",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-11T00:00:00.000Z",
        unit: "days",
      },
      undefined
    )

    expect(output).toEqual({ result: 10 })
  })

  it("computes the difference between two dates in whole calendar months", async () => {
    const node = new DatetimeNode()

    const output = await node.execute(
      {
        operation: "difference",
        startDate: "2026-01-15T00:00:00.000Z",
        endDate: "2026-04-01T00:00:00.000Z",
        unit: "months",
      },
      undefined
    )

    expect(output).toEqual({ result: 3 })
  })

  it("throws a clear error when the date is missing and there is no upstream input", () => {
    const node = new DatetimeNode()

    expect(() => node.execute({ operation: "format" }, undefined)).toThrow(
      'missing "date"'
    )
  })

  it("throws a clear error when the date can't be parsed", () => {
    const node = new DatetimeNode()

    expect(() =>
      node.execute({ operation: "format", date: "not-a-date" }, undefined)
    ).toThrow("could not parse")
  })
})
