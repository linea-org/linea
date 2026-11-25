import { describe, expect, it } from "vitest"
import { z } from "zod"
import { parseResponse } from "./parse-response.js"

const item = z.strictObject({ id: z.string(), tags: z.array(z.string()) })

describe("parseResponse", () => {
  it("returns a response that matches as it is", () => {
    const value = { id: "a", tags: [] }
    expect(parseResponse(item, value)).toEqual(value)
  })

  it("ignores unknown fields at every depth", () => {
    const page = z.strictObject({
      data: z.array(item),
      owner: item.nullable(),
      meta: z.record(z.string(), z.unknown()),
    })
    const known = {
      data: [
        { id: "a", tags: ["x"] },
        { id: "b", tags: [] },
      ],
      owner: { id: "c", tags: [] },
      meta: { kept: { asIs: true } },
    }
    const received = {
      ...known,
      nextCursor: "n",
      data: known.data.map((entry) => ({ ...entry, createdBy: { id: "u" } })),
      owner: { ...known.owner, role: "admin" },
    }
    expect(parseResponse(page, received)).toEqual(known)
    expect(received).toHaveProperty("nextCursor")
  })

  it("picks the union member that only has fields to ignore", () => {
    const schema = z.strictObject({
      result: z.union([
        z.strictObject({ status: z.literal("failed"), error: z.string() }),
        z.strictObject({ status: z.literal("done"), output: item }),
      ]),
    })
    expect(
      parseResponse(schema, {
        result: {
          status: "done",
          output: { id: "a", tags: [], size: 1 },
          tookMs: 3,
        },
      })
    ).toEqual({ result: { status: "done", output: { id: "a", tags: [] } } })
  })

  it("keeps the most known fields when several union members fit", () => {
    const schema = z.union([
      z.strictObject({ id: z.string() }),
      z.strictObject({ id: z.string(), name: z.string() }),
    ])
    expect(parseResponse(schema, { id: "a", name: "b", added: 1 })).toEqual({
      id: "a",
      name: "b",
    })
  })

  it("does not change the response it was given", () => {
    const received = { id: "a", tags: [], added: { nested: true } }
    parseResponse(item, received)
    expect(received).toEqual({ id: "a", tags: [], added: { nested: true } })
  })

  it.each([
    ["a missing field", { id: "a" }],
    ["a wrong type", { id: 1, tags: [] }],
    ["a wrong type next to an unknown field", { id: 1, tags: [], added: 1 }],
    ["something else", "nope"],
  ])("still refuses %s", (_, received) => {
    expect(() => parseResponse(item, received)).toThrow(z.ZodError)
  })

  it("names only the real problem when there is also an unknown field", () => {
    try {
      parseResponse(item, { id: 1, tags: [], added: 1 })
      expect.unreachable()
    } catch (cause) {
      expect(cause).toBeInstanceOf(z.ZodError)
      expect((cause as z.ZodError).issues.map(({ path }) => path)).toEqual([
        ["id"],
      ])
    }
  })
})
