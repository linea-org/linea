// Rotate whole compilers so cached tenant schemas and generated validators are collectible.
import Ajv2020 from "ajv/dist/2020.js"
import type { AnySchema, ValidateFunction } from "ajv"

const MAX_COMPILATIONS = 128
let validator = new Ajv2020({ strict: true, addUsedSchema: false })
let compilations = 0

export function compileContractSchema(
  schema: AnySchema
): ValidateFunction<unknown> {
  if (compilations === MAX_COMPILATIONS) {
    validator = new Ajv2020({ strict: true, addUsedSchema: false })
    compilations = 0
  }
  compilations += 1
  return validator.compile<unknown>(schema)
}
