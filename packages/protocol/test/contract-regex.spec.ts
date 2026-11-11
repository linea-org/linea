import { expect, it } from "vitest"
import { compileContractSchema } from "../src/compile-contract-schema.js"

it.each(["(?=a)a", "(?!a)b", "(?<=a)b", "(?<!a)b", "^(a)\\1$"])(
  "rejects unsupported syntax %s, including stored and unused schemas",
  (pattern) => {
    for (const schema of [
      { type: "string", pattern },
      { type: "object", propertyNames: { pattern } },
      { type: "object", patternProperties: { [pattern]: true } },
      { $defs: { unused: { type: "string", pattern } } },
      { type: "array", prefixItems: [{ type: "string", pattern }] },
      { type: "array", unevaluatedItems: { type: "string", pattern } },
      { type: "object", dependencies: { key: { type: "string", pattern } } },
      {
        type: "object",
        dependentSchemas: { pattern: { type: "string", pattern } },
      },
    ]) {
      expect(() => compileContractSchema(schema)).toThrow(
        "Unsupported contract regex"
      )
    }
  }
)

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
    { type: "array", prefixItems: [overlapping], items: false },
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
