// Rotate whole compilers so cached tenant schemas and generated validators are collectible.
import Ajv2020 from "ajv/dist/2020.js"
import type { AnySchema, ValidateFunction } from "ajv"
import RE2 from "re2"

const regExp = Object.assign(
  (pattern: string, flags: string) => {
    try {
      return new RE2(pattern, flags)
    } catch (error) {
      throw new Error(`Unsupported contract regex ${JSON.stringify(pattern)}`, {
        cause: error,
      })
    }
  },
  { code: "require('re2')" }
)

function createValidator() {
  return new Ajv2020({
    strict: true,
    addUsedSchema: false,
    // Ajv's strict overlap check bypasses code.regExp; enforce it with RE2 below.
    allowMatchingProperties: true,
    code: { regExp },
  })
}

const MAX_COMPILATIONS = 128
let validator = createValidator()
let compilations = 0

export function compileContractSchema(
  schema: AnySchema
): ValidateFunction<unknown> {
  checkSchemaRegexes(schema)
  if (compilations === MAX_COMPILATIONS) {
    validator = createValidator()
    compilations = 0
  }
  compilations += 1
  return validator.compile<unknown>(schema)
}

function checkSchemaRegexes(schema: unknown): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return
  const entries: [string, unknown][] = Object.entries(schema)
  for (const [keyword, value] of entries) {
    if (keyword === "pattern" && typeof value === "string") regExp(value, "u")
    if (keyword === "patternProperties" && value && typeof value === "object") {
      for (const pattern of Object.keys(value)) {
        const regex = regExp(pattern, "u")
        if (
          !("properties" in schema) ||
          !schema.properties ||
          typeof schema.properties !== "object"
        )
          continue
        for (const property of Object.keys(schema.properties)) {
          if (regex.test(property))
            throw new Error(`property ${property} matches pattern ${pattern}`)
        }
      }
    }
    if (
      [
        "properties",
        "patternProperties",
        "$defs",
        "definitions",
        "dependentSchemas",
        "dependencies",
      ].includes(keyword) &&
      value &&
      typeof value === "object"
    ) {
      for (const child of Object.values(value)) checkSchemaRegexes(child)
    } else if (
      ["allOf", "anyOf", "oneOf", "prefixItems"].includes(keyword) &&
      Array.isArray(value)
    ) {
      for (const child of value) checkSchemaRegexes(child)
    } else if (
      [
        "items",
        "contains",
        "additionalProperties",
        "propertyNames",
        "not",
        "if",
        "then",
        "else",
        "unevaluatedProperties",
        "unevaluatedItems",
      ].includes(keyword)
    ) {
      checkSchemaRegexes(value)
    }
  }
}
