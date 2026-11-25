import { expect, it } from "vitest"
import {
  assertContractSchema,
  compileContractSchema as compileFor,
} from "../src/compile-contract-schema.js"

const compileContractSchema = (schema: object, workspaceId = "ws-1") =>
  compileFor(schema, workspaceId)

it("keeps earlier validators usable after rotating through tenant schemas", () => {
  const original = compileContractSchema({ type: "string", minLength: 3 })
  for (let i = 0; i < 300; i++) {
    const validate = compileContractSchema({
      type: "object",
      properties: { [`field${i}`]: { type: "number" } },
      additionalProperties: false,
    })
    expect(validate({ [`field${i}`]: i })).toBe(true)
    expect(validate({ [`field${i}`]: "invalid" })).toBe(false)
  }
  expect(original("valid")).toBe(true)
  expect(original(42)).toBe(false)
  expect(() => assertContractSchema({ type: "invalid" })).toThrow()
})
