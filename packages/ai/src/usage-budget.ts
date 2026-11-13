export const MAX_EXECUTION_TOKENS = 1_000_000

export function executionBudgetMessage(used: number): string {
  return `Execution used ${used} tokens, over its ${MAX_EXECUTION_TOKENS} token budget`
}
