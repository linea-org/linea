import { expect, it } from "vitest"
import { compileContractSchema } from "../src/compile-contract-schema.js"

const nested: Record<string, unknown> = { d40: { type: "string" } }
for (let index = 0; index < 40; index++) {
  const next = { $ref: `#/$defs/d${index + 1}` }
  nested[`d${index}`] = { allOf: [next, next] }
}
const hostile = "a".repeat(100_000) + "!"

it.each([
  ["a backtracking pattern", { type: "string", pattern: "^(a+)+$" }, hostile],
  [
    "counted repeats",
    { type: "string", pattern: "a{0,1000}".repeat(200) + "c$" },
    hostile,
  ],
  [
    "a slow property name",
    { type: "object", propertyNames: { pattern: "^(a|aa)+$" } },
    { [hostile]: 1 },
  ],
  ["nested references", { $ref: "#/$defs/d0", $defs: nested }, "a"],
  [
    "unique items",
    { type: "array", uniqueItems: true },
    Array.from({ length: 60_000 }, (_, index) => ({ index })),
  ],
])("refuses data made slow to check by %s", (_name, schema, data) => {
  const check = compileContractSchema(schema)
  const started = performance.now()
  expect(check(data)).toBe(false)
  expect(performance.now() - started).toBeLessThan(1000)
  expect(check.errors).toEqual([{ message: "took too long to check" }])
})

it("refuses a schema that is slow to compile, and compiles the next one", () => {
  const schema = {
    type: "object",
    properties: { [hostile]: true },
    patternProperties: { "^(a|aa)+$": true },
  }
  expect(() => compileContractSchema(schema)).toThrow("was stopped")
  expect(compileContractSchema({ type: "string" })("a")).toBe(true)
})

it("preserves ordinary regex, Unicode and referenced schema validation", () => {
  const validate = compileContractSchema({
    type: "object",
    $defs: { name: { type: "string", pattern: "^\\p{Letter}+$" } },
    propertyNames: { pattern: "^[a-z]+$" },
    patternProperties: { "^name$": { $ref: "#/$defs/name" } },
    additionalProperties: false,
  })
  expect(validate({ name: "Héllo世界" })).toBe(true)
  expect(validate({ name: "abc123" })).toBe(false)
  expect(validate({ Name: "Hello" })).toBe(false)
  expect(validate({ other: "Hello" })).toBe(false)
  expect(
    compileContractSchema({ type: "string", pattern: "cat" })("a cat!")
  ).toBe(true)
  expect(compileContractSchema({ type: "string", pattern: "^.$" })("😀")).toBe(
    true
  )
  expect(() =>
    compileContractSchema({ type: "string", pattern: "[" })
  ).toThrow()
})

it("preserves strict rejection of overlapping properties at nested schema paths", () => {
  const overlapping = {
    type: "object",
    properties: { name: { type: "string" } },
    patternProperties: { "^name$": true },
  }
  for (const schema of [
    overlapping,
    { type: "array", prefixItems: [overlapping], minItems: 1, items: false },
    { type: "object", dependentSchemas: { key: overlapping } },
    { type: "object", dependencies: { key: overlapping } },
  ]) {
    expect(() => compileContractSchema(schema)).toThrow("matches pattern")
  }
})

it("does not interpret annotation or constant data as subschemas", () => {
  const data = { pattern: "(?=a)a", patternProperties: { "(?=x)": true } }
  expect(compileContractSchema({ const: data })(data)).toBe(true)
  expect(compileContractSchema({ default: data })(null)).toBe(true)
})
