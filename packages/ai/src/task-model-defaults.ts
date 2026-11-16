/** Used for conversation analysis when a workspace has not picked a model. */
export const DEFAULT_ANALYSIS_MODEL = "claude-haiku-4-5-20251001"

/** BYOK workspaces may configure only one provider, so the first keyed candidate grades. */
export const DEFAULT_JUDGE_MODEL_CANDIDATES = [
  "claude-haiku-4-5-20251001",
  "gpt-5-mini",
  "openai/gpt-oss-20b",
  "grok-4.5",
]
