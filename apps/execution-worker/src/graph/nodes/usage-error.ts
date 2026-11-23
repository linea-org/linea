import { executionBudgetMessage, MAX_EXECUTION_TOKENS } from "@linealabs/ai"
import type { NodeExecutionContext } from "./node-handler.interface"
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

export function assertWithinExecutionBudget(
  context: Pick<NodeExecutionContext, "countTokens">,
  tokensInput: number,
  tokensOutput: number
): void {
  const ownTokens = tokensInput + tokensOutput
  const used = context.countTokens?.(ownTokens) ?? ownTokens
  if (used >= MAX_EXECUTION_TOKENS) {
    throw new UsageError(
      executionBudgetMessage(used),
      tokensInput,
      tokensOutput
    )
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
