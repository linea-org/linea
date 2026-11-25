// Rotate whole compilers so cached tenant schemas and generated validators are collectible.
import Ajv2020 from "ajv/dist/2020.js"
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv"
import { mustRest, recordTime } from "./slow-schemas.js"
import { LIMIT_MS, runLimited, TimeLimitError } from "./time-limit.js"

export { runLimited, TimeLimitError }

export type ContractCheck = {
  (data: unknown): boolean
  errors?: Partial<ErrorObject>[] | null
}

const TOO_SLOW = [{ message: "took too long to check" }]

function createValidator() {
  const created = new Ajv2020({ strict: true, addUsedSchema: false })
  // Ajv builds its own schemas on first use, which must not count as a tenant schema's time.
  created.compile({})
  return created
}

const MAX_COMPILATIONS = 128
let validator = createValidator()
let compilations = 0
let isCompiling = false

// A compilation that was stopped never clears the flag and stays half done in its compiler.
function rotateValidator(): void {
  if (compilations < MAX_COMPILATIONS && !isCompiling) return
  validator = createValidator()
  compilations = 0
  isCompiling = false
}

function compile(schema: AnySchema): ValidateFunction<unknown> {
  compilations += 1
  isCompiling = true
  try {
    return validator.compile<unknown>(schema)
  } finally {
    isCompiling = false
  }
}

/** For authoring: throws when the schema is invalid or slow to compile. */
export function assertContractSchema(schema: AnySchema): void {
  rotateValidator()
  runLimited(() => compile(schema))
}

/** The check refuses data that takes too long to check, and throws when the schema is invalid. */
export function compileContractSchema(
  schema: AnySchema,
  workspaceId: string
): ContractCheck {
  const key = workspaceId + JSON.stringify(schema)
  let validate: ValidateFunction<unknown> | undefined
  const check: ContractCheck = (data) => {
    check.errors = TOO_SLOW
    if (mustRest(key)) return false
    rotateValidator()
    const before = process.threadCpuUsage()
    try {
      const valid = runLimited(() => {
        validate ??= compile(schema)
        return validate(data)
      })
      check.errors = validate?.errors
      return valid
    } catch (error) {
      if (!(error instanceof TimeLimitError)) throw error
      recordTime(key, LIMIT_MS)
      return false
    } finally {
      const { user, system } = process.threadCpuUsage(before)
      recordTime(key, (user + system) / 1000)
    }
  }
  return check
}
