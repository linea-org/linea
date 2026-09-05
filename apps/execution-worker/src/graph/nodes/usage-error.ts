import { NonRetryableError } from "./non-retryable-error"

export class UsageError extends NonRetryableError {
  constructor(
    message: string,
    readonly tokensInput: number,
    readonly tokensOutput: number,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = "UsageError"
  }
}

export class RetryableUsageError extends Error {
  constructor(
    message: string,
    readonly tokensInput: number,
    readonly tokensOutput: number,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = "RetryableUsageError"
  }
}

export function getErrorTokenUsage(
  error: unknown
): { tokensInput: number; tokensOutput: number } | undefined {
  if (!(error instanceof UsageError || error instanceof RetryableUsageError)) {
    return undefined
  }
  return {
    tokensInput: error.tokensInput,
    tokensOutput: error.tokensOutput,
  }
}
