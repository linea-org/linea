export const MAX_EXECUTION_TOKENS = 1_000_000

export function executionBudgetMessage(used: number): string {
  return `Execution used ${used} tokens, over its ${MAX_EXECUTION_TOKENS} token budget`
}

/** Tokens a workspace may spend through the platform's own model key in 24 hours. */
export const PLATFORM_KEY_DAILY_TOKENS = 5_000_000

export function assertPlatformKeyBudget(usedTokens: number): void {
  if (usedTokens >= PLATFORM_KEY_DAILY_TOKENS)
    throw new PlatformKeyBudgetError()
}

export class PlatformKeyBudgetError extends Error {
  constructor() {
    super(
      "The platform model key's daily token allowance is used up. Add your own key under Settings, Models to keep running."
    )
    this.name = "PlatformKeyBudgetError"
  }
}
