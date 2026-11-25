// Rotate whole compilers so cached tenant schemas and generated validators are collectible.
import Ajv2020 from "ajv/dist/2020.js"
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv"
import { runLimited, TimeLimitError } from "./time-limit.js"

export { runLimited, TimeLimitError }

export type ContractCheck = {
  (data: unknown): boolean
  errors?: Partial<ErrorObject>[] | null
}

function createValidator() {
  return new Ajv2020({ strict: true, addUsedSchema: false })
}

const MAX_COMPILATIONS = 128
let validator = createValidator()
let compilations = 0

function compile(schema: AnySchema): ValidateFunction<unknown> {
  if (compilations === MAX_COMPILATIONS) {
    validator = createValidator()
    compilations = 0
  }
  compilations += 1
  try {
    return runLimited(() => validator.compile<unknown>(schema))
  } catch (error) {
    // Ajv keeps track of a compilation that was cut short, which would confuse the next one.
    if (error instanceof TimeLimitError) compilations = MAX_COMPILATIONS
    throw error
  }
}

/** The check refuses data that takes too long to check. */
export function compileContractSchema(schema: AnySchema): ContractCheck {
  const validate = compile(schema)
  const check: ContractCheck = (data) => {
    try {
      const valid = runLimited(() => validate(data))
      check.errors = validate.errors
      return valid
    } catch (error) {
      if (!(error instanceof TimeLimitError)) throw error
      check.errors = [{ message: "took too long to check" }]
      return false
    }
  }
  return check
}
