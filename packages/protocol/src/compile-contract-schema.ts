// Rotate whole compilers so cached tenant schemas and generated validators are collectible.
import Ajv2020 from "ajv/dist/2020.js"
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv"
import { mustRest, recordTime } from "./slow-schemas.js"
import { runLimited, TimeLimitError } from "./time-limit.js"

export { runLimited, TimeLimitError }

export type ContractCheck = {
  (data: unknown): boolean
  errors?: Partial<ErrorObject>[] | null
}

const TOO_SLOW = [{ message: "took too long to check" }]

function createValidator() {
  return new Ajv2020({ strict: true, addUsedSchema: false })
}

const MAX_COMPILATIONS = 128
let validator = createValidator()
let compilations = 0

function compile(schema: AnySchema): ValidateFunction<unknown> {
  if (compilations >= MAX_COMPILATIONS) {
    validator = createValidator()
    compilations = 0
  }
  compilations += 1
  return validator.compile<unknown>(schema)
}

function runTimed<T>(schema: string, run: () => T): T {
  const started = performance.now()
  try {
    return runLimited(run)
  } catch (error) {
    // A compilation that was cut short stays half done in its compiler.
    if (error instanceof TimeLimitError) compilations = MAX_COMPILATIONS
    throw error
  } finally {
    recordTime(schema, performance.now() - started)
  }
}

/** For authoring: throws when the schema is invalid or slow to compile. */
export function assertContractSchema(schema: AnySchema): void {
  runTimed(JSON.stringify(schema), () => compile(schema))
}

/** The check refuses data that takes too long to check, and throws when the schema is invalid. */
export function compileContractSchema(schema: AnySchema): ContractCheck {
  const key = JSON.stringify(schema)
  let validate: ValidateFunction<unknown> | undefined
  const check: ContractCheck = (data) => {
    check.errors = TOO_SLOW
    if (mustRest(key)) return false
    try {
      const valid = runTimed(key, () => (validate ??= compile(schema))(data))
      check.errors = validate?.errors
      return valid
    } catch (error) {
      if (error instanceof TimeLimitError) return false
      throw error
    }
  }
  return check
}
