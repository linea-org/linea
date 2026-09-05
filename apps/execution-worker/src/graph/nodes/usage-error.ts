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
